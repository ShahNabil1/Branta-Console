// Company Integrations → Resend via OAuth + one-click domain/DNS/verify/API key/webhook setup.
// Group-admin gated; every token stays server-side.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const Slug = z.object({ slug: z.string().trim().min(1).max(80) });
export type SetupStage = "domain" | "dns" | "verify" | "key" | "webhook";
export type SetupStep = { stage: SetupStage; ok: boolean; pending?: boolean; detail: string };

async function gate(ctx: { supabase: unknown; userId: string }, slug: string) {
  const sb = ctx.supabase as Any;
  const { data: co } = await sb.from("companies").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!co) throw new Error("Company not found.");
  const { assertGroupAdmin } = await import("@/lib/group-admin");
  await assertGroupAdmin(sb, ctx.userId, "Only Branta Tech group admins can manage company integrations.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { co: co as { id: string; slug: string; name: string }, admin: supabaseAdmin as Any };
}

export const getResendOAuth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const rs = await import("@/lib/company-resend.server");
    const a = await rs.getAccount(co.id);
    const connected = !!(a?.is_active && a.refresh_token_enc);
    return {
      account: connected
        ? { connected_at: a.connected_at as string, domain: (a.resend_domain as string | null) ?? null, last_error: (a.last_error as string | null) ?? null, setup: (a.setup_state ?? {}) as Record<string, SetupStep> }
        : null,
    };
  });

export const startResendConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.extend({ popupId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const rs = await import("@/lib/company-resend.server");
    const origin = new URL(getRequest().url).origin;
    return { url: await rs.authUrl({ c: co.id, s: co.slug, u: context.userId, o: origin, p: data.popupId }) };
  });

export const disconnectResendOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const rs = await import("@/lib/company-resend.server");
    const { open } = await import("@/lib/company-email.server");
    const a = await rs.getAccount(co.id);
    if (a?.refresh_token_enc) { const t = await open(a.refresh_token_enc).catch(() => null); if (t) await rs.revoke(t); }
    rs.clearCache(co.id);
    await rs.updateAccount(co.id, { is_active: false, refresh_token_enc: null, disconnected_at: new Date().toISOString() });
    return { ok: true };
  });

const SetupInput = Slug.extend({
  stage: z.enum(["domain", "dns", "verify", "key", "webhook"]),
  domain: z.string().trim().toLowerCase().regex(/^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "Enter a valid domain"),
  senderEmail: z.string().trim().toLowerCase().email(),
  senderName: z.string().trim().min(1).max(80),
});

