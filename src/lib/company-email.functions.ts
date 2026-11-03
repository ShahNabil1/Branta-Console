// Company Integrations → Email Settings (Resend / Brevo). Only company managers
// (can_manage_company) may read status or change config; secrets are encrypted
// server-side and only masked hints ever leave the server.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Provider = z.enum(["resend", "brevo"]);
type P = z.infer<typeof Provider>;
const Slug = z.string().trim().min(1).max(80);

export type Check = { id: string; label: string; ok: boolean; detail: string };
export type ProviderView = {
  provider: P; sender_name: string; sender_email: string; domain: string | null;
  api_key_hint: string | null; webhook_secret_hint: string | null;
  domain_verified_at: string | null; webhook_verified_at: string | null;
  webhook_events: string[]; is_default: boolean; updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function gate(ctx: { supabase: unknown; userId: string }, slug: string) {
  const sb = ctx.supabase as Any;
  const { data: co } = await sb.from("companies").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!co) throw new Error("Company not found.");
  const { data: ok } = await sb.rpc("can_manage_company", { _company: co.id, _user: ctx.userId });
  if (!ok) throw new Error("Only this company's admins can manage integrations.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { co: co as { id: string; slug: string; name: string }, admin: supabaseAdmin as Any };
}

/** Gmail that receives this company's mail: its own connected account, else the shared Inbox Gmail. */
async function inboxTarget(companyId: string) {
  const { getAccount } = await import("@/lib/company-google.server");
  const { INBOX_GMAIL } = await import("@/lib/company-email.server");
  const a = await getAccount(companyId).catch(() => null);
  return a?.is_active && a.refresh_token_enc ? (a.google_email as string) : INBOX_GMAIL;
}

async function row(admin: Any, companyId: string, provider: P) {
  const { data } = await admin.from("company_email_providers").select("*")
    .eq("company_id", companyId).eq("provider", provider).maybeSingle();
  return data as Any;
}

function view(r: Any): ProviderView | null {
  if (!r || !r.is_active) return null;
  return {
    provider: r.provider, sender_name: r.sender_name, sender_email: r.sender_email, domain: r.domain,
    api_key_hint: r.api_key_hint, webhook_secret_hint: r.webhook_secret_hint,
    domain_verified_at: r.domain_verified_at, webhook_verified_at: r.webhook_verified_at,
    webhook_events: r.webhook_events ?? [], is_default: r.is_default, updated_at: r.updated_at,
  };
}

export const getEmailIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    const { data: rows } = await admin.from("company_email_providers").select("*").eq("company_id", co.id);
    const by = Object.fromEntries(((rows ?? []) as Any[]).map((r) => [r.provider, view(r)]));
    return {
      company: co,
      resend: (by.resend ?? null) as ProviderView | null,
      brevo: (by.brevo ?? null) as ProviderView | null,
      resendWebhookUrl: m.webhookUrl("resend", co.slug),
      resendEvents: [...m.RESEND_EVENTS],
      brevoEvents: [...m.BREVO_EVENTS],
      inboxGmail: await inboxTarget(co.id),
      inbox: await inboxView(admin, co.id),
    };
  });

const VerifyInput = z.object({
  slug: Slug, provider: Provider,
  // Required for Resend; ignored for Brevo (name is read from the Brevo sender).
  senderName: z.string().trim().max(80).default(""),
  senderEmail: z.string().trim().toLowerCase().email().max(254),
  apiKey: z.string().trim().min(10).max(300).optional(),
});

