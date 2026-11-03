// Server-only: per-company dedicated Google account (Gmail inbox + Calendar).
// OAuth client lives in a separate Google Cloud project (COMPANY_GOOGLE_CLIENT_ID/SECRET)
// so the main sign-in client is never touched. Refresh tokens are sealed with
// INTEGRATION_ENC_KEY in company_google_accounts (service-role only).
import { open, publicBase, seal } from "@/lib/company-email.server";

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;
export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function creds() {
  const id = process.env.COMPANY_GOOGLE_CLIENT_ID;
  const secret = process.env.COMPANY_GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Company Google sign-in is not configured.");
  return { id, secret };
}

export function redirectUri(origin?: string) {
  return `${(origin || publicBase()).replace(/\/+$/, "")}/api/public/google-oauth/callback`;
}

// ---------- signed state (HMAC-SHA256, 10 min) ----------
const enc = new TextEncoder();
async function hmacKey() {
  const raw = process.env.INTEGRATION_ENC_KEY;
  if (!raw) throw new Error("Integration encryption key is not configured.");
  return crypto.subtle.importKey("raw", enc.encode(`google-state:${raw}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export type OAuthState = { c: string; s: string; u: string; o: string; n: string; exp: number };
export async function signState(st: Omit<OAuthState, "n" | "exp">) {
  const full: OAuthState = { ...st, n: crypto.randomUUID(), exp: Date.now() + 10 * 60_000 };
  const body = b64u(enc.encode(JSON.stringify(full)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}
export async function verifyState(token: string): Promise<OAuthState | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const st = JSON.parse(new TextDecoder().decode(unb64u(body))) as OAuthState;
    return st.exp > Date.now() ? st : null;
  } catch { return null; }
}

export function authUrl(state: string, origin: string, loginHint?: string) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", creds().id);
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent select_account");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  if (loginHint) u.searchParams.set("login_hint", loginHint);
  return u.toString();
}

export async function exchangeCode(code: string, origin: string) {
  const { id, secret } = creds();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(origin), grant_type: "authorization_code" }),
  });
  const j = (await r.json().catch(() => ({}))) as Any;
  if (!r.ok) throw new Error(j.error_description || j.error || `Google token exchange failed (${r.status}).`);
  return j as { access_token: string; refresh_token?: string; scope: string; expires_in: number };
}

export async function userInfo(accessToken: string) {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = (await r.json().catch(() => ({}))) as Any;
  if (!r.ok || !j.email) throw new Error("Could not read the Google account's email.");
  return { email: String(j.email).toLowerCase(), name: (j.name as string) ?? null, verified: !!j.email_verified };
}

export async function revoke(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => null);
}

// ---------- access tokens per company ----------
const cache = new Map<string, { token: string; exp: number }>();

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Any;
}

export async function getAccount(companyId: string) {
  const { data } = await (await admin()).from("company_google_accounts").select("*").eq("company_id", companyId).maybeSingle();
  return data as Any;
}

/** Access token for the company's own Google account, or null when none is connected. */
export async function companyGoogleToken(companyId: string): Promise<string | null> {
  const hit = cache.get(companyId);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const acc = await getAccount(companyId);
  if (!acc?.is_active || !acc.refresh_token_enc) return null;
  const refresh = await open(acc.refresh_token_enc);
  if (!refresh) return null;
  const { id, secret } = creds();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = (await r.json().catch(() => ({}))) as Any;
  const db = await admin();
  if (!r.ok) {
    const reason = j.error === "invalid_grant"
      ? "Google access was revoked or expired. Reconnect the Gmail account."
      : j.error_description || j.error || `Google refresh failed (${r.status}).`;
    await db.from("company_google_accounts").update({ last_error: reason, last_checked_at: new Date().toISOString() }).eq("company_id", companyId);
    throw new Error(reason);
  }
  cache.set(companyId, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token as string;
}

export async function saveAccount(p: { companyId: string; email: string; name: string | null; refresh: string | null; scopes: string[]; userId: string }) {
  const db = await admin();
  const prev = await getAccount(p.companyId);
  const refresh_token_enc = p.refresh ? await seal(p.refresh) : prev?.google_email === p.email ? prev.refresh_token_enc : null;
  if (!refresh_token_enc) throw new Error("Google didn't return offline access. Remove Branta Integrations from the Google account's third-party access, then connect again.");
  cache.delete(p.companyId);
  const { error } = await db.from("company_google_accounts").upsert({
    company_id: p.companyId, google_email: p.email, google_name: p.name, refresh_token_enc, scopes: p.scopes,
    is_active: true, connected_by: p.userId, connected_at: new Date().toISOString(), disconnected_at: null,
    last_error: null, last_checked_at: new Date().toISOString(),
  }, { onConflict: "company_id" });
  if (error) throw new Error("Could not save the Google connection.");
}

export function clearCache(companyId: string) { cache.delete(companyId); }
