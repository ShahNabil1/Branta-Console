// Leads ⇄ Google Sheets two-way sync (v2 template).
//
// Design:
//  • Sheet is the *input surface* — Lead code / slug / id are never entered
//    by hand. They are assigned on pull and written back into `assigned_slug`
//    so the same row is not re-imported. Existing rows can still be pushed
//    from the DB by keying on `assigned_slug`.
//  • Social links use per-platform columns with a Google Sheets dropdown
//    matching the app's platform list.
//  • Dedup on pull: rows whose email OR phone matches an existing lead
//    (across leads + lead_contacts) are skipped and returned as
//    `skippedDuplicates` with the matching lead slug for user review.
//    The dashboard then offers an Overwrite step to import them anyway.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SHEET_TITLE = "Branta Tech · Leads";
const SHEET_TAB = "Leads";

// Header order matters — do not reshuffle without a migration path.
const HEADERS = [
  "name",
  "role",
  "company",
  "email",
  "email_label",
  "alt_email",
  "alt_email_label",
  "phone",
  "phone_label",
  "alt_phone",
  "alt_phone_label",
  "contact_preference",
  "status",
  "source",
  "source_other",
  "service",
  "service_other",
  "value_usd",
  "currency",
  "next_action",
  "notes",
  "social_1_platform",
  "social_1_url",
  "social_1_label",
  "social_2_platform",
  "social_2_url",
  "social_2_label",
  "social_3_platform",
  "social_3_url",
  "social_3_label",
  "social_4_platform",
  "social_4_url",
  "social_4_label",
  "social_5_platform",
  "social_5_url",
  "social_5_label",
  "assigned_slug",
  "imported_at",
] as const;

type Header = (typeof HEADERS)[number];

const SOCIAL_PLATFORMS = [
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "youtube",
  "x",
  "tiktok",
  "whatsapp",
  "telegram",
] as const;

const CURRENCIES = ["BDT", "USD"] as const;

const COL_INDEX: Record<Header, number> = HEADERS.reduce(
  (acc, h, i) => {
    acc[h] = i;
    return acc;
  },
  {} as Record<Header, number>,
);

function colLetters(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "A";
}
const LAST_COL = colLetters(HEADERS.length);

function normEmail(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return s.includes("@") ? s : null;
}
function normPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D+/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10); // last 10 digits — matches BD/intl variations
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSyncRow(supabase: any) {
  const { data } = await supabase
    .from("integration_sync_state")
    .select("resource_id, last_sync_at")
    .eq("kind", "leads_sheet")
    .maybeSingle();
  return (data ?? null) as {
    resource_id: string | null;
    last_sync_at: string | null;
  } | null;
}