/** Step 1: real-time API key + sender domain verification; saves on success. */
export const verifyEmailProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VerifyInput.parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    const existing = await row(admin, co.id, data.provider);
    const key = data.apiKey || (existing?.is_active ? await m.open(existing.api_key_enc) : null);
    if (!key) return { ok: false, checks: [{ id: "key", label: "API key", ok: false, detail: "Paste an API key to verify." }] as Check[] };
    const inbox = await inboxView(admin, co.id);
    if (!inbox?.verified_at) throw new Error("Verify the Inbox address first.");
    if (inbox.email !== data.senderEmail) throw new Error(`Sender email must be the verified Inbox address (${inbox.email}).`);
    const domain = data.senderEmail.split("@")[1];
    const checks: Check[] = [];
    let brevoName = "";

    if (data.provider === "resend") {
      if (!key.startsWith("re_")) checks.push({ id: "fmt", label: "Key format", ok: false, detail: "Resend keys start with re_" });
      const r = await m.resend(key, "/domains");
      if (!r.ok) {
        const restricted = r.body?.name === "restricted_api_key";
        checks.push({ id: "key", label: "API key", ok: false, detail: restricted ? "This key is 'Sending access' only. Create a Full access key so domains & webhooks can be verified." : r.status === 401 || r.status === 403 ? "Resend rejected this key." : `Resend error ${r.status}: ${r.body?.message ?? ""}` });
      } else {
        checks.push({ id: "key", label: "API key", ok: true, detail: "Valid Resend key (full access)." });
        const list = (r.body?.data ?? []) as { name: string; status: string; region?: string }[];
        const d = list.find((x) => x.name.toLowerCase() === domain);
        checks.push(d
          ? { id: "domain", label: `Domain ${domain}`, ok: d.status === "verified", detail: d.status === "verified" ? `Verified${d.region ? ` · ${d.region}` : ""}` : `Status: ${d.status}. Finish DNS (DKIM/SPF) in Resend → Domains.` }
          : { id: "domain", label: `Domain ${domain}`, ok: false, detail: `${domain} is not added in this Resend account.` });
      }
    } else {
      if (!key.startsWith("xkeysib-")) checks.push({ id: "fmt", label: "Key format", ok: false, detail: "Brevo API keys start with xkeysib-" });
      const acc = await m.brevo(key, "/account");
      if (!acc.ok) {
        checks.push({ id: "key", label: "API key", ok: false, detail: acc.status === 401 ? "Brevo rejected this key (or your IP is not authorised in Brevo → Security → Authorised IPs)." : `Brevo error ${acc.status}: ${acc.body?.message ?? ""}` });
      } else {
        checks.push({ id: "key", label: "API key", ok: true, detail: `Valid · ${acc.body?.companyName ?? acc.body?.email ?? "Brevo account"}` });
        const [s, dm] = await Promise.all([m.brevo(key, "/senders"), m.brevo(key, "/senders/domains")]);
        if (!s.ok) checks.push({ id: "sender", label: "Read senders", ok: false, detail: `Brevo error ${s.status}: ${s.body?.message ?? ""}` });
        const sender = ((s.body?.senders ?? []) as { email: string; name?: string; active: boolean }[]).find((x) => x.email.toLowerCase() === data.senderEmail);
        if (s.ok) checks.push({ id: "sender", label: `Sender ${data.senderEmail}`, ok: !!sender?.active, detail: sender ? (sender.active ? `Active · "${sender.name ?? ""}"` : "Sender exists but is not active yet — confirm it in Brevo.") : "Add this sender in Brevo → Senders, Domains & IPs." });
        // Brevo owns the From name: always use the name verified there.
        if (sender?.active && sender.name?.trim()) brevoName = sender.name.trim().slice(0, 80);
        else if (sender?.active) checks.push({ id: "name", label: "Sender name", ok: false, detail: "This sender has no name in Brevo. Add one in Brevo → Senders." });
        if (!dm.ok) checks.push({ id: "domain", label: "Read domains", ok: false, detail: `Brevo error ${dm.status}: ${dm.body?.message ?? ""}` });
        const d = ((dm.body?.domains ?? []) as { domain_name: string; authenticated: boolean; verified: boolean }[]).find((x) => x.domain_name.toLowerCase() === domain);
        if (dm.ok) checks.push({ id: "domain", label: `Domain ${domain}`, ok: !!d?.authenticated, detail: d ? (d.authenticated ? "Authenticated (DKIM/DMARC)" : "Domain added but not authenticated — finish DNS in Brevo.") : `${domain} is not added in Brevo → Domains.` });
      }
    }
    if (data.provider === "resend" && !data.senderName) checks.push({ id: "name", label: "Sender name", ok: false, detail: "Enter a sender name." });
    const senderName = data.provider === "brevo" ? brevoName : data.senderName;

    const ok = checks.every((c) => c.ok) && !!senderName;
    if (ok) {
      const patch: Any = {
        company_id: co.id, provider: data.provider, sender_name: senderName, sender_email: data.senderEmail,
        domain, domain_verified_at: new Date().toISOString(), is_active: true, updated_by: context.userId,
        last_check: { at: new Date().toISOString(), checks },
      };
      if (data.apiKey) { patch.api_key_enc = await m.seal(data.apiKey); patch.api_key_hint = m.hint(data.apiKey); }
      if (!existing || !existing.is_active) {
        const { data: def } = await admin.from("company_email_providers").select("id").eq("company_id", co.id).eq("is_default", true).eq("is_active", true).maybeSingle();
        patch.is_default = !def;
      }
      // Sender change invalidates the webhook check for Resend (domain-bound).
      if (existing && existing.sender_email !== data.senderEmail) patch.webhook_verified_at = null;
      const { error } = await admin.from("company_email_providers").upsert(patch, { onConflict: "company_id,provider" });
      if (error) throw new Error("Could not save the integration.");
    }
    return { ok, checks, senderName: senderName || null };
  });

