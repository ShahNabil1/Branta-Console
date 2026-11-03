// Company Integrations → dedicated Google account (Gmail inbox + Calendar).
// Gated by can_manage_company; tokens never leave the server.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const Slug = z.object({ slug: z.string().trim().min(1).max(80) });

export type GoogleConnection = {
  email: string; name: string | null; scopes: string[]; connected_at: string;
  last_checked_at: string | null; last_error: string | null;
  gmail: boolean; calendar: boolean;
} | null;

async function gate(ctx: { supabase: unknown; userId: string }, slug: string) {
  const sb = ctx.supabase as Any;
  const { data: co } = await sb.from("companies").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!co) throw new Error("Company not found.");
  const { data: ok } = await sb.rpc("can_manage_company", { _company: co.id, _user: ctx.userId });
  if (!ok) throw new Error("Only this company's admins can manage integrations.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { co: co as { id: string; slug: string; name: string }, admin: supabaseAdmin as Any };
}

function view(a: Any): GoogleConnection {
  if (!a?.is_active) return null;
  const s: string[] = a.scopes ?? [];
  return {
    email: a.google_email, name: a.google_name, scopes: s, connected_at: a.connected_at,
    last_checked_at: a.last_checked_at, last_error: a.last_error,
    gmail: s.includes("https://www.googleapis.com/auth/gmail.readonly"),
    calendar: s.includes("https://www.googleapis.com/auth/calendar.events"),
  };
}

export const getGoogleConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const g = await import("@/lib/company-google.server");
    return { configured: !!(process.env.COMPANY_GOOGLE_CLIENT_ID && process.env.COMPANY_GOOGLE_CLIENT_SECRET), account: view(await g.getAccount(co.id)) };
  });

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.extend({ hint: z.string().email().max(254).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const g = await import("@/lib/company-google.server");
    const origin = new URL(getRequest().url).origin;
    const state = await g.signState({ c: co.id, s: co.slug, u: context.userId, o: origin });
    return { url: g.authUrl(state, origin, data.hint) };
  });

/** Live check: refresh the token, read the Gmail profile and the primary calendar. */
export const testGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const g = await import("@/lib/company-google.server");
    const checks: { id: string; label: string; ok: boolean; detail: string }[] = [];
    let token: string | null = null;
    try {
      g.clearCache(co.id);
      token = await g.companyGoogleToken(co.id);
      checks.push({ id: "token", label: "Google access", ok: !!token, detail: token ? "Access token refreshed." : "No Google account connected." });
    } catch (e) {
      checks.push({ id: "token", label: "Google access", ok: false, detail: e instanceof Error ? e.message : "Refresh failed." });
    }
    if (token) {
      const h = { Authorization: `Bearer ${token}` };
      const gm = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: h });
      const gj = (await gm.json().catch(() => ({}))) as Any;
      checks.push({ id: "gmail", label: "Gmail inbox", ok: gm.ok, detail: gm.ok ? `${gj.emailAddress} · ${Number(gj.messagesTotal ?? 0).toLocaleString()} messages` : gj.error?.message ?? `Gmail error ${gm.status}` });
      const cl = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1", { headers: h });
      const cj = (await cl.json().catch(() => ({}))) as Any;
      checks.push({ id: "calendar", label: "Google Calendar", ok: cl.ok, detail: cl.ok ? `Primary calendar reachable (${cj.timeZone ?? "timezone unknown"}).` : cj.error?.message ?? `Calendar error ${cl.status}` });
    }
    const allOk = checks.every((c) => c.ok);
    await admin.from("company_google_accounts").update({ last_checked_at: new Date().toISOString(), last_error: allOk ? null : checks.find((c) => !c.ok)?.detail ?? null }).eq("company_id", co.id);
    return { ok: allOk, checks };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const g = await import("@/lib/company-google.server");
    const { open } = await import("@/lib/company-email.server");
    const acc = await g.getAccount(co.id);
    if (acc?.refresh_token_enc) { const t = await open(acc.refresh_token_enc).catch(() => null); if (t) await g.revoke(t); }
    g.clearCache(co.id);
    // Keep the row as history; drop the credential.
    await admin.from("company_google_accounts").update({ is_active: false, refresh_token_enc: null, disconnected_at: new Date().toISOString() }).eq("company_id", co.id);
    return { ok: true };
  });