async function upsertSync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  patch: { resource_id?: string; last_sync_at?: string },
) {
  await supabase.from("integration_sync_state").upsert(
    {
      kind: "leads_sheet",
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kind" },
  );
}

// ---------- Dropdown / formatting ----------

type SelectValues = { column: Header; values: string[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchDropdownData(supabase: any): Promise<SelectValues[]> {
  const [statuses, sources, services] = await Promise.all([
    supabase
      .from("lead_status_options")
      .select("key")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("lead_source_options")
      .select("key")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("lead_service_options" as any)
      .select("key")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  const statusVals = ((statuses.data ?? []) as { key: string }[]).map(
    (r) => r.key,
  );
  const sourceVals = ((sources.data ?? []) as { key: string }[]).map(
    (r) => r.key,
  );
  const serviceVals = ((services.data ?? []) as { key: string }[]).map(
    (r) => r.key,
  );
  const out: SelectValues[] = [
    { column: "status", values: statusVals.length ? statusVals : ["new"] },
    { column: "source", values: sourceVals },
    { column: "service", values: serviceVals },
    { column: "currency", values: [...CURRENCIES] },
  ];
  // Social platform columns share the same list.
  for (let i = 1; i <= 5; i += 1) {
    out.push({
      column: `social_${i}_platform` as Header,
      values: [...SOCIAL_PLATFORMS],
    });
  }
  return out;
}

async function applyValidationsAndFormatting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callGateway: any,
  spreadsheetId: string,
  selects: SelectValues[],
) {
  const meta = await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${spreadsheetId}`,
    query: { fields: "sheets(properties(sheetId,title))" },
  });
  const tab = (meta.sheets ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => s.properties?.title === SHEET_TAB,
  );
  const sheetId = tab?.properties?.sheetId;
  if (sheetId == null) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests: any[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 },
        },
        fields:
          "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.13, green: 0.13, blue: 0.15 },
            horizontalAlignment: "LEFT",
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 11,
            },
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: HEADERS.length,
        },
      },
    },
  ];

  for (const sel of selects) {
    const colIdx = COL_INDEX[sel.column];
    if (colIdx == null || sel.values.length === 0) continue;
    requests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 5000,
          startColumnIndex: colIdx,
          endColumnIndex: colIdx + 1,
        },
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: sel.values.map((v) => ({ userEnteredValue: v })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    });
  }

  await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    method: "POST",
    body: { requests },
  }).catch(() => {});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureSheet(supabase: any): Promise<string> {
  const existing = await getSyncRow(supabase);
  const { callGateway } = await import("@/lib/connector-gateway.server");
  const selects = await fetchDropdownData(supabase);
  const writeHeaders = async (spreadsheetId: string) => {
    await callGateway({
      connector: "google_sheets",
      path: `/v4/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}!A1:${LAST_COL}1`,
      method: "PUT",
      query: { valueInputOption: "RAW" },
      body: { values: [HEADERS as unknown as string[]] },
    });
    await applyValidationsAndFormatting(callGateway, spreadsheetId, selects);
  };
  if (existing?.resource_id) {
    await writeHeaders(existing.resource_id);
    return existing.resource_id;
  }
  const created = await callGateway<{ spreadsheetId: string }>({
    connector: "google_sheets",
    path: "/v4/spreadsheets",
    method: "POST",
    body: {
      properties: { title: SHEET_TITLE },
      sheets: [{ properties: { title: SHEET_TAB } }],
    },
  });
  await writeHeaders(created.spreadsheetId);
  await upsertSync(supabase, { resource_id: created.spreadsheetId });
  return created.spreadsheetId;
}

// ---------- Fetch helpers ----------

type ContactRow = {
  id: string;
  lead_id: string;
  email: string;
  alt_email: string | null;
  phone: string | null;
  alt_phone: string | null;
  is_primary: boolean;
};
type SocialRow = {
  lead_id: string;
  platform: string;
  url: string;
  label: string | null;
  sort_order: number | null;
};

async function fetchContactsMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  leadIds: string[],
): Promise<Map<string, ContactRow[]>> {
  const map = new Map<string, ContactRow[]>();
  if (leadIds.length === 0) return map;
  const { data } = await supabase
    .from("lead_contacts")
    .select("id, lead_id, email, alt_email, phone, alt_phone, is_primary")
    .in("lead_id", leadIds)
    .order("is_primary", { ascending: false });
  (data ?? []).forEach((c: ContactRow) => {
    const arr = map.get(c.lead_id) ?? [];
    arr.push(c);
    map.set(c.lead_id, arr);
  });
  return map;
}

async function fetchSocialsMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  leadIds: string[],
): Promise<Map<string, SocialRow[]>> {
  const map = new Map<string, SocialRow[]>();
  if (leadIds.length === 0) return map;
  const { data } = await supabase
    .from("lead_social_links")
    .select("lead_id, platform, url, label, sort_order")
    .in("lead_id", leadIds)
    .order("sort_order", { ascending: true });
  (data ?? []).forEach((s: SocialRow) => {
    const arr = map.get(s.lead_id) ?? [];
    arr.push(s);
    map.set(s.lead_id, arr);
  });
  return map;
}

async function upsertPrimaryContact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  leadId: string,
  email: string,
  userId: string,
) {
  await supabase
    .from("lead_contacts")
    .update({ is_primary: false })
    .eq("lead_id", leadId);
  await supabase.from("lead_contacts").upsert(
    {
      lead_id: leadId,
      email,
      label: "Primary",
      is_primary: true,
      created_by: userId,
    },
    { onConflict: "lead_id,email" },
  );
}

// ---------- Dedup index ----------

type DupIndex = {
  byEmail: Map<string, { slug: string; name: string }>;
  byPhone: Map<string, { slug: string; name: string }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildDupIndex(supabase: any): Promise<DupIndex> {
  const byEmail = new Map<string, { slug: string; name: string }>();
  const byPhone = new Map<string, { slug: string; name: string }>();

  const { data: leads } = await supabase
    .from("leads")
    .select("id, slug, name, alt_email, phone, alt_phone")
    .limit(20000);

  const idToMeta = new Map<string, { slug: string; name: string }>();
  (leads ?? []).forEach(
    (l: {
      id: string;
      slug: string;
      name: string;
      alt_email: string | null;
      phone: string | null;
      alt_phone: string | null;
    }) => {
      const meta = { slug: l.slug, name: l.name };
      idToMeta.set(l.id, meta);
      const e = normEmail(l.alt_email);
      if (e && !byEmail.has(e)) byEmail.set(e, meta);
      const p1 = normPhone(l.phone);
      if (p1 && !byPhone.has(p1)) byPhone.set(p1, meta);
      const p2 = normPhone(l.alt_phone);
      if (p2 && !byPhone.has(p2)) byPhone.set(p2, meta);
    },
  );

  const { data: contacts } = await supabase
    .from("lead_contacts")
    .select("lead_id, email, alt_email, phone, alt_phone")
    .limit(50000);
  (contacts ?? []).forEach(
    (c: {
      lead_id: string;
      email: string | null;
      alt_email: string | null;
      phone: string | null;
      alt_phone: string | null;
    }) => {
      const meta = idToMeta.get(c.lead_id);
      if (!meta) return;
      const e1 = normEmail(c.email);
      if (e1 && !byEmail.has(e1)) byEmail.set(e1, meta);
      const e2 = normEmail(c.alt_email);
      if (e2 && !byEmail.has(e2)) byEmail.set(e2, meta);
      const p1 = normPhone(c.phone);
      if (p1 && !byPhone.has(p1)) byPhone.set(p1, meta);
      const p2 = normPhone(c.alt_phone);
      if (p2 && !byPhone.has(p2)) byPhone.set(p2, meta);
    },
  );

  return { byEmail, byPhone };
}

// ---------- Public status ----------

export interface SheetSyncStatus {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  lastSyncAt: string | null;
}

export const getSheetSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SheetSyncStatus> => {
    const row = await getSyncRow(context.supabase);
    return {
      spreadsheetId: row?.resource_id ?? null,
      spreadsheetUrl: row?.resource_id
        ? `https://docs.google.com/spreadsheets/d/${row.resource_id}/edit`
        : null,
      lastSyncAt: row?.last_sync_at ?? null,
    };
  });

// Repair the sheet template (re-write headers + validations) and clear any
// data rows that were written under an older column layout. Returns the URL
// so the button can open a guaranteed-current sheet.
export const openLeadSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const { callGateway } = await import("@/lib/connector-gateway.server");
    const existing = await getSyncRow(context.supabase);
    if (existing?.resource_id) {
      // Check row 1 — if it doesn't match the current HEADERS, the data rows
      // below are laid out against the OLD template and are misaligned.
      try {
        const row1 = await callGateway<{ values?: string[][] }>({
          connector: "google_sheets",
          path: `/v4/spreadsheets/${existing.resource_id}/values/${SHEET_TAB}!A1:${LAST_COL}1`,
        });
        const current = row1.values?.[0] ?? [];
        const matches =
          current.length === HEADERS.length &&
          HEADERS.every((h, i) => (current[i] ?? "") === h);
        if (!matches) {
          await callGateway({
            connector: "google_sheets",
            path: `/v4/spreadsheets/${existing.resource_id}/values/${SHEET_TAB}!A2:${LAST_COL}100000:clear`,
            method: "POST",
            body: {},
          }).catch(() => {});
        }
      } catch {
        /* ignore probe failure — ensureSheet will overwrite headers anyway */
      }
    }
    const id = await ensureSheet(context.supabase);
    return { url: `https://docs.google.com/spreadsheets/d/${id}/edit` };
  });