/** Step 2 (Resend): verify the endpoint + events exist and save the signing secret. */
export const verifyResendWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, secret: z.string().trim().regex(/^whsec_[A-Za-z0-9+/=]{16,}$/, "Signing secret must look like whsec_…").optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    const r = await row(admin, co.id, "resend");
    if (!r?.is_active || !r.domain_verified_at) throw new Error("Verify the API key first.");
    const key = (await m.open(r.api_key_enc))!;
    const secret = data.secret || (await m.open(r.webhook_secret_enc));
    const url = m.webhookUrl("resend", co.slug);
    const checks: Check[] = [];
    const list = await m.resend(key, "/webhooks");
    if (!list.ok) {
      checks.push({ id: "list", label: "Read webhooks", ok: false, detail: `Resend error ${list.status}: ${list.body?.message ?? ""}` });
      return { ok: false, checks };
    }
    type W = { id: string; endpoint: string; events: string[]; status?: string };
    const hook = ((list.body?.data ?? []) as W[]).find((w) => w.endpoint.replace(/\/+$/, "") === url);
    checks.push({ id: "endpoint", label: "Endpoint added", ok: !!hook, detail: hook ? "Found in Resend → Webhooks" : "No webhook with this exact URL yet." });
    let events: string[] = [];
    if (hook) {
      const full = await m.resend(key, `/webhooks/${hook.id}`);
      const w = (full.ok ? full.body : hook) as W & { signing_secret?: string };
      events = w.events ?? hook.events ?? [];
      const missing = m.RESEND_EVENTS.filter((e) => !events.includes(e));
      checks.push({ id: "events", label: "Required events", ok: missing.length === 0, detail: missing.length ? `Missing: ${missing.join(", ")}` : `${events.length} events subscribed` });
      checks.push({ id: "status", label: "Webhook enabled", ok: (w.status ?? "enabled") === "enabled", detail: w.status ?? "enabled" });
      if (!secret) checks.push({ id: "secret", label: "Signing secret", ok: false, detail: "Paste the whsec_ signing secret." });
      else if (w.signing_secret) checks.push({ id: "secret", label: "Signing secret", ok: w.signing_secret === secret, detail: w.signing_secret === secret ? "Matches Resend" : "Doesn't match this webhook's secret." });
      else checks.push({ id: "secret", label: "Signing secret", ok: true, detail: "Format valid · confirmed on first event" });
    }
    const ok = checks.every((c) => c.ok);
    if (ok) {
      const patch: Any = { webhook_verified_at: new Date().toISOString(), webhook_events: events, updated_by: context.userId };
      if (data.secret) { patch.webhook_secret_enc = await m.seal(data.secret); patch.webhook_secret_hint = m.hint(data.secret); }
      await admin.from("company_email_providers").update(patch).eq("id", r.id);
    }
    return { ok, checks };
  });

/**
 * Step 2 (Resend): staged, fully automatic webhook setup with the Full access key.
 *  account  → key valid + can read webhooks
 *  clean    → delete duplicate hooks pointing at this company's endpoint
 *  register → create (or repair events/status of) the hook
 *  verify   → read back from Resend, store the signing secret encrypted
 */
