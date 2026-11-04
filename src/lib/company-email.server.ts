// Server-only: per-company email provider (Resend / Brevo) credentials.
// Secrets are AES-GCM encrypted with INTEGRATION_ENC_KEY and stored in
// company_email_providers (service-role only, no client grants). Never import
// from browser code.

import { chooseCompanyProvider } from "./company-email-test-policy";
export type Provider = "resend" | "brevo";

export const INBOX_GMAIL = "brantatech@gmail.com";
export const RESEND_EVENTS = [
  "email.sent", "email.delivered", "email.delivery_delayed", "email.bounced",
  "email.complained", "email.opened", "email.clicked", "email.failed",
  "email.scheduled", "email.received", "email.suppressed",
  "domain.created", "domain.updated", "domain.deleted",
  "contact.created", "contact.updated", "contact.deleted",
] as const;
export const BREVO_EVENTS = [
  "request", "delivered", "opened", "click", "hardBounce", "softBounce",
  "spam", "blocked", "invalid", "deferred", "unsubscribed", "uniqueOpened",
] as const;

export function publicBase() {
  return (process.env.PUBLIC_APP_URL || "https://console.brantatech.com").replace(/\/+$/, "");
}
export function webhookUrl(provider: Provider, slug: string, token?: string) {
  const u = new URL(`${publicBase()}/api/public/${provider}/webhook`);
  u.searchParams.set("company", slug);
  if (token) u.searchParams.set("token", token);
  return u.toString();
}

// ---------- crypto ----------
const enc = new TextEncoder();
async function key() {
  const raw = process.env.INTEGRATION_ENC_KEY;
  if (!raw) throw new Error("Integration encryption key is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return `v1:${b64(out)}`;
}
export async function open(sealed: string | null | undefined): Promise<string | null> {
  if (!sealed?.startsWith("v1:")) return null;
  const buf = unb64(sealed.slice(3));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, await key(), buf.slice(12));
  return new TextDecoder().decode(pt);
}
export const hint = (s: string) => `${s.slice(0, Math.min(5, s.length))}••••${s.slice(-4)}`;
export function randomToken(len = 40) {
  const a = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("");
}

// ---------- provider HTTP ----------
type Res = { ok: boolean; status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(url: string, headers: Record<string, string>, init?: { method?: string; body?: unknown }): Promise<Res> {
  try {
    const r = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await r.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text.slice(0, 300) }; }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { message: e instanceof Error ? e.message : "Network error" } };
  }
}
export const resend = (k: string, path: string, init?: { method?: string; body?: unknown }) =>
  call(`https://api.resend.com${path}`, { Authorization: `Bearer ${k}` }, init);
export const brevo = (k: string, path: string, init?: { method?: string; body?: unknown }) =>
  call(`https://api.brevo.com/v3${path}`, { "api-key": k }, init);

// ---------- webhook receivers ----------
/** Returns the decrypted per-company webhook secret, or null when unknown. */
export async function companyWebhookSecret(provider: Provider, slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: co } = await sb.from("companies").select("id").eq("slug", slug).maybeSingle();
  if (!co) return null;
  const { data } = await sb.from("company_email_providers").select("webhook_secret_enc")
    .eq("company_id", co.id).eq("provider", provider).eq("is_active", true).maybeSingle();
  return open(data?.webhook_secret_enc);
}

/** Sender config for a company's outgoing mail (Leads / Invoices / Inbox replies). */
export async function resolveCompanySender(companyId: string, prefer?: Provider) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("company_email_providers").select("*")
    .eq("company_id", companyId).eq("is_active", true).not("domain_verified_at", "is", null);
  const rows = (data ?? []) as { provider: Provider; sender_name: string; sender_email: string; api_key_enc: string; is_default: boolean; finance_sender_email?: string | null }[];
  const row = chooseCompanyProvider(rows, prefer);
  if (!row) return null;
  return { provider: row.provider, fromName: row.sender_name, fromEmail: row.sender_email, apiKey: (await open(row.api_key_enc))!, financeEmail: row.provider === "resend" ? row.finance_sender_email ?? null : null };
}

/** Invoice + reminder sender: Resend strictly (finance overrides), Brevo only when Resend isn't connected. */
export async function resolveFinanceSender(companyId: string) {
  const { pickFinanceSender } = await import("./finance-sender-policy");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("company_email_providers").select("*")
    .eq("company_id", companyId).eq("is_active", true).not("domain_verified_at", "is", null);
  const pick = pickFinanceSender((data ?? []) as (Parameters<typeof pickFinanceSender>[0][number] & { provider: Provider; api_key_enc: string })[]);
  if (!pick) return null;
  return { provider: pick.row.provider as Provider, fromName: pick.fromName, fromEmail: pick.fromEmail, apiKey: (await open(pick.row.api_key_enc))! };
}

// ---------- Cloudflare inbound routing (any zone the token can reach) ----------
async function cf(path: string, init?: { method?: string; body?: unknown }) {
  const t = process.env.CLOUDFLARE_API_TOKEN;
  if (!t) return { ok: false, status: 0, body: { errors: [{ message: "Cloudflare is not configured." }] } } as Res;
  return call(`https://api.cloudflare.com/client/v4${path}`, { Authorization: `Bearer ${t}` }, init);
}
export async function inboundRouting(address: string, create = false, target: string = INBOX_GMAIL) {
  const INBOX = target.toLowerCase();
  const addr = address.toLowerCase();
  const domain = addr.split("@")[1] ?? "";
  const z = await cf(`/zones?name=${encodeURIComponent(domain)}`);
  const zone = z.ok ? z.body?.result?.[0] : null;
  if (!zone) return { state: "no_zone" as const, domain, message: `Cloudflare doesn't manage ${domain} (or the token has no access to it).` };
  const list = await cf(`/zones/${zone.id}/email/routing/rules?per_page=50`);
  if (!list.ok) return { state: "no_access" as const, domain, message: list.body?.errors?.[0]?.message ?? "Email Routing permission missing." };
  type Rule = { id: string; enabled: boolean; matchers: { field?: string; value?: string }[]; actions: { type: string; value?: string[] }[] };
  const rules = (list.body?.result ?? []) as Rule[];
  const hit = rules.find((r) => r.matchers.some((m) => m.field === "to" && m.value?.toLowerCase() === addr));
  const forwards = hit?.actions.some((a) => a.type === "forward" && a.value?.map((v) => v.toLowerCase()).includes(INBOX));
  if (hit && forwards && hit.enabled) return { state: "routed" as const, domain, message: `${addr} → ${INBOX}` };
  if (!create) return { state: hit ? ("wrong_target" as const) : ("missing" as const), domain, message: hit ? `${addr} forwards somewhere else.` : `No routing rule for ${addr} yet.` };
  const body = { name: `Branta Console: ${addr}`, enabled: true, matchers: [{ type: "literal", field: "to", value: addr }], actions: [{ type: "forward", value: [INBOX] }] };
  const w = hit ? await cf(`/zones/${zone.id}/email/routing/rules/${hit.id}`, { method: "PUT", body }) : await cf(`/zones/${zone.id}/email/routing/rules`, { method: "POST", body });
  if (!w.ok) return { state: "no_access" as const, domain, message: w.body?.errors?.[0]?.message ?? "Could not create rule." };
  return { state: "routed" as const, domain, message: `${addr} → ${INBOX}` };
}