// ---------- Row builders ----------

function buildRow(
  lead: Record<string, unknown> & { id: string; slug: string },
  contacts: ContactRow[],
  socials: SocialRow[],
): string[] {
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
  const socialSlots = socials.slice(0, 5);
  const rec: Record<Header, string> = {} as Record<Header, string>;
  for (const h of HEADERS) rec[h] = "";
  rec.name = String(lead.name ?? "");
  rec.role = String(lead.role ?? "");
  rec.company = String(lead.company ?? "");
  rec.email = primary?.email ?? "";
  rec.email_label = String(lead.email_label ?? "");
  rec.alt_email = String(lead.alt_email ?? "");
  rec.alt_email_label = String(lead.alt_email_label ?? "");
  rec.phone = String(lead.phone ?? "");
  rec.phone_label = String(lead.phone_label ?? "");
  rec.alt_phone = String(lead.alt_phone ?? "");
  rec.alt_phone_label = String(lead.alt_phone_label ?? "");
  rec.contact_preference = String(lead.contact_preference ?? "");
  rec.status = String(lead.status ?? "");
  rec.source = String(lead.source ?? "");
  rec.source_other = String(lead.source_other ?? "");
  rec.service = String(lead.service ?? "");
  rec.service_other = String(lead.service_other ?? "");
  rec.value_usd = lead.value_usd == null ? "" : String(lead.value_usd);
  rec.currency = String(lead.currency ?? "");
  rec.next_action = String(lead.next_action ?? "");
  rec.notes = String(lead.notes ?? "");
  socialSlots.forEach((s, i) => {
    const n = i + 1;
    (rec[`social_${n}_platform` as Header] as string) = s.platform ?? "";
    (rec[`social_${n}_url` as Header] as string) = s.url ?? "";
    (rec[`social_${n}_label` as Header] as string) = s.label ?? "";
  });
  rec.assigned_slug = String(lead.slug ?? "");
  rec.imported_at = String(lead.last_activity_at ?? "");
  return HEADERS.map((h) => rec[h] ?? "");
}