const ResendStage = z.enum(["account", "clean", "register", "verify"]);
export const connectResendWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, stage: ResendStage.default("account") }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    const r = await row(admin, co.id, "resend");
    if (!r?.is_active || !r.domain_verified_at) throw new Error("Verify the API key first.");
    const key = (await m.open(r.api_key_enc))!;
    const fail = (id: string, label: string, res: { status: number; body: Any }) =>
      ({ ok: false, checks: [{ id, label, ok: false, detail: `Resend error ${res.status}${res.body?.name ? ` (${res.body.name})` : ""}: ${res.body?.message ?? "no message returned"}` }] as Check[] });
    type W = { id: string; endpoint: string; events: string[]; status?: string; signing_secret?: string };
    const url = m.webhookUrl("resend", co.slug);
    const norm = (u: string) => (u ?? "").replace(/\/+$/, "");
    const list = await m.resend(key, "/webhooks");
    if (!list.ok) return fail("list", list.status === 401 || list.status === 403 ? "API key can't manage webhooks (needs Full access)" : "Read webhooks", list);
    const mine = ((list.body?.data ?? []) as W[]).filter((w) => norm(w.endpoint) === url);

    if (data.stage === "account") {
      return { ok: true, checks: [{ id: "account", label: "Resend account", ok: true, detail: `Full access confirmed · ${(list.body?.data ?? []).length} webhook(s) in account` }] as Check[] };
    }
    if (data.stage === "clean") {
      const extra = mine.slice(1);
      for (const s of extra) {
        const d = await m.resend(key, `/webhooks/${s.id}`, { method: "DELETE" });
        if (!d.ok && d.status !== 404) return fail("clean", `Remove duplicate webhook ${s.id}`, d);
      }
      return { ok: true, checks: [{ id: "clean", label: "Old webhooks", ok: true, detail: extra.length ? `Removed ${extra.length} duplicate hook(s)` : "None to clean" }] as Check[] };
    }
    const hook = mine[0];
    if (data.stage === "register") {
      if (!hook) {
        const c = await m.resend(key, "/webhooks", { method: "POST", body: { endpoint: url, events: [...m.RESEND_EVENTS] } });
        if (!c.ok) return fail("create", "Create webhook", c);
        if (c.body?.signing_secret) await admin.from("company_email_providers").update({ webhook_secret_enc: await m.seal(c.body.signing_secret), webhook_secret_hint: m.hint(c.body.signing_secret), webhook_verified_at: null }).eq("id", r.id);
        return { ok: true, checks: [{ id: "create", label: "Webhook created", ok: true, detail: `ID ${c.body?.id} · ${m.RESEND_EVENTS.length} events` }] as Check[] };
      }
      const missing = m.RESEND_EVENTS.filter((e) => !(hook.events ?? []).includes(e));
      if (!missing.length && (hook.status ?? "enabled") === "enabled") return { ok: true, checks: [{ id: "found", label: "Webhook already registered", ok: true, detail: `ID ${hook.id}` }] as Check[] };
      const events = Array.from(new Set([...(hook.events ?? []), ...m.RESEND_EVENTS]));
      const u = await m.resend(key, `/webhooks/${hook.id}`, { method: "PATCH", body: { endpoint: url, events, status: "enabled" } });
      if (!u.ok) return fail("repair", "Update webhook", u);
      return { ok: true, checks: [{ id: "repair", label: "Webhook repaired", ok: true, detail: missing.length ? `Added ${missing.join(", ")}` : "Re-enabled" }] as Check[] };
    }
    if (!hook) return { ok: false, checks: [{ id: "verify", label: "Webhook in Resend", ok: false, detail: "Resend did not return the webhook after creating it. Retry." }] as Check[] };
    const g = await m.resend(key, `/webhooks/${hook.id}`);
    if (!g.ok) return fail("verify", "Read webhook back", g);
    const w = g.body as W;
    const missing = m.RESEND_EVENTS.filter((e) => !(w.events ?? []).includes(e));
    const secret = w.signing_secret ?? (await m.open(r.webhook_secret_enc));
    const checks: Check[] = [
      { id: "url", label: "Endpoint URL", ok: norm(w.endpoint) === url, detail: norm(w.endpoint) === url ? "Matches this company's endpoint" : `Resend has ${w.endpoint}` },
      { id: "status", label: "Webhook enabled", ok: (w.status ?? "enabled") === "enabled", detail: w.status ?? "enabled" },
      { id: "events", label: "Required events", ok: !missing.length, detail: missing.length ? `Missing in Resend: ${missing.join(", ")}` : `All ${m.RESEND_EVENTS.length} events active` },
      { id: "secret", label: "Signing secret", ok: !!secret, detail: secret ? "Fetched from Resend · stored encrypted" : "Resend returned no signing secret." },
    ];
    const ok = checks.every((c) => c.ok);
    if (ok) await admin.from("company_email_providers").update({ webhook_secret_enc: await m.seal(secret!), webhook_secret_hint: m.hint(secret!), webhook_verified_at: new Date().toISOString(), webhook_events: w.events, updated_by: context.userId }).eq("id", r.id);
    return { ok, checks };
  });

