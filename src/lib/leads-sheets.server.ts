// Server-only helpers for pushing a single lead row to the Leads Google Sheet.
// Kept in a .server.ts file so route/component bundles never see the body.
import { callGateway } from "@/lib/connector-gateway.server";

const SHEET_TAB = "Leads";
const HEADERS = [
  "name","role","company","email","email_label","alt_email","alt_email_label",
  "phone","phone_label","alt_phone","alt_phone_label","contact_preference",
  "status","source","source_other","service","service_other","value_usd",
  "currency","next_action","notes",
  "social_1_platform","social_1_url","social_1_label",
  "social_2_platform","social_2_url","social_2_label",
  "social_3_platform","social_3_url","social_3_label",
  "social_4_platform","social_4_url","social_4_label",
  "social_5_platform","social_5_url","social_5_label",
  "assigned_slug","imported_at",
] as const;
type Header = (typeof HEADERS)[number];
const COL_INDEX = HEADERS.reduce(
  (acc, h, i) => { acc[h] = i; return acc; },
  {} as Record<Header, number>,
);
function colLetters(n: number): string {
  let s = ""; let x = n;
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
  return s || "A";
}
const LAST_COL = colLetters(HEADERS.length);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// integration_sync_state is admin-only under RLS; read it server-side with the
// privileged client (callers are already authenticated server functions).
async function getSheetId(_supabase: Admin): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("integration_sync_state")
    .select("resource_id")
    .eq("kind", "leads_sheet")
    .maybeSingle();
  return data?.resource_id ?? null;
}

function buildRow(
  lead: Record<string, unknown> & { slug: string },
  contacts: Array<{ email: string; is_primary: boolean }>,
  socials: Array<{ platform: string; url: string; label: string | null }>,
): string[] {
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
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
  socials.slice(0, 5).forEach((s, i) => {
    const n = i + 1;
    (rec[`social_${n}_platform` as Header] as string) = s.platform ?? "";
    (rec[`social_${n}_url` as Header] as string) = s.url ?? "";
    (rec[`social_${n}_label` as Header] as string) = s.label ?? "";
  });
  rec.assigned_slug = String(lead.slug ?? "");
  rec.imported_at = String(lead.last_activity_at ?? "");
  return HEADERS.map((h) => rec[h] ?? "");
}

async function pushOneLead(
  supabase: Admin,
  leadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sheetId = await getSheetId(supabase);
  if (!sheetId) {
    return { ok: false, error: "Leads sheet not initialised — open Sheet once to set it up." };
  }
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, slug, lead_code, name, role, company, phone, phone_label, alt_phone, alt_phone_label, email_label, alt_email, alt_email_label, contact_preference, status, source, source_other, service, service_other, value_usd, currency, next_action, notes, last_activity_at")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return { ok: false, error: leadErr?.message ?? "Lead not found" };
  const [{ data: contacts }, { data: socials }] = await Promise.all([
    supabase.from("lead_contacts").select("email, is_primary").eq("lead_id", leadId).order("is_primary", { ascending: false }),
    supabase.from("lead_social_links").select("platform, url, label, sort_order").eq("lead_id", leadId).order("sort_order", { ascending: true }),
  ]);
  const row = buildRow(
    lead as Record<string, unknown> & { slug: string },
    (contacts ?? []) as Array<{ email: string; is_primary: boolean }>,
    (socials ?? []) as Array<{ platform: string; url: string; label: string | null }>,
  );
  const slugLower = String((lead as { slug: string }).slug ?? "").toLowerCase();
  try {
    const existing = await callGateway<{ values?: string[][] }>({
      connector: "google_sheets",
      path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A2:${LAST_COL}100000`,
    });
    const rows = existing.values ?? [];
    let found = -1;
    for (let i = 0; i < rows.length; i += 1) {
      if ((rows[i][COL_INDEX.assigned_slug] ?? "").trim().toLowerCase() === slugLower) {
        found = i + 2; break;
      }
    }
    if (found > 0) {
      await callGateway({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A${found}:${LAST_COL}${found}`,
        method: "PUT",
        query: { valueInputOption: "RAW" },
        body: { values: [row] },
      });
    } else {
      await callGateway({
        connector: "google_sheets",
        path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A:${LAST_COL}:append`,
        method: "POST",
        query: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
        body: { values: [row] },
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Attempt to push a single lead to the Google Sheet and record the outcome
 * in leads.sheet_sync_status / sheet_synced_at / sheet_sync_error. Never
 * throws — the caller can proceed even if the push fails.
 */
export async function autoSyncLead(supabase: Admin, leadId: string): Promise<void> {
  await supabase.from("leads").update({ sheet_sync_status: "syncing" } as never).eq("id", leadId);
  const res = await pushOneLead(supabase, leadId);
  if (res.ok) {
    await supabase.from("leads").update({
      sheet_sync_status: "synced",
      sheet_synced_at: new Date().toISOString(),
      sheet_sync_error: null,
    } as never).eq("id", leadId);
  } else {
    await supabase.from("leads").update({
      sheet_sync_status: "failed",
      sheet_sync_error: (res.error || "").slice(0, 500),
    } as never).eq("id", leadId);
    try {
      const { notify } = await import("@/lib/notify.server");
      const { data: leadRow } = await supabase
        .from("leads").select("slug, lead_code").eq("id", leadId).maybeSingle();
      const slug = (leadRow as { slug?: string; lead_code?: string } | null)?.slug
        ?? (leadRow as { lead_code?: string } | null)?.lead_code ?? leadId.slice(0, 8);
      await notify({
        event: "lead.sheet_sync.failed",
        recipientRoles: ["super_admin", "admin"],
        vars: { slug, error: (res.error || "unknown").slice(0, 200) },
        dedupeKey: `lead:${leadId}:sheet_sync_failed:${new Date().toISOString().slice(0, 10)}`,
      });
    } catch (e) {
      console.error("[autoSyncLead] notify failed:", e);
    }
  }
}
