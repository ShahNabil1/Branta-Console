// Leads ⇄ Google Sheets two-way sync.
//
// Strict dedup semantics:
//  • push: rows whose `id` already exists in the sheet are updated in place
//    only when their serialized values changed. Leads not in the sheet are
//    appended. Nothing is ever cleared, so manually-typed rows survive.
//  • pull: rows whose `id` already resolves to a lead in the database are
//    skipped (already-pulled). Only sheet rows with no `id` — i.e. manually
//    added — get inserted, and the generated id/slug/lead_code are written
//    back into that same row so a second pull won't duplicate them.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SHEET_TITLE = "Branta Tech · Leads";
const SHEET_TAB = "Leads";

const HEADERS = [
  "id",
  "slug",
  "lead_code",
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
  "contacts_json",
  "socials_json",
  "last_activity_at",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
const ID_COL_INDEX = HEADERS.indexOf("id");
const SLUG_COL_INDEX = HEADERS.indexOf("slug");
const CODE_COL_INDEX = HEADERS.indexOf("lead_code");

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
async function applySheetFormatting(callGateway: any, spreadsheetId: string) {
  // Grab the tab's numeric sheetId, then apply header formatting + freeze.
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
  await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    method: "POST",
    body: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 3 } },
            fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
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
            dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS.length },
          },
        },
      ],
    },
  }).catch(() => {});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureSheet(supabase: any): Promise<string> {
  const existing = await getSyncRow(supabase);
  const { callGateway } = await import("@/lib/connector-gateway.server");
  if (existing?.resource_id) {
    await callGateway({
      connector: "google_sheets",
      path: `/v4/spreadsheets/${existing.resource_id}/values/${SHEET_TAB}!A1:${LAST_COL}1`,
      method: "PUT",
      query: { valueInputOption: "RAW" },
      body: { values: [HEADERS as unknown as string[]] },
    });
    await applySheetFormatting(callGateway, existing.resource_id);
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
    body: { values: [HEADERS as unknown as string[]] },
  });
  await applySheetFormatting(callGateway, created.spreadsheetId);
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

function buildRow(
  lead: Record<string, unknown> & { id: string },
  contacts: ContactRow[],
  socials: SocialRow[],
): string[] {
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
  return HEADERS.map((h) => {
    if (h === "email") return primary?.email ?? "";
    if (h === "contacts_json") return contacts.length ? JSON.stringify(contacts) : "";
    if (h === "socials_json") return socials.length ? JSON.stringify(socials) : "";
    const v = lead[h];
    return v == null ? "" : String(v);
  });
}

export const pushLeadsToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<SheetSyncStatus & { appended: number; updated: number; skipped: number }> => {
      const sheetId = await ensureSheet(context.supabase);
      const { callGateway } = await import("@/lib/connector-gateway.server");

      // 1. Read what's currently in the sheet (rows only).
      const range = `${SHEET_TAB}!A2:${LAST_COL}100000`;
      const existing = await callGateway<{ values?: string[][] }>({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${range}`,
      });
      const existingRows = existing.values ?? [];
      // Map: id (UUID) -> { rowIndex (sheet 1-based, row 2 = index 2), values }
      const idToRow = new Map<string, { rowIndex: number; values: string[] }>();
      existingRows.forEach((r, i) => {
        const id = (r[ID_COL_INDEX] ?? "").trim();
        if (id && UUID_RE.test(id)) {
          idToRow.set(id, { rowIndex: i + 2, values: r });
        }
      });

      // 2. Load leads + contacts + socials.
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

      // 3. Split into "update in place" vs "append new".
      const updates: { range: string; values: string[][] }[] = [];
      const appends: string[][] = [];
      const syncedIds: string[] = [];
      let skipped = 0;
      for (const l of leadRows) {
        const row = buildRow(l, contactsMap.get(l.id) ?? [], socialsMap.get(l.id) ?? []);
        const seen = idToRow.get(l.id);
        if (seen) {
          // Compare column-by-column; only push if something differs.
          const changed = row.some((v, i) => (seen.values[i] ?? "") !== v);
          if (changed) {
            updates.push({
              range: `${SHEET_TAB}!A${seen.rowIndex}:${LAST_COL}${seen.rowIndex}`,
              values: [row],
            });
            syncedIds.push(l.id);
          } else {
            skipped += 1;
          }
        } else {
          appends.push(row);
          syncedIds.push(l.id);
        }
      }

      if (updates.length > 0) {
        await callGateway({
          connector: "google_sheets",
          path: `/v4/spreadsheets/${sheetId}/values:batchUpdate`,
          method: "POST",
          body: {
            valueInputOption: "RAW",
            data: updates,
          },
        });
      }
      if (appends.length > 0) {
        await callGateway({
          connector: "google_sheets",
          path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A:${LAST_COL}:append`,
          method: "POST",
          query: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
          body: { values: appends },
        });
      }

      const now = new Date().toISOString();
      await upsertSync(context.supabase, { resource_id: sheetId, last_sync_at: now });
      if (syncedIds.length > 0) {
        await context.supabase.from("leads").update({ synced_at: now }).in("id", syncedIds);
      }
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