/**
 * Step 2 (Brevo): staged, fully automatic webhook setup. The UI calls each stage in order
 * and drives a 0–100% progress bar from the real results:
 *  account  → key still valid with Brevo
 *  clean    → list transactional hooks, delete stale ones for this company
 *  register → create (or repair) the hook with every required event
 *  verify   → re-read the hook from Brevo, confirm URL + events, then save
 */
const BrevoStage = z.enum(["account", "clean", "register", "verify"]);
export const connectBrevoWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, stage: BrevoStage.default("account") }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    const r = await row(admin, co.id, "brevo");
    if (!r?.is_active || !r.domain_verified_at) throw new Error("Verify the API key first.");
    const key = (await m.open(r.api_key_enc))!;
    const fail = (id: string, label: string, res: { status: number; body: Any }) =>
      ({ ok: false, checks: [{ id, label, ok: false, detail: `Brevo error ${res.status}${res.body?.code ? ` (${res.body.code})` : ""}: ${res.body?.message ?? "no message returned"}` }] as Check[] });
    type W = { id: number; url: string; events: string[]; type?: string };

    if (data.stage === "account") {
      const a = await m.brevo(key, "/account");
      if (!a.ok) return fail("account", a.status === 401 ? "API key rejected (revoked, expired or IP not authorised)" : "Brevo account", a);
      return { ok: true, checks: [{ id: "account", label: "Brevo account", ok: true, detail: `Connected · ${a.body?.companyName ?? a.body?.email ?? "account"}` }] as Check[] };
    }

    // Token: reuse the stored one, or create + persist it before any hook points at it.
    let token = await m.open(r.webhook_secret_enc);
    if (!token) {
      token = m.randomToken();
      await admin.from("company_email_providers").update({ webhook_secret_enc: await m.seal(token), webhook_secret_hint: m.hint(token), webhook_verified_at: null }).eq("id", r.id);
    }
    const url = m.webhookUrl("brevo", co.slug, token);
    const base = m.webhookUrl("brevo", co.slug);
    const list = await m.brevo(key, "/webhooks?type=transactional");
    if (!list.ok) return fail("list", "Read webhooks", list);
    const hooks = (list.body?.webhooks ?? []) as W[];
    const hook = hooks.find((w) => w.url === url);

    if (data.stage === "clean") {
      const stale = hooks.filter((w) => w.url.startsWith(base) && w.url !== url);
      for (const s of stale) {
        const d = await m.brevo(key, `/webhooks/${s.id}`, { method: "DELETE" });
        if (!d.ok && d.status !== 404) return fail("clean", `Remove old webhook #${s.id}`, d);
      }
      return { ok: true, checks: [{ id: "clean", label: "Old webhooks", ok: true, detail: stale.length ? `Removed ${stale.length} outdated hook(s)` : "None to clean" }] as Check[] };
    }

    if (data.stage === "register") {
      if (!hook) {
        const c = await m.brevo(key, "/webhooks", { method: "POST", body: { url, description: `Branta Console · ${co.name}`, events: [...m.BREVO_EVENTS], type: "transactional" } });
        if (!c.ok) return fail("create", "Create webhook", c);
        return { ok: true, checks: [{ id: "create", label: "Webhook created", ok: true, detail: `ID ${c.body?.id} · ${m.BREVO_EVENTS.length} events` }] as Check[] };
      }
      const missing = m.BREVO_EVENTS.filter((e) => !hook.events.includes(e));
      if (!missing.length) return { ok: true, checks: [{ id: "found", label: "Webhook already registered", ok: true, detail: `ID ${hook.id}` }] as Check[] };
      const u = await m.brevo(key, `/webhooks/${hook.id}`, { method: "PUT", body: { url, events: [...m.BREVO_EVENTS] } });
      if (!u.ok) return fail("repair", "Update webhook events", u);
      return { ok: true, checks: [{ id: "repair", label: "Webhook events updated", ok: true, detail: `Added ${missing.join(", ")}` }] as Check[] };
    }

    // verify: read back from Brevo, never trust our own write.
    if (!hook) return { ok: false, checks: [{ id: "verify", label: "Webhook in Brevo", ok: false, detail: "Brevo did not return the webhook after creating it. Retry." }] as Check[] };
    const g = await m.brevo(key, `/webhooks/${hook.id}`);
    if (!g.ok) return fail("verify", "Read webhook back", g);
    const w = g.body as W;
    const missing = m.BREVO_EVENTS.filter((e) => !(w.events ?? []).includes(e));
    const checks: Check[] = [
      { id: "url", label: "Endpoint URL", ok: w.url === url, detail: w.url === url ? "Matches this company's private endpoint" : "URL in Brevo differs from this company's endpoint." },
      { id: "type", label: "Webhook type", ok: (w.type ?? "transactional") === "transactional", detail: w.type ?? "transactional" },
      { id: "events", label: "Required events", ok: !missing.length, detail: missing.length ? `Missing in Brevo: ${missing.join(", ")}` : `All ${m.BREVO_EVENTS.length} events active` },
      { id: "token", label: "Private token", ok: true, detail: "Stored encrypted" },
    ];
    const ok = checks.every((c) => c.ok);
    if (ok) await admin.from("company_email_providers").update({ webhook_verified_at: new Date().toISOString(), webhook_events: w.events, updated_by: context.userId }).eq("id", r.id);
    return { ok, checks };
  });