// ---------- PUSH ----------

export const pushLeadsToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<
      SheetSyncStatus & { appended: number; updated: number; skipped: number }
    > => {
      const sheetId = await ensureSheet(context.supabase);
      const { callGateway } = await import("@/lib/connector-gateway.server");
      const range = `${SHEET_TAB}!A2:${LAST_COL}100000`;
      const existing = await callGateway<{ values?: string[][] }>({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${range}`,
      });
      const existingRows = existing.values ?? [];
      const slugToRow = new Map<
        string,
        { rowIndex: number; values: string[] }
      >();
      existingRows.forEach((r, i) => {
        const slug = (r[COL_INDEX.assigned_slug] ?? "").trim();
        if (slug) slugToRow.set(slug.toLowerCase(), { rowIndex: i + 2, values: r });
      });

      const { data: leads, error } = await context.supabase
        .from("leads")
        .select(
          "id, slug, lead_code, name, role, company, phone, phone_label, alt_phone, alt_phone_label, email_label, alt_email, alt_email_label, contact_preference, status, source, source_other, service, service_other, value_usd, currency, next_action, notes, last_activity_at",
        )
        .order("slug", { ascending: true })
        .limit(5000);
      if (error) throw new Error(error.message);
      const leadRows = (leads ?? []) as Array<
        Record<string, unknown> & { id: string; slug: string }
      >;
      const ids = leadRows.map((l) => l.id);
      const contactsMap = await fetchContactsMap(context.supabase, ids);
      const socialsMap = await fetchSocialsMap(context.supabase, ids);

      const updates: { range: string; values: string[][] }[] = [];
      const appends: string[][] = [];
      let skipped = 0;

      for (const l of leadRows) {
        const row = buildRow(
          l,
          contactsMap.get(l.id) ?? [],
          socialsMap.get(l.id) ?? [],
        );
        const seen = slugToRow.get(String(l.slug ?? "").toLowerCase());
        if (seen) {
          const changed = row.some((v, i) => (seen.values[i] ?? "") !== v);
          if (changed) {
            updates.push({
              range: `${SHEET_TAB}!A${seen.rowIndex}:${LAST_COL}${seen.rowIndex}`,
              values: [row],
            });
          } else {
            skipped += 1;
          }
        } else {
          appends.push(row);
        }
      }

      if (updates.length > 0) {
        await callGateway({
          connector: "google_sheets",
          path: `/v4/spreadsheets/${sheetId}/values:batchUpdate`,
          method: "POST",
          body: { valueInputOption: "RAW", data: updates },
        });
      }
      if (appends.length > 0) {
        await callGateway({
          connector: "google_sheets",
          path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A:${LAST_COL}:append`,
          method: "POST",
          query: {
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
          },
          body: { values: appends },
        });
      }

      const now = new Date().toISOString();
      await upsertSync(context.supabase, {
        resource_id: sheetId,
        last_sync_at: now,
      });
      return {
        spreadsheetId: sheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
        lastSyncAt: now,
        appended: appends.length,
        updated: updates.length,
        skipped,
      };
    },
  );

