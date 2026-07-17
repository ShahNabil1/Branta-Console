// Leads ⇄ Google Sheets two-way sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SHEET_TITLE = "Branta Tech · Leads";
const SHEET_TAB = "Leads";
const HEADERS = [
  "id",
  "lead_code",
  "name",
  "company",
  "email",
  "phone",
  "status",
  "source",
  "value_usd",
  "next_action",
  "notes",
  "last_activity_at",
];

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
  if (existing?.resource_id) return existing.resource_id;
  const { callGateway } = await import("@/lib/connector-gateway.server");
  const created = await callGateway<{ spreadsheetId: string }>({
    connector: "google_sheets",
    path: "/v4/spreadsheets",
    method: "POST",
    body: {
      properties: { title: SHEET_TITLE },
      sheets: [{ properties: { title: SHEET_TAB } }],
    },
  });
  // Write header row
  await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${created.spreadsheetId}/values/${SHEET_TAB}!A1:${String.fromCharCode(64 + HEADERS.length)}1`,
    method: "PUT",
    query: { valueInputOption: "RAW" },
    body: { values: [HEADERS] },
  });
  await upsertSync(supabase, { resource_id: created.spreadsheetId });
  return created.spreadsheetId;
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
        "id, lead_code, name, company, email, phone, status, source, value_usd, next_action, notes, last_activity_at",
      )
      .order("lead_code", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    const rows = (leads ?? []).map((l) =>
      HEADERS.map((h) => {
        const v = (l as Record<string, unknown>)[h];
        return v == null ? "" : String(v);
      }),
    );
    const { callGateway } = await import("@/lib/connector-gateway.server");
    // Clear then write
    await callGateway({
      connector: "google_sheets",
      path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A2:Z100000:clear`,
      method: "POST",
      body: {},
    });
    if (rows.length > 0) {
      await callGateway({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A2`,
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
      .in(
        "id",
        (leads ?? []).map((l) => l.id),
      );
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
      const range = `${SHEET_TAB}!A2:${String.fromCharCode(64 + HEADERS.length)}100000`;
      const resp = await callGateway<{ values?: string[][] }>({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${range}`,
      });
      const values = resp.values ?? [];
      let updated = 0;
      let created = 0;
      for (const row of values) {
        const rec: Record<string, string | null> = {};
        HEADERS.forEach((h, i) => (rec[h] = row[i] ?? null));
        if (!rec.name) continue;
        const patch = {
          name: rec.name,
          company: rec.company || null,
          email: rec.email || null,
          phone: rec.phone || null,
          status: (rec.status || "new") as
            | "new"
            | "contacted"
            | "viewed"
            | "meeting"
            | "converted"
            | "lost",
          source: rec.source || null,
          value_usd: rec.value_usd ? Number(rec.value_usd) : null,
          next_action: rec.next_action || null,
          notes: rec.notes || null,
        };
        if (rec.id) {
          const { error, count } = await context.supabase
            .from("leads")
            .update(patch, { count: "exact" })
            .eq("id", rec.id);
          if (!error && (count ?? 0) > 0) updated += 1;
        } else {
          const { error } = await context.supabase
            .from("leads")
            .insert({ ...patch, created_by: context.userId });
          if (!error) created += 1;
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