export const checkInboundRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, email: z.string().trim().toLowerCase().email(), create: z.boolean().default(false) }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const { data: own } = await admin.from("company_email_providers").select("id").eq("company_id", co.id).eq("sender_email", data.email).eq("is_active", true).limit(1);
    if (!own?.length) throw new Error("Only a configured sender address can be routed.");
    const m = await import("@/lib/company-email.server");
    return m.inboundRouting(data.email, data.create, await inboxTarget(co.id));
  });

export const sendProviderTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, provider: Provider }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    const r = await row(admin, co.id, data.provider);
    if (!r?.is_active || !r.domain_verified_at) throw new Error("Verify the provider first.");
    const to = (context.claims as { email?: string })?.email;
    if (!to) throw new Error("Your account has no email address.");
    const key = (await m.open(r.api_key_enc))!;
    const subject = `${co.name} · ${data.provider === "resend" ? "Resend" : "Brevo"} test`;
    const html = `<p>This is a test from <b>${co.name}</b> via ${data.provider}. Delivery and webhook events will appear in the Console.</p>`;
    const res = data.provider === "resend"
      ? await m.resend(key, "/emails", { method: "POST", body: { from: `${r.sender_name} <${r.sender_email}>`, to: [to], reply_to: r.sender_email, subject, html } })
      : await m.brevo(key, "/smtp/email", { method: "POST", body: { sender: { name: r.sender_name, email: r.sender_email }, to: [{ email: to }], replyTo: { email: r.sender_email }, subject, htmlContent: html } });
    if (!res.ok) throw new Error(`${data.provider} error ${res.status}: ${res.body?.message ?? ""}`);
    return { to };
  });

export const setDefaultProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, provider: Provider }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    await admin.from("company_email_providers").update({ is_default: false }).eq("company_id", co.id);
    await admin.from("company_email_providers").update({ is_default: true, updated_by: context.userId }).eq("company_id", co.id).eq("provider", data.provider).eq("is_active", true);
    return { ok: true };
  });

/** Disconnect: wipes stored secrets, keeps the row for audit (never hard-delete). */
export const disconnectProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, provider: Provider }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    await admin.from("company_email_providers").update({
      is_active: false, is_default: false, api_key_enc: null, api_key_hint: null, webhook_secret_enc: null,
      webhook_secret_hint: null, domain_verified_at: null, webhook_verified_at: null, updated_by: context.userId,
    }).eq("company_id", co.id).eq("provider", data.provider);
    const { data: left } = await admin.from("company_email_providers").select("id").eq("company_id", co.id).eq("is_active", true).limit(1);
    if (left?.[0]) await admin.from("company_email_providers").update({ is_default: true }).eq("id", left[0].id);
    return { ok: true };
  });

// ---------- Inbox address (routed to the shared Gmail) ----------
export type InboxView = { email: string; verified_at: string | null; probe_code: string | null; probe_started_at: string | null };
async function inboxView(admin: Any, companyId: string): Promise<InboxView | null> {
  const { data } = await admin.from("company_inbox_addresses").select("email, verified_at, probe_code, probe_started_at").eq("company_id", companyId).maybeSingle();
  return (data as InboxView) ?? null;
}

