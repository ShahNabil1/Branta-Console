// Server-only: per-company Resend account via OAuth 2.1 + PKCE.
// Branta Console registers itself once with Resend (Dynamic Client Registration) as a
// confidential client; client id/secret and refresh tokens are sealed with INTEGRATION_ENC_KEY.
import { open, publicBase, seal } from "@/lib/company-email.server";

const API = "https://api.resend.com";
const UA = "BrantaConsole/1.0";
export const RESEND_OAUTH_SCOPES = ["full_access"] as const;
const PREVIEW_ORIGIN = "https://id-preview--0b934a6f-9f9d-47f8-b76c-960a68b43f5a.lovable.app";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Any;
}

export const redirectUri = (origin?: string) => `${(origin || publicBase()).replace(/\/+$/, "")}/api/public/resend/callback`;

/** Registers (once) and returns Branta Console's Resend OAuth client. */
export async function oauthClient(): Promise<{ id: string; secret: string }> {
  const d = await db();
  const { data } = await d.from("oauth_client_registrations").select("*").eq("provider", "resend").maybeSingle();
  if (data?.client_id && data.client_secret_enc) {
    const secret = await open(data.client_secret_enc);
    if (secret) return { id: data.client_id, secret };
  }
  const uris = Array.from(new Set([redirectUri(publicBase()), redirectUri("https://branta-nexus.lovable.app"), redirectUri(PREVIEW_ORIGIN)]));
  const r = await fetch(`${API}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      client_name: "Branta Console",
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: RESEND_OAUTH_SCOPES.join(" "),
      token_endpoint_auth_method: "client_secret_post",
      client_uri: publicBase(),
    }),
  });
  const j = (await r.json().catch(() => ({}))) as Any;
  if (!r.ok || !j.client_id || !j.client_secret) throw new Error(`Resend client registration failed: ${j.error_description || j.error || j.message || r.status}`);
  const { error } = await d.from("oauth_client_registrations").upsert({ provider: "resend", client_id: j.client_id, client_secret_enc: await seal(j.client_secret), redirect_uris: uris }, { onConflict: "provider" });
  if (error) throw new Error("Could not save the Resend client registration.");
  return { id: j.client_id, secret: j.client_secret };
}

// ---------- signed state + PKCE ----------
const enc = new TextEncoder();
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function hmacKey() {
  const raw = process.env.INTEGRATION_ENC_KEY;
  if (!raw) throw new Error("Integration encryption key is not configured.");
  return crypto.subtle.importKey("raw", enc.encode(`resend-state:${raw}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export type ResendState = { c: string; s: string; u: string; o: string; p?: string; v: string; n: string; exp: number };

/** Returns the authorize URL; the PKCE verifier travels sealed (AES-GCM) inside the HMAC-signed state. */
export async function authUrl(st: { c: string; s: string; u: string; o: string; p?: string }) {
  const { id } = await oauthClient();
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
  const full: ResendState = { ...st, v: await seal(verifier), n: crypto.randomUUID(), exp: Date.now() + 10 * 60_000 };
  const body = b64u(enc.encode(JSON.stringify(full)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  const u = new URL(`${API}/oauth/authorize`);
  u.searchParams.set("client_id", id);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri(st.o));
  u.searchParams.set("scope", RESEND_OAUTH_SCOPES.join(" "));
  u.searchParams.set("state", `${body}.${b64u(sig)}`);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}
export async function verifyState(token: string): Promise<(ResendState & { verifier: string }) | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(), unb64u(sig), enc.encode(body)))) return null;
    const st = JSON.parse(new TextDecoder().decode(unb64u(body))) as ResendState;
    if (st.exp <= Date.now()) return null;
    const verifier = await open(st.v);
    return verifier ? { ...st, verifier } : null;
  } catch { return null; }
}

async function tokenCall(params: Record<string, string>) {
  const { id, secret } = await oauthClient();
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: new URLSearchParams({ ...params, client_id: id, client_secret: secret }),
  });
  const j = (await r.json().catch(() => ({}))) as Any;
  return { ok: r.ok, status: r.status, j };
}
export async function exchangeCode(code: string, verifier: string, origin: string) {
  const { ok, status, j } = await tokenCall({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri(origin) });
  if (!ok || !j.access_token) throw new Error(j.error_description || j.error || `Resend token exchange failed (${status}).`);
  return j as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}
