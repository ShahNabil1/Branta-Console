// Leads ⇄ Google Sheets two-way sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SHEET_TITLE = "Branta Tech · Leads";
const SHEET_TAB = "Leads";
const HEADERS = [
  "id",
  "slug",
  "lead_code",
  "name",
  "company",
  "email", // primary contact email (derived)
  "phone",
  "status",
  "source",
  "value_usd",
  "currency",
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

async function fetchPrimaryEmailMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  leadIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (leadIds.length === 0) return map;
  const { data } = await supabase
    .from("lead_contacts")
    .select("lead_id, email, is_primary")
    .in("lead_id", leadIds);
  const anyBy = new Map<string, string>();
  (data ?? []).forEach((c: { lead_id: string; email: string; is_primary: boolean }) => {
    if (c.is_primary) map.set(c.lead_id, c.email);
    if (!anyBy.has(c.lead_id)) anyBy.set(c.lead_id, c.email);
  });
  for (const [lid, e] of anyBy.entries()) if (!map.has(lid)) map.set(lid, e);
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
        "id, slug, lead_code, name, company, phone, status, source, value_usd, next_action, notes, last_activity_at",
      )
      .order("slug", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    const leadRows = (leads ?? []) as Array<Record<string, unknown> & { id: string }>;
    const emailMap = await fetchPrimaryEmailMap(
      context.supabase,
      leadRows.map((l) => l.id),
    );
    const rows = leadRows.map((l) =>
      HEADERS.map((h) => {
        if (h === "email") return emailMap.get(l.id) ?? "";
        const v = l[h];
        return v == null ? "" : String(v);
      }),
    );
    const { callGateway } = await import("@/lib/connector-gateway.server");
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
      .in("id", leadRows.map((l) => l.id));
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
          company: rec.company || null,
          phone: rec.phone || null,
          status,
          source: rec.source || null,
          value_usd:
            rec.value_usd && !Number.isNaN(Number(rec.value_usd))
              ? Number(rec.value_usd)
              : null,
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