// ---------- PULL ----------

const ALLOWED_STATUS_FALLBACK = new Set([
  "new",
  "contacted",
  "viewed",
  "qualified",
  "meeting",
  "proposal_sent",
  "negotiation",
  "on_hold",
  "converted",
  "lost",
]);

export interface SheetDuplicate {
  row: number; // sheet row number (1-based, includes header)
  name: string;
  email: string | null;
  phone: string | null;
  matchedSlug: string;
  matchedName: string;
  matchedOn: "email" | "phone" | "both";
}

export interface PullResult extends SheetSyncStatus {
  created: number;
  updated: number;
  skipped: number;
  skippedDuplicates: SheetDuplicate[];
}

type SheetRec = Record<Header, string | null>;

function parseSheetRow(row: string[]): SheetRec {
  const rec: SheetRec = {} as SheetRec;
  HEADERS.forEach((h, i) => {
    const v = row[i];
    rec[h] = v == null ? null : String(v).trim() || null;
  });
  return rec;
}

async function insertLeadFromRec(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  rec: SheetRec,
  allowedStatus: Set<string>,
  allowedSources: Set<string>,
  allowedServices: Set<string>,
): Promise<{ id: string; slug: string; lead_code: string } | null> {
  const statusRaw = (rec.status ?? "new").toLowerCase();
  const status = allowedStatus.has(statusRaw) ? statusRaw : "new";
  const source =
    rec.source && allowedSources.has(rec.source) ? rec.source : null;
  const service =
    rec.service && allowedServices.has(rec.service) ? rec.service : null;
  const emailFromSheet = normEmail(rec.email);
  const leadPatch = {
    name: rec.name,
    role: rec.role,
    company: rec.company,
    phone: rec.phone,
    phone_label: rec.phone_label,
    alt_phone: rec.alt_phone,
    alt_phone_label: rec.alt_phone_label,
    email_label: rec.email_label,
    alt_email: rec.alt_email,
    alt_email_label: rec.alt_email_label,
    contact_preference: rec.contact_preference,
    status,
    source,
    source_other: rec.source_other,
    service,
    service_other: rec.service_other,
    value_usd:
      rec.value_usd && !Number.isNaN(Number(rec.value_usd))
        ? Number(rec.value_usd)
        : null,
    currency:
      rec.currency && CURRENCIES.includes(rec.currency.toUpperCase() as "BDT" | "USD")
        ? (rec.currency.toUpperCase() as "BDT" | "USD")
        : "BDT",
    next_action: rec.next_action,
    notes: rec.notes,
  };
  const { data: inserted, error } = await supabase
    .from("leads")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      ...leadPatch,
      created_by: userId,
      is_draft: false,
      sheet_source: "google_sheets",
      sheet_sync_status: "synced",
      sheet_synced_at: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id, slug, lead_code")
    .single();
  if (error || !inserted?.id) {
    console.error("[sheet-pull] insert failed", error?.message, leadPatch);
    return null;
  }
  if (emailFromSheet) {
    await upsertPrimaryContact(supabase, inserted.id, emailFromSheet, userId);
  }
  await supabase.from("lead_activities").insert({
    lead_id: inserted.id,
    actor_id: userId,
    kind: "created",
    body: "Lead pulled from Google Sheets",
    meta: { source: "google_sheets" },
  } as never);
  // Social links (up to 5 slots)
  const socialInserts: {
    lead_id: string;
    platform: string;
    url: string;
    label: string | null;
    sort_order: number;
    created_by: string;
  }[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const plat = rec[`social_${i}_platform` as Header];
    const url = rec[`social_${i}_url` as Header];
    const label = rec[`social_${i}_label` as Header];
    if (plat && url) {
      socialInserts.push({
        lead_id: inserted.id,
        platform: String(plat).toLowerCase(),
        url: String(url),
        label: label ?? null,
        sort_order: i,
        created_by: userId,
      });
    }
  }
  if (socialInserts.length > 0) {
    await supabase.from("lead_social_links").insert(socialInserts);
  }
  return inserted as { id: string; slug: string; lead_code: string };
}