/** One step of the automatic setup. The UI calls the stages in order and stops at the first failure. */
export const runResendSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetupInput.parse(i))
  .handler(async ({ data, context }): Promise<SetupStep> => {
    const { co, admin } = await gate(context, data.slug);
    if (data.senderEmail.split("@")[1] !== data.domain) throw new Error(`Sender email must use @${data.domain}.`);
    const rs = await import("@/lib/company-resend.server");
    const m = await import("@/lib/company-email.server");
    const token = await rs.companyResendToken(co.id);
    if (!token) throw new Error("Connect Resend first.");
    const acc = await rs.getAccount(co.id);
    const done = async (step: SetupStep, extra: Record<string, unknown> = {}) => {
      await rs.updateAccount(co.id, { setup_state: { ...(acc?.setup_state ?? {}), [step.stage]: step }, last_error: step.ok || step.pending ? null : step.detail, ...extra });
      return step;
    };
    const perr = (r: { status: number; body: Any }) => `Resend ${r.status}: ${r.body?.message ?? r.body?.name ?? "request failed"}`;

    // Find the company's domain in Resend (stored id first, then by name).
    const findDomain = async () => {
      if (acc?.resend_domain_id && acc.resend_domain === data.domain) {
        const g = await rs.rs(token, `/domains/${acc.resend_domain_id}`);
        if (g.ok) return g.body;
      }
      const l = await rs.rs(token, "/domains");
      const hit = ((l.body?.data ?? []) as Any[]).find((d) => String(d.name).toLowerCase() === data.domain);
      if (!hit) return null;
      const g = await rs.rs(token, `/domains/${hit.id}`);
      return g.ok ? g.body : hit;
    };

    if (data.stage === "domain") {
      let d = await findDomain();
      if (!d) {
        const c = await rs.rs(token, "/domains", { method: "POST", body: { name: data.domain } });
        if (!c.ok) return done({ stage: "domain", ok: false, detail: perr(c) });
        d = c.body;
      }
      const n = (d.records ?? []).length;
      return done({ stage: "domain", ok: true, detail: `${data.domain} in Resend · ${n} DNS record${n === 1 ? "" : "s"} required` }, { resend_domain_id: d.id, resend_domain: data.domain });
    }

    const d = await findDomain();
    if (!d) return done({ stage: data.stage, ok: false, detail: "Domain isn't in Resend yet — run setup from the start." });

    if (data.stage === "dns") {
      const cf = await import("@/lib/company-cloudflare.server");
      const cft = await cf.companyCloudflareToken(co.id).catch(() => null);
      if (!cft) return done({ stage: "dns", ok: false, detail: "Connect this company's Cloudflare account first." });
      // Zone = the domain itself or its closest parent present in the Cloudflare account.
      const parts = data.domain.split(".");
      let zone: Any = null;
      for (let i = 0; i < parts.length - 1 && !zone; i++) {
        const { result } = await cf.cfApi<Any[]>(cft, `/zones?name=${encodeURIComponent(parts.slice(i).join("."))}`);
        zone = result?.[0] ?? null;
      }
      if (!zone) return done({ stage: "dns", ok: false, detail: `${data.domain} isn't in the connected Cloudflare account.` });
      let added = 0, updated = 0, same = 0;
      for (const r of (d.records ?? []) as Any[]) {
        const type = String(r.type ?? (r.record === "DKIM" ? "TXT" : "TXT")).toUpperCase();
        const name = rs.fqdn(String(r.name ?? ""), data.domain);
        const content = String(r.value ?? "").replace(/^"|"$/g, "");
        const { result: existing } = await cf.cfApi<Any[]>(cft, `/zones/${zone.id}/dns_records?type=${type}&name=${encodeURIComponent(name)}`);
        const norm = (s: string) => String(s ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
        if ((existing ?? []).some((e) => norm(e.content) === norm(content))) { same++; continue; }
        const body: Any = { type, name, content, ttl: 1, proxied: false, comment: "Resend · Branta Console" };
        if (type === "MX") body.priority = Number(r.priority ?? 10);
        // Replace a stale DKIM/SPF value at the same name; otherwise add alongside.
        const stale = type === "TXT" ? (existing ?? []).find((e) => (name.includes("_domainkey") || norm(e.content).startsWith("v=spf1")) && (name.includes("_domainkey") || content.startsWith("v=spf1"))) : null;
        if (stale) { await cf.cfApi(cft, `/zones/${zone.id}/dns_records/${stale.id}`, { method: "PATCH", body: JSON.stringify(body) }); updated++; }
        else { await cf.cfApi(cft, `/zones/${zone.id}/dns_records`, { method: "POST", body: JSON.stringify(body) }); added++; }
      }
      return done({ stage: "dns", ok: true, detail: `Cloudflare ${zone.name}: ${added} added · ${updated} updated · ${same} already set` });
    }

    if (data.stage === "verify") {
      if (d.status !== "verified") {
        const v = await rs.rs(token, `/domains/${d.id}/verify`, { method: "POST" });
        if (!v.ok) return done({ stage: "verify", ok: false, detail: perr(v) });
        const g = await rs.rs(token, `/domains/${d.id}`);
        if (g.ok) d.status = g.body?.status;
      }
      if (d.status === "verified") return done({ stage: "verify", ok: true, detail: `${data.domain} verified by Resend` });
      if (d.status === "failed") return done({ stage: "verify", ok: false, detail: "Resend couldn't verify the DNS records. Check them in Cloudflare and retry." });
      return done({ stage: "verify", ok: false, pending: true, detail: `Resend is checking DNS (${d.status ?? "pending"}) — usually under a few minutes.` });
    }

    const { data: existing } = await admin.from("company_email_providers").select("*").eq("company_id", co.id).eq("provider", "resend").maybeSingle();

    if (data.stage === "key") {
      const k = await rs.rs(token, "/api-keys", { method: "POST", body: { name: `Branta Console · ${co.name}`.slice(0, 50), permission: "full_access" } });
      if (!k.ok || !k.body?.token) return done({ stage: "key", ok: false, detail: perr(k) });
      const { data: def } = await admin.from("company_email_providers").select("id").eq("company_id", co.id).eq("is_default", true).eq("is_active", true).maybeSingle();
      const patch: Any = {
        company_id: co.id, provider: "resend", sender_name: data.senderName, sender_email: data.senderEmail, domain: data.domain,
        domain_verified_at: new Date().toISOString(), is_active: true, updated_by: context.userId,
        api_key_enc: await m.seal(k.body.token), api_key_hint: null,
        last_check: { at: new Date().toISOString(), checks: [{ id: "oauth", label: "Resend OAuth setup", ok: true, detail: "Created automatically" }] },
      };
      if (!existing?.is_active) patch.is_default = !def || def.id === existing?.id;
      if (existing && existing.sender_email !== data.senderEmail) patch.webhook_verified_at = null;
      const { error } = await admin.from("company_email_providers").upsert(patch, { onConflict: "company_id,provider" });
      if (error) return done({ stage: "key", ok: false, detail: "Could not save the Resend sender." });
      return done({ stage: "key", ok: true, detail: `Full-access API key created · sender ${data.senderEmail}` });
    }

    // webhook: replace only this company's own hook(s) with one carrying every event.
    const url = m.webhookUrl("resend", co.slug);
    const norm = (u: string) => { try { const x = new URL(u); x.searchParams.delete("token"); return x.toString(); } catch { return u; } };
    const list = await rs.rs(token, "/webhooks");
    if (!list.ok) return done({ stage: "webhook", ok: false, detail: perr(list) });
    for (const w of ((list.body?.data ?? []) as Any[]).filter((w) => norm(w.endpoint) === norm(url))) {
      const del = await rs.rs(token, `/webhooks/${w.id}`, { method: "DELETE" });
      if (!del.ok && del.status !== 404) return done({ stage: "webhook", ok: false, detail: perr(del) });
    }
    const c = await rs.rs(token, "/webhooks", { method: "POST", body: { endpoint: url, events: [...m.RESEND_EVENTS] } });
    if (!c.ok || !c.body?.signing_secret) return done({ stage: "webhook", ok: false, detail: c.ok ? "Resend didn't return a signing secret." : perr(c) });
    const { error } = await admin.from("company_email_providers").update({
      webhook_secret_enc: await m.seal(c.body.signing_secret), webhook_secret_hint: null,
      webhook_verified_at: new Date().toISOString(), webhook_events: [...m.RESEND_EVENTS], updated_by: context.userId,
    }).eq("company_id", co.id).eq("provider", "resend");
    if (error) return done({ stage: "webhook", ok: false, detail: "Webhook created but its secret couldn't be saved. Run setup again." });
    return done({ stage: "webhook", ok: true, detail: `Webhook live · ${m.RESEND_EVENTS.length} events` });
  });
