// Leads ⇄ Google Sheets two-way sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SHEET_TITLE = "Branta Tech · Leads";
const SHEET_TAB = "Leads";

// Columns pushed to / pulled from the sheet.
// Note: `contacts_json` and `socials_json` carry the full teammate / social
// arrays as JSON strings so a single row round-trips without data loss.
const HEADERS = [
  "id",
  "slug",
  "lead_code",
  "name",
  "role",
  "company",
  "email", // primary contact email
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
  "contacts_json",
  "socials_json",
  "last_activity_at",
];

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

async function getSyncRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ resource_id: string | null; last_sync_at: string | null } | null> {
  const { data } = await supabase
    .from("integration_sync_state")
    .select("resource_id, last_sync_at")
    .eq("kind", "leads_sheet")
    .maybeSingle();
  return data ?? null;
}

async function upsertSync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  patch: { resource_id?: string; last_sync_at?: string },
) {
  await supabase
    .from("integration_sync_state")
    .upsert(
      { kind: "leads_sheet", ...patch, updated_at: new Date().toISOString() },
      { onConflict: "kind" },
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureSheet(supabase: any): Promise<string> {
  const existing = await getSyncRow(supabase);
  const { callGateway } = await import("@/lib/connector-gateway.server");
  if (existing?.resource_id) {
    // Always keep the header row aligned with the current HEADERS list so
    // pulls/pushes stay stable if columns are added over time.
    await callGateway({
      connector: "google_sheets",
      path: `/v4/spreadsheets/${existing.resource_id}/values/${SHEET_TAB}!A1:${LAST_COL}1`,
      method: "PUT",
      query: { valueInputOption: "RAW" },
      body: { values: [HEADERS] },
    });
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
  await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${created.spreadsheetId}/values/${SHEET_TAB}!A1:${LAST_COL}1`,
    method: "PUT",
    query: { valueInputOption: "RAW" },
    body: { values: [HEADERS] },
  });
  await upsertSync(supabase, { resource_id: created.spreadsheetId });
  return created.spreadsheetId;
}

type ContactRow = {
  id: string;
  lead_id: string;
  name: string | null;
  role: string | null;
  email: string;
  email_label: string | null;
  alt_email: string | null;
  alt_email_label: string | null;
  phone: string | null;
  phone_label: string | null;
  alt_phone: string | null;
  alt_phone_label: string | null;
  contact_preference: string | null;
  label: string | null;
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
    .select(
      "id, lead_id, name, role, email, email_label, alt_email, alt_email_label, phone, phone_label, alt_phone, alt_phone_label, contact_preference, label, is_primary",
    )
    .in("lead_id", leadIds)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
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
  await supabase.from("lead_contacts").update({ is_primary: false }).eq("lead_id", leadId);
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

export const pushLeadsToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SheetSyncStatus> => {
    const sheetId = await ensureSheet(context.supabase);
    const { data: leads, error } = await context.supabase
      .from("leads")
      .select(
        "id, slug, lead_code, name, role, company, phone, phone_label, alt_phone, alt_phone_label, email_label, alt_email, alt_email_label, contact_preference, status, source, source_other, service, service_other, value_usd, currency, next_action, notes, last_activity_at",
      )
      .order("slug", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    const leadRows = (leads ?? []) as Array<Record<string, unknown> & { id: string }>;
    const ids = leadRows.map((l) => l.id);
    const contactsMap = await fetchContactsMap(context.supabase, ids);
    const socialsMap = await fetchSocialsMap(context.supabase, ids);
    const rows = leadRows.map((l) => {
      const contacts = contactsMap.get(l.id) ?? [];
      const primary =
        contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
      const socials = socialsMap.get(l.id) ?? [];
      return HEADERS.map((h) => {
        if (h === "email") return primary?.email ?? "";
        if (h === "contacts_json")
          return contacts.length ? JSON.stringify(contacts) : "";
        if (h === "socials_json")
          return socials.length ? JSON.stringify(socials) : "";
        const v = l[h];
        return v == null ? "" : String(v);
      });
    });
    const { callGateway } = await import("@/lib/connector-gateway.server");
    await callGateway({
      connector: "google_sheets",
      path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A2:${LAST_COL}100000:clear`,
      method: "POST",
      body: {},
    });
    if (rows.length > 0) {
      await callGateway({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A2:${LAST_COL}${1 + rows.length}`,
        method: "PUT",
        query: { valueInputOption: "RAW" },
        body: { values: rows },
      });
    }
    const now = new Date().toISOString();
    await upsertSync(context.supabase, {
      resource_id: sheetId,
      last_sync_at: now,
    });
    await context.supabase
      .from("leads")
      .update({ synced_at: now })
      .in("id", ids);
    return {
      spreadsheetId: sheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      lastSyncAt: now,
    };
  });

export const pullLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<SheetSyncStatus & { updated: number; created: number }> => {
      const sheetId = await ensureSheet(context.supabase);
      const { callGateway } = await import("@/lib/connector-gateway.server");
      const range = `${SHEET_TAB}!A2:${LAST_COL}100000`;
      const resp = await callGateway<{ values?: string[][] }>({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${range}`,
      });
      const values = resp.values ?? [];
      let updated = 0;
      let created = 0;
      const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const ALLOWED_STATUS = new Set([
        "new",
        "contacted",
        "viewed",
        "meeting",
        "converted",
        "lost",
      ]);
      for (const row of values) {
        const rec: Record<string, string | null> = {};
        HEADERS.forEach((h, i) => {
          const v = row[i];
          rec[h] = v == null ? null : String(v).trim() || null;
        });
        if (!rec.name) continue;
        const statusRaw = (rec.status ?? "new").toLowerCase();
        const status = (ALLOWED_STATUS.has(statusRaw) ? statusRaw : "new") as
          | "new"
          | "contacted"
          | "viewed"
          | "meeting"
          | "converted"
          | "lost";
        const emailFromSheet = rec.email && rec.email.includes("@") ? rec.email : null;
        const leadPatch = {
          name: rec.name,
          role: rec.role || null,
          company: rec.company || null,
          phone: rec.phone || null,
          phone_label: rec.phone_label || null,
          alt_phone: rec.alt_phone || null,
          alt_phone_label: rec.alt_phone_label || null,
          email_label: rec.email_label || null,
          alt_email: rec.alt_email || null,
          alt_email_label: rec.alt_email_label || null,
          contact_preference: rec.contact_preference || null,
          status,
          source: rec.source || null,
          source_other: rec.source_other || null,
          service: rec.service || null,
          service_other: rec.service_other || null,
          value_usd:
            rec.value_usd && !Number.isNaN(Number(rec.value_usd))
              ? Number(rec.value_usd)
              : null,
          currency:
            rec.currency && ["BDT", "USD"].includes(rec.currency.toUpperCase())
              ? (rec.currency.toUpperCase() as "BDT" | "USD")
              : "BDT",
          next_action: rec.next_action || null,
          notes: rec.notes || null,
        };

        // Resolve existing row: prefer UUID id, then slug, then lead_code.
        let existingId: string | null = null;
        if (rec.id && UUID_RE.test(rec.id)) {
          existingId = rec.id;
        } else if (rec.slug) {
          const { data: found } = await context.supabase
            .from("leads")
            .select("id")
            .ilike("slug", rec.slug)
            .maybeSingle();
          if (found?.id) existingId = found.id;
        } else if (rec.lead_code) {
          const code = rec.lead_code.startsWith("L-")
            ? rec.lead_code
            : `L-${rec.lead_code.padStart(4, "0")}`;
          const { data: found } = await context.supabase
            .from("leads")
            .select("id")
            .eq("lead_code", code)
            .maybeSingle();
          if (found?.id) existingId = found.id;
        }

        if (existingId) {
          const { error, count } = await context.supabase
            .from("leads")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update(leadPatch as any, { count: "exact" })
            .eq("id", existingId);
          if (!error && (count ?? 0) > 0) updated += 1;
          if (emailFromSheet)
            await upsertPrimaryContact(context.supabase, existingId, emailFromSheet, context.userId);
        } else {
          const { data: inserted, error } = await context.supabase
            .from("leads")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert({ ...leadPatch, created_by: context.userId } as any)
            .select("id")
            .single();
          if (!error && inserted?.id) {
            created += 1;
            if (emailFromSheet)
              await upsertPrimaryContact(context.supabase, inserted.id, emailFromSheet, context.userId);
          } else if (error) {
            console.error("[sheet-pull] insert failed", error.message, leadPatch);
          }
        }
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
        updated,
        created,
      };
    },
  );
