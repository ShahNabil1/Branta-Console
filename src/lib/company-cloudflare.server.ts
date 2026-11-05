// Server-only: per-company Cloudflare account via the "Branta Console" OAuth client
// (CLOUDFLARE_OAUTH_CLIENT_ID/SECRET). Refresh tokens are sealed with INTEGRATION_ENC_KEY
// in company_cloudflare_accounts (service-role only); access tokens never leave the server.
import { open, publicBase, seal } from "@/lib/company-email.server";

// Exact scope IDs configured on the OAuth client (13 required) + offline_access for refresh.
export const CF_SCOPES = [
  "offline_access",
  "dns.read", "dns.write",
  "zone.read", "zone-settings.read", "zone-settings.write",
  "email-routing-address.read", "email-routing-address.write",
  "email-routing-rule.read", "email-routing-rule.write",
  "cache.purge", "ssl-and-certificates.read",
  "account-settings.read", "user-details.read",
] as const;

const AUTH = "https://dash.cloudflare.com/oauth2/auth";
const TOKEN = "https://dash.cloudflare.com/oauth2/token";
const REVOKE = "https://dash.cloudflare.com/oauth2/revoke";
export const CF_API = "https://api.cloudflare.com/client/v4";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function creds() {
  const id = process.env.CLOUDFLARE_OAUTH_CLIENT_ID;
  const secret = process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Cloudflare sign-in is not configured.");
  return { id, secret };
}
export const cloudflareOAuthConfigured = () => !!(process.env.CLOUDFLARE_OAUTH_CLIENT_ID && process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET);

export function redirectUri(origin?: string) {
  return `${(origin || publicBase()).replace(/\/+$/, "")}/api/public/cloudflare/callback`;
}

// ---------- signed state (HMAC-SHA256, 10 min) ----------
const enc = new TextEncoder();
async function hmacKey() {
  const raw = process.env.INTEGRATION_ENC_KEY;
  if (!raw) throw new Error("Integration encryption key is not configured.");
  return crypto.subtle.importKey("raw", enc.encode(`cloudflare-state:${raw}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export type CfState = { c: string; s: string; u: string; o: string; n: string; exp: number; p?: string };
export async function signState(st: Omit<CfState, "n" | "exp">) {
  const full: CfState = { ...st, n: crypto.randomUUID(), exp: Date.now() + 10 * 60_000 };
  const body = b64u(enc.encode(JSON.stringify(full)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}
export async function verifyState(token: string): Promise<CfState | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(), unb64u(sig), enc.encode(body)))) return null;
    const st = JSON.parse(new TextDecoder().decode(unb64u(body))) as CfState;
    return st.exp > Date.now() ? st : null;
  } catch { return null; }
}

export function authUrl(state: string, origin: string) {
  const u = new URL(AUTH);
  u.searchParams.set("client_id", creds().id);
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", CF_SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenCall(params: Record<string, string>) {
  const { id, secret } = creds();
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: id, client_secret: secret }),
  });
  const j = (await r.json().catch(() => ({}))) as Any;
  return { ok: r.ok, status: r.status, j };
}

export async function exchangeCode(code: string, origin: string) {
  const { ok, status, j } = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  if (!ok || !j.access_token) throw new Error(j.error_description || j.error || `Cloudflare token exchange failed (${status}).`);
  return j as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}

export async function revoke(token: string) {
  const { id, secret } = creds();
  await fetch(REVOKE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, client_id: id, client_secret: secret }),
  }).catch(() => null);
}

/** Calls the Cloudflare v4 API with a bearer token; surfaces Cloudflare's own error text. */
export async function cfApi<T = Any>(token: string, path: string, init?: RequestInit): Promise<{ result: T; info: Any }> {
  const r = await fetch(`${CF_API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as Any;
  if (!r.ok || j.success === false) {
    const msg = j.errors?.[0]?.message ?? `HTTP ${r.status}`;
    throw new Error(r.status === 403 ? `Cloudflare denied this request — permission missing (${msg}).` : `Cloudflare: ${msg}`);
  }
  return { result: j.result as T, info: j.result_info };
}

export async function identity(token: string) {
  const user = await cfApi<Any>(token, "/user").then((r) => r.result).catch(() => null);
  const accounts = await cfApi<Any[]>(token, "/accounts?per_page=50").then((r) => r.result ?? []).catch(() => []);
  return {
    email: (user?.email as string | undefined)?.toLowerCase() ?? null,
    userId: (user?.id as string | undefined) ?? null,
    accounts: accounts.map((a) => ({ id: String(a.id), name: String(a.name ?? a.id) })),
  };
}

// ---------- access tokens per company ----------
const cache = new Map<string, { token: string; exp: number }>();
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Any;
}
export async function getAccount(companyId: string) {
  const { data } = await (await admin()).from("company_cloudflare_accounts").select("*").eq("company_id", companyId).maybeSingle();
  return data as Any;
}
export function clearCache(companyId: string) { cache.delete(companyId); }

/** Access token for the company's Cloudflare account, or null when none is connected. Rotated refresh tokens are re-sealed. */
export async function companyCloudflareToken(companyId: string): Promise<string | null> {
  const hit = cache.get(companyId);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const acc = await getAccount(companyId);
  if (!acc?.is_active || !acc.refresh_token_enc) return null;
  const refresh = await open(acc.refresh_token_enc);
  if (!refresh) return null;
  const { ok, status, j } = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
  const db = await admin();
  if (!ok || !j.access_token) {
    const reason = j.error === "invalid_grant"
      ? "Cloudflare access was revoked or expired. Reconnect Cloudflare."
      : j.error_description || j.error || `Cloudflare refresh failed (${status}).`;
    await db.from("company_cloudflare_accounts").update({ last_error: reason, last_checked_at: new Date().toISOString() }).eq("company_id", companyId);
    throw new Error(reason);
  }
  if (j.refresh_token && j.refresh_token !== refresh) {
    await db.from("company_cloudflare_accounts").update({ refresh_token_enc: await seal(j.refresh_token) }).eq("company_id", companyId);
  }
  cache.set(companyId, { token: j.access_token, exp: Date.now() + Number(j.expires_in ?? 3600) * 1000 });
  return j.access_token as string;
}

export async function saveAccount(p: {
  companyId: string; refresh: string; scopes: string[]; userId: string;
  email: string | null; cfUserId: string | null; accounts: { id: string; name: string }[];
}) {
  const db = await admin();
  cache.delete(p.companyId);
  const { error } = await db.from("company_cloudflare_accounts").upsert({
    company_id: p.companyId, cf_email: p.email, cf_user_id: p.cfUserId,
    account_ids: p.accounts.map((a) => a.id), account_names: p.accounts.map((a) => a.name),
    refresh_token_enc: await seal(p.refresh), scopes: p.scopes, is_active: true,
    connected_by: p.userId, connected_at: new Date().toISOString(), disconnected_at: null,
    last_error: null, last_checked_at: new Date().toISOString(),
  }, { onConflict: "company_id" });
  if (error) throw new Error("Could not save the Cloudflare connection.");
}