export const pullLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<SheetSyncStatus & { updated: number; created: number; skipped: number }> => {
      const sheetId = await ensureSheet(context.supabase);
      const { callGateway } = await import("@/lib/connector-gateway.server");
      const range = `${SHEET_TAB}!A2:${LAST_COL}100000`;
      const resp = await callGateway<{ values?: string[][] }>({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${range}`,
      });
      const values = resp.values ?? [];
      let created = 0;
      let skipped = 0;
      const ALLOWED_STATUS = new Set([
        "new",
        "contacted",
        "viewed",
        "meeting",
        "converted",
        "lost",
      ]);
      // Track writebacks: sheet row -> [id, slug, lead_code]
      const writebacks: { rowIndex: number; id: string; slug: string; code: string }[] = [];

      for (let i = 0; i < values.length; i += 1) {
        const row = values[i];
        const rowIndex = i + 2; // sheet row (A2 == first data row)
        const rec: Record<string, string | null> = {};
        HEADERS.forEach((h, idx) => {
          const v = row[idx];
          rec[h] = v == null ? null : String(v).trim() || null;
        });
        if (!rec.name) {
          skipped += 1;
          continue;
        }

        // Strict skip: if `id` is a valid UUID, the row was already pulled
        // (or was pushed from DB). We do NOT re-pull it. Edits made in the
        // sheet flow back on the next push cycle, not on pull.
        if (rec.id && UUID_RE.test(rec.id)) {
          skipped += 1;
          continue;
        }

        // Only manually-added rows (no id) get inserted.
        const statusRaw = (rec.status ?? "new").toLowerCase();
        const status = (ALLOWED_STATUS.has(statusRaw) ? statusRaw : "new") as
          | "new"
          | "contacted"
          | "viewed"
          | "meeting"
          | "converted"
          | "lost";
        const emailFromSheet =
          rec.email && rec.email.includes("@") ? rec.email : null;
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

        const { data: inserted, error } = await context.supabase
          .from("leads")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ ...leadPatch, created_by: context.userId } as any)
          .select("id, slug, lead_code")
          .single();
        if (!error && inserted?.id) {
          created += 1;
          if (emailFromSheet) {
            await upsertPrimaryContact(
              context.supabase,
              inserted.id,
              emailFromSheet,
              context.userId,
            );
          }
          writebacks.push({
            rowIndex,
            id: inserted.id,
            slug: inserted.slug ?? "",
            code: inserted.lead_code ?? "",
          });
        } else if (error) {
          console.error("[sheet-pull] insert failed", error.message, leadPatch);
          skipped += 1;
        }
      }

      // Write id/slug/lead_code back into the manually-added rows so a
      // second pull won't duplicate them.
      if (writebacks.length > 0) {
        const idCol = colLetters(ID_COL_INDEX + 1);
        const codeCol = colLetters(CODE_COL_INDEX + 1);
        const startCol = idCol;
        const endCol = codeCol;
        // id, slug, lead_code are contiguous columns A/B/C.
        const data = writebacks.map((w) => ({
          range: `${SHEET_TAB}!${startCol}${w.rowIndex}:${endCol}${w.rowIndex}`,
          values: [
            SLUG_COL_INDEX === ID_COL_INDEX + 1 && CODE_COL_INDEX === ID_COL_INDEX + 2
              ? [w.id, w.slug, w.code]
              : [w.id, w.slug, w.code],
          ],
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
        updated: 0,
        created,
        skipped,
      };
    },
  );
