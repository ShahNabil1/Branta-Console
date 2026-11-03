// Server-only: resolves which company mailbox (Gmail + Calendar + inbox address)
// a request runs against. The holding company keeps the shared Inbox; every
// other company must use its own connected Google account — never the shared one.
import type { SupabaseClient } from "@supabase/supabase-js";

export const HOLDING_INBOX = "hello@brantatech.com";
export const COMPANY_SLUG_RE = /^[a-z0-9-]{1,80}$/;

export interface Mailbox {
  companyId: string;
  companyName: string;
  slug: string;
  isHolding: boolean;
  /** Address incoming mail is sent to (filter for the Gmail query). */
  inboxAddr: string;
  /** When true, Gmail/Calendar calls must use the company's own account. */
  strict: boolean;
}

type Sb = SupabaseClient;
type Row = { id: string; name: string; slug: string; is_holding: boolean; email: string };

async function canUseCompany(sb: Sb, userId: string, companyId: string) {
  const [m, a] = await Promise.all([
    sb.rpc("is_company_member" as never, { _company: companyId, _user: userId } as never),
    sb.rpc("can_manage_company" as never, { _company: companyId, _user: userId } as never),
  ]);
  return Boolean((m as { data: unknown }).data) || Boolean((a as { data: unknown }).data);
}

async function inboxAddressFor(companyId: string, fallback: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("company_inbox_addresses").select("email, verified_at").eq("company_id", companyId).maybeSingle();
  return data?.verified_at && data.email ? String(data.email).toLowerCase() : fallback.toLowerCase();
}

async function hasOwnGoogle(companyId: string) {
  const { getAccount } = await import("@/lib/company-google.server");
  const acc = (await getAccount(companyId)) as { email?: string } | null;
  return Boolean(acc);
}

function build(row: Row, inboxAddr: string): Mailbox {
  return { companyId: row.id, companyName: row.name, slug: row.slug, isHolding: row.is_holding, inboxAddr, strict: !row.is_holding };
}

/** Mailbox for the workspace the user is viewing (slug), checked against their membership. */
export async function resolveMailbox(sb: Sb, userId: string, slug?: string | null): Promise<Mailbox> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const q = admin.from("companies").select("id, name, slug, is_holding, email");
  const { data } = slug && COMPANY_SLUG_RE.test(slug)
    ? await q.eq("slug", slug).maybeSingle()
    : await q.eq("is_holding", true).order("created_at").limit(1).maybeSingle();
  const row = data as Row | null;
  if (!row) throw new Error("Company not found");
  if (row.is_holding) return build(row, HOLDING_INBOX);
  if (!(await canUseCompany(sb, userId, row.id))) throw new Error(`You don't have access to ${row.name}'s inbox.`);
  if (!(await hasOwnGoogle(row.id)))
    throw new Error(`${row.name} has no Gmail connected yet. Connect it in the company's Integrations tab.`);
  return build(row, await inboxAddressFor(row.id, row.email));
}

/** Mailbox that owns a lead (used by meetings). Access to the lead is checked by the caller via RLS. */
export async function mailboxForCompanyId(companyId: string | null | undefined): Promise<Mailbox | null> {
  if (!companyId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await admin.from("companies").select("id, name, slug, is_holding, email").eq("id", companyId).maybeSingle();
  const row = data as Row | null;
  if (!row) return null;
  if (!row.is_holding && !(await hasOwnGoogle(row.id)))
    throw new Error(`${row.name} has no Google Calendar connected yet. Connect it in the company's Integrations tab.`);
  return build(row, row.is_holding ? HOLDING_INBOX : await inboxAddressFor(row.id, row.email));
}

/** Options to spread into callGateway for Gmail / Calendar calls. */
export const googleScope = (mb: Mailbox | null) =>
  mb ? { companyId: mb.companyId, companyOnly: mb.strict } : {};