/** Save the Inbox address and issue a one-time code for the probe email. */
export const startInboxVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, email: z.string().trim().toLowerCase().email().max(254) }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    if (data.email === m.INBOX_GMAIL || data.email === (await inboxTarget(co.id))) throw new Error("Use the company address that forwards to the Inbox, not the Inbox Gmail itself.");
    const cur = await inboxView(admin, co.id);
    const code = `BRANTA-${m.randomToken(6).toUpperCase()}`;
    const patch: Any = { company_id: co.id, email: data.email, probe_code: code, probe_started_at: new Date().toISOString(), updated_by: context.userId };
    if (!cur || cur.email !== data.email) patch.verified_at = null;
    const { error } = await admin.from("company_inbox_addresses").upsert(patch, { onConflict: "company_id" });
    if (error) throw new Error("Could not save the Inbox address.");
    return { email: data.email, code };
  });

/** Looks for the probe email in the shared Gmail, delivered to the Inbox address. */
export const checkInboxVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const cur = await inboxView(admin, co.id);
    if (!cur?.probe_code) throw new Error("Start verification first.");
    const { callGateway } = await import("@/lib/connector-gateway.server");
    type L = { messages?: { id: string }[] };
    type H = { name: string; value: string };
    type Msg = { payload?: { headers?: H[] } };
    let list: L;
    try {
      list = await callGateway<L>({ connector: "google_mail", companyId: co.id, path: "/gmail/v1/users/me/messages", query: { q: `"${cur.probe_code}" newer_than:2d`, includeSpamTrash: true, maxResults: 5 } });
    } catch (e) {
      return { ok: false, message: `Could not read the Inbox Gmail: ${e instanceof Error ? e.message : "error"}` };
    }
    const ids = list.messages ?? [];
    if (!ids.length) return { ok: false, message: `No email with code ${cur.probe_code} has arrived yet. Routing may be missing, or give it a minute.` };
    for (const { id } of ids) {
      const msg = await callGateway<Msg>({ connector: "google_mail", companyId: co.id, path: `/gmail/v1/users/me/messages/${encodeURIComponent(id)}`, query: { format: "metadata", metadataHeaders: ["To", "Cc", "Delivered-To", "X-Forwarded-To", "X-Original-To", "Subject"] } });
      const hs = msg.payload?.headers ?? [];
      const hit = hs.some((h) => ["to", "cc", "delivered-to", "x-forwarded-to", "x-original-to"].includes(h.name.toLowerCase()) && h.value.toLowerCase().includes(cur.email));
      if (hit) {
        await admin.from("company_inbox_addresses").update({ verified_at: new Date().toISOString(), probe_code: null, updated_by: context.userId }).eq("company_id", co.id);
        return { ok: true, message: `${cur.email} is delivering to the Inbox.` };
      }
    }
    return { ok: false, message: `The code arrived, but not via ${cur.email}. Send it to ${cur.email} exactly.` };
  });

// ---------- Automatic Inbox probe (global Branta Resend → company address → Gmail) ----------
export type ProbeStage = "sent" | "delivered" | "forwarded" | "verified" | "failed";

/** Issues a fresh code and emails it from the global Branta Tech Resend sender to the Inbox address. */
export const sendInboxProbe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, email: z.string().trim().toLowerCase().email().max(254) }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    if (data.email === m.INBOX_GMAIL || data.email === (await inboxTarget(co.id))) throw new Error("Use the company address that forwards to the Inbox, not the Inbox Gmail itself.");
    const cur = await inboxView(admin, co.id);
    const code = `BRANTA-${m.randomToken(6).toUpperCase()}`;
    const patch: Any = { company_id: co.id, email: data.email, probe_code: code, probe_started_at: new Date().toISOString(), updated_by: context.userId };
    if (!cur || cur.email !== data.email) patch.verified_at = null;
    const { error } = await admin.from("company_inbox_addresses").upsert(patch, { onConflict: "company_id" });
    if (error) throw new Error("Could not save the Inbox address.");
    const { callGateway } = await import("@/lib/connector-gateway.server");
    try {
      const r = await callGateway<{ id: string }>({
        connector: "resend", path: "/emails", method: "POST",
        body: {
          from: "Branta Tech <hello@brantatech.com>", to: [data.email],
          subject: `[${code}] Inbox verification for ${co.name}`,
          html: `<p>This automatic message verifies that <b>${data.email}</b> forwards to the Branta Console Inbox.</p><p>Code: <b>${code}</b></p><p>No action needed.</p>`,
          tags: [{ name: "purpose", value: "inbox_probe" }, { name: "company", value: co.slug.replace(/[^a-zA-Z0-9_-]/g, "_") }],
        },
      });
      return { emailId: r.id, code };
    } catch (e) {
      throw new Error(`Branta Tech's Resend could not send the test email: ${e instanceof Error ? e.message : "error"}`);
    }
  });