async function pullCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { supabase: any; userId: string },
  options: { overwriteRows?: Set<number> },
): Promise<PullResult> {
  const sheetId = await ensureSheet(context.supabase);
  const { callGateway } = await import("@/lib/connector-gateway.server");
  const range = `${SHEET_TAB}!A2:${LAST_COL}100000`;
  const resp = await callGateway<{ values?: string[][] }>({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${sheetId}/values/${range}`,
  });
  const values = resp.values ?? [];

  const [{ data: statusOpts }, { data: sourceOpts }, { data: serviceOpts }] =
    await Promise.all([
      context.supabase
        .from("lead_status_options")
        .select("key")
        .eq("is_active", true),
      context.supabase
        .from("lead_source_options")
        .select("key")
        .eq("is_active", true),
      context.supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("lead_service_options" as any)
        .select("key")
        .eq("is_active", true),
    ]);
  const allowedStatus = new Set<string>(
    ((statusOpts ?? []) as { key: string }[]).map((r) => r.key),
  );
  if (allowedStatus.size === 0) {
    ALLOWED_STATUS_FALLBACK.forEach((s) => allowedStatus.add(s));
  }
  const allowedSources = new Set<string>(
    ((sourceOpts ?? []) as { key: string }[]).map((r) => r.key),
  );
  const allowedServices = new Set<string>(
    ((serviceOpts ?? []) as { key: string }[]).map((r) => r.key),
  );

  const dupIndex = await buildDupIndex(context.supabase);

  let created = 0;
  let skipped = 0;
  const skippedDuplicates: SheetDuplicate[] = [];
  const writebacks: { rowIndex: number; slug: string; ts: string }[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const row = values[i];
    const rowIndex = i + 2;
    const rec = parseSheetRow(row);
    if (!rec.name) {
      skipped += 1;
      continue;
    }
    // Already imported (assigned_slug is filled in the sheet).
    if (rec.assigned_slug) {
      skipped += 1;
      continue;
    }

    const email = normEmail(rec.email);
    const phone = normPhone(rec.phone) ?? normPhone(rec.alt_phone);
    const eMatch = email ? dupIndex.byEmail.get(email) ?? null : null;
    const pMatch = phone ? dupIndex.byPhone.get(phone) ?? null : null;
    const matched = eMatch ?? pMatch;
    const overrideThis = options.overwriteRows?.has(rowIndex) ?? false;
    if (matched && !overrideThis) {
      skippedDuplicates.push({
        row: rowIndex,
        name: rec.name,
        email: rec.email,
        phone: rec.phone ?? rec.alt_phone,
        matchedSlug: matched.slug,
        matchedName: matched.name,
        matchedOn:
          eMatch && pMatch ? "both" : eMatch ? "email" : "phone",
      });
      skipped += 1;
      continue;
    }

    const inserted = await insertLeadFromRec(
      context.supabase,
      context.userId,
      rec,
      allowedStatus,
      allowedSources,
      allowedServices,
    );
    if (inserted) {
      created += 1;
      writebacks.push({
        rowIndex,
        slug: inserted.slug ?? "",
        ts: new Date().toISOString(),
      });
      // Register in local dup index so subsequent rows in same pull dedup too.
      if (email) {
        dupIndex.byEmail.set(email, {
          slug: inserted.slug ?? "",
          name: rec.name!,
        });
      }
      if (phone) {
        dupIndex.byPhone.set(phone, {
          slug: inserted.slug ?? "",
          name: rec.name!,
        });
      }
    } else {
      skipped += 1;
    }
  }

  if (writebacks.length > 0) {
    const slugCol = colLetters(COL_INDEX.assigned_slug + 1);
    const tsCol = colLetters(COL_INDEX.imported_at + 1);
    const data = writebacks.map((w) => ({
      range: `${SHEET_TAB}!${slugCol}${w.rowIndex}:${tsCol}${w.rowIndex}`,
      values: [[w.slug, w.ts]],
    }));
    await callGateway({
      connector: "google_sheets",
      path: `/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      method: "POST",
      body: { valueInputOption: "RAW", data },
    }).catch((e) => console.error("[sheet-pull] writeback failed", e));
  }

  const now = new Date().toISOString();
  await upsertSync(context.supabase, {
    resource_id: sheetId,
    last_sync_at: now,
  });
  return {
    spreadsheetId: sheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    lastSyncAt: now,
    created,
    updated: 0,
    skipped,
    skippedDuplicates,
  };
}