export async function revoke(token: string) {
  const { id, secret } = await oauthClient();
  await fetch(`${API}/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: new URLSearchParams({ token, token_type_hint: "refresh_token", client_id: id, client_secret: secret }),
  }).catch(() => null);
}

// ---------- per-company access tokens (refresh tokens rotate on every use) ----------
const cache = new Map<string, { token: string; exp: number }>();
export const clearCache = (companyId: string) => cache.delete(companyId);
export async function getAccount(companyId: string) {
  const { data } = await (await db()).from("company_resend_accounts").select("*").eq("company_id", companyId).maybeSingle();
  return data as Any;
}
export async function updateAccount(companyId: string, patch: Record<string, unknown>) {
  await (await db()).from("company_resend_accounts").update(patch).eq("company_id", companyId);
}
export async function companyResendToken(companyId: string): Promise<string | null> {
  const hit = cache.get(companyId);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const acc = await getAccount(companyId);
  if (!acc?.is_active || !acc.refresh_token_enc) return null;
  const refresh = await open(acc.refresh_token_enc);
  if (!refresh) return null;
  const { ok, status, j } = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
  if (!ok || !j.access_token) {
    const reason = j.error === "invalid_grant" ? "Resend access was revoked or expired. Reconnect Resend." : j.error_description || j.error || `Resend refresh failed (${status}).`;
    await updateAccount(companyId, { last_error: reason });
    throw new Error(reason);
  }
  // Rotation: the old refresh token is now dead, persist the new one before using the access token.
  if (j.refresh_token) await updateAccount(companyId, { refresh_token_enc: await seal(j.refresh_token) });
  cache.set(companyId, { token: j.access_token, exp: Date.now() + Number(j.expires_in ?? 900) * 1000 });
  return j.access_token as string;
}
export async function saveAccount(p: { companyId: string; refresh: string; scopes: string[]; userId: string }) {
  cache.delete(p.companyId);
  const { error } = await (await db()).from("company_resend_accounts").upsert({
    company_id: p.companyId, refresh_token_enc: await seal(p.refresh), scopes: p.scopes, is_active: true,
    connected_by: p.userId, connected_at: new Date().toISOString(), disconnected_at: null, last_error: null,
  }, { onConflict: "company_id" });
  if (error) throw new Error("Could not save the Resend connection.");
}

/** Resend REST call with a bearer token; returns provider status/body without throwing. */
export async function rs(token: string, path: string, init?: { method?: string; body?: unknown }) {
  try {
    const r = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": UA },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    let body: Any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text.slice(0, 300) }; }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { message: e instanceof Error ? e.message : "Network error" } as Any };
  }
}

/** Fully-qualified DNS name for a Resend record name relative to the domain. */
export function fqdn(name: string, domain: string) {
  const n = name.trim().replace(/\.$/, "").toLowerCase();
  if (!n || n === "@" || n === domain) return domain;
  return n.endsWith(`.${domain}`) ? n : `${n}.${domain}`;
}

/** Pushes Resend DNS records (incl. tracking CNAME) into the company Cloudflare zone; idempotent. */
export async function pushResendDns(companyId: string, domain: string, records: Any[]): Promise<{ ok: boolean; detail: string }> {
      const cf = await import("@/lib/company-cloudflare.server");
      const cft = await cf.companyCloudflareToken(companyId).catch(() => null);
      if (!cft) return ({ ok: false, detail: "Connect this company's Cloudflare account first." });
      // Zone = the domain itself or its closest parent present in the Cloudflare account.
      const parts = domain.split(".");
      let zone: Any = null;
      for (let i = 0; i < parts.length - 1 && !zone; i++) {
        const { result } = await cf.cfApi<Any[]>(cft, `/zones?name=${encodeURIComponent(parts.slice(i).join("."))}`);
        zone = result?.[0] ?? null;
      }
      if (!zone) return ({ ok: false, detail: `${domain} isn't in the connected Cloudflare account.` });
      let added = 0, updated = 0, same = 0;
      for (const r of records as Any[]) {
        const type = String(r.type ?? (r.record === "DKIM" ? "TXT" : "TXT")).toUpperCase();
        const name = fqdn(String(r.name ?? ""), domain);
        const content = String(r.value ?? "").replace(/^"|"$/g, "");
        const { result: existing } = await cf.cfApi<Any[]>(cft, `/zones/${zone.id}/dns_records?type=${type}&name=${encodeURIComponent(name)}`);
        const norm = (s: string) => String(s ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
        if ((existing ?? []).some((e) => norm(e.content) === norm(content))) { same++; continue; }
        const body: Any = { type, name, content, ttl: 1, proxied: false, comment: "Resend · Branta Console" };
        if (type === "MX") body.priority = Number(r.priority ?? 10);
        // Replace a stale DKIM/SPF value at the same name; otherwise add alongside.
        const stale = type === "TXT" ? (existing ?? []).find((e) => (name.includes("_domainkey") || norm(e.content).startsWith("v=spf1")) && (name.includes("_domainkey") || content.startsWith("v=spf1"))) : null;
        // A CNAME can't share its name with A/AAAA/CNAME (and nothing can share with a CNAME): overwrite the clash.
        const { result: sameName } = await cf.cfApi<Any[]>(cft, `/zones/${zone.id}/dns_records?name=${encodeURIComponent(name)}`);
        const clashes = (sameName ?? []).filter((e) => type === "CNAME" ? ["A", "AAAA", "CNAME"].includes(e.type) : e.type === "CNAME");
        if (clashes.length) {
          const [keep, ...rest] = clashes;
          for (const e of rest) await cf.cfApi(cft, `/zones/${zone.id}/dns_records/${e.id}`, { method: "DELETE" });
          if (keep.type === type) await cf.cfApi(cft, `/zones/${zone.id}/dns_records/${keep.id}`, { method: "PATCH", body: JSON.stringify(body) });
          else { await cf.cfApi(cft, `/zones/${zone.id}/dns_records/${keep.id}`, { method: "DELETE" }); await cf.cfApi(cft, `/zones/${zone.id}/dns_records`, { method: "POST", body: JSON.stringify(body) }); }
          updated++; continue;
        }
        if (stale) { await cf.cfApi(cft, `/zones/${zone.id}/dns_records/${stale.id}`, { method: "PATCH", body: JSON.stringify(body) }); updated++; }
        else { await cf.cfApi(cft, `/zones/${zone.id}/dns_records`, { method: "POST", body: JSON.stringify(body) }); added++; }
      }
      return ({ ok: true, detail: `Cloudflare ${zone.name}: ${added} added · ${updated} updated · ${same} already set` });
}