/** Reports real progress: Resend delivery status, then the Gmail arrival with routing headers. */
export const pollInboxProbe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug, emailId: z.string().trim().min(8).max(100).regex(/^[a-zA-Z0-9-]+$/) }).parse(i))
  .handler(async ({ data, context }): Promise<{ stage: ProbeStage; message: string }> => {
    const { co, admin } = await gate(context, data.slug);
    const cur = await inboxView(admin, co.id);
    if (cur?.verified_at && !cur.probe_code) return { stage: "verified", message: `${cur.email} is delivering to the Inbox.` };
    if (!cur?.probe_code) throw new Error("Start verification first.");
    const { callGateway } = await import("@/lib/connector-gateway.server");
    let last = "sent";
    try {
      const em = await callGateway<{ to?: string[]; subject?: string; last_event?: string }>({ connector: "resend", path: `/emails/${data.emailId}` });
      const to = (em.to ?? []).map((x) => x.toLowerCase());
      if (!to.includes(cur.email) || !(em.subject ?? "").includes(cur.probe_code)) throw new Error("This test email does not belong to the current verification.");
      last = em.last_event ?? "sent";
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("This test")) throw e;
    }
    const failReasons: Record<string, string> = {
      bounced: `The mail server for ${cur.email.split("@")[1]} rejected the email. Check that Email Routing is enabled for this domain in Cloudflare (MX records) and that ${cur.email} has a routing rule.`,
      failed: "Resend could not send the test email. Press Retry.",
      complained: "The test email was marked as spam by the receiving server.",
      suppressed: `${cur.email} is on Resend's suppression list because an earlier email bounced. Remove it in Resend → Suppressions, then Retry.`,
    };
    if (failReasons[last]) return { stage: "failed", message: failReasons[last] };
    // Gmail check (whether or not Resend has reported delivery yet)
    type H = { name: string; value: string };
    try {
      const list = await callGateway<{ messages?: { id: string }[] }>({ connector: "google_mail", companyId: co.id, path: "/gmail/v1/users/me/messages", query: { q: `"${cur.probe_code}" newer_than:1d`, includeSpamTrash: true, maxResults: 5 } });
      for (const { id } of list.messages ?? []) {
        const msg = await callGateway<{ payload?: { headers?: H[] } }>({ connector: "google_mail", companyId: co.id, path: `/gmail/v1/users/me/messages/${encodeURIComponent(id)}`, query: { format: "metadata", metadataHeaders: ["To", "Delivered-To", "X-Forwarded-To", "X-Original-To"] } });
        const hit = (msg.payload?.headers ?? []).some((h) => ["to", "delivered-to", "x-forwarded-to", "x-original-to"].includes(h.name.toLowerCase()) && h.value.toLowerCase().includes(cur.email));
        if (hit) {
          await admin.from("company_inbox_addresses").update({ verified_at: new Date().toISOString(), probe_code: null, updated_by: context.userId }).eq("company_id", co.id);
          return { stage: "verified", message: `${cur.email} is delivering to the Inbox.` };
        }
      }
      if ((list.messages ?? []).length) return { stage: "forwarded", message: "Arrived in the Inbox Gmail — checking routing headers…" };
    } catch (e) {
      return { stage: "failed", message: `Could not read the Inbox Gmail: ${e instanceof Error ? e.message : "error"}` };
    }
    if (last === "delivered") return { stage: "delivered", message: `Accepted by ${cur.email.split("@")[1]}. Waiting for Cloudflare to forward it to the Inbox Gmail…` };
    return { stage: "sent", message: "Sent by Branta Tech's Resend. Waiting for the receiving server…" };
  });