export const pullLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PullResult> => {
    return pullCore(context, {});
  });

export const overwritePullDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ rows: z.array(z.number().int().min(2)).min(1).max(500) })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<PullResult> => {
    return pullCore(context, { overwriteRows: new Set(data.rows) });
  });

// ---------- Manual dup check (dashboard) ----------

export const findLeadDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        excludeLeadId: z.string().uuid().optional().nullable(),
      })
      .parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      slug: string;
      name: string;
      matchedOn: "email" | "phone" | "both";
    } | null> => {
      const email = normEmail(data.email);
      const phone = normPhone(data.phone);
      if (!email && !phone) return null;
      const idx = await buildDupIndex(context.supabase);
      const eMatch = email ? idx.byEmail.get(email) ?? null : null;
      const pMatch = phone ? idx.byPhone.get(phone) ?? null : null;
      const match = eMatch ?? pMatch;
      if (!match) return null;
      // Exclude the lead the user is currently editing.
      if (data.excludeLeadId) {
        const { data: cur } = await context.supabase
          .from("leads")
          .select("slug")
          .eq("id", data.excludeLeadId)
          .maybeSingle();
        if (cur?.slug && cur.slug === match.slug) return null;
      }
      return {
        slug: match.slug,
        name: match.name,
        matchedOn: eMatch && pMatch ? "both" : eMatch ? "email" : "phone",
      };
    },
  );

// ---------- Single-lead auto sync + retry ----------

/**
 * Retry pushing a single lead's row to the Google Sheet. Available to users
 * with lead_manage permission (or super_admin). Updates leads.sheet_sync_*.
 */
export const retryLeadSheetSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _perm: "lead_manage",
    });
    if (!canManage) {
      const { data: isSA } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "super_admin",
      });
      if (!isSA) throw new Error("Forbidden: lead_manage required");
    }
    const { autoSyncLead } = await import("@/lib/leads-sheets.server");
    await autoSyncLead(context.supabase, data.leadId);
    const { data: row } = await context.supabase
      .from("leads")
      .select("sheet_sync_status, sheet_synced_at, sheet_sync_error")
      .eq("id", data.leadId)
      .maybeSingle();
    return (row ?? { sheet_sync_status: "failed" }) as {
      sheet_sync_status: string;
      sheet_synced_at: string | null;
      sheet_sync_error: string | null;
    };
  });

