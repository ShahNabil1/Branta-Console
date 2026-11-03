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
  senderName: z.string().trim().min(1).max(80),
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
        const sender = ((s.body?.senders ?? []) as { email: string; active: boolean }[]).find((x) => x.email.toLowerCase() === data.senderEmail);
        checks.push({ id: "sender", label: `Sender ${data.senderEmail}`, ok: !!sender?.active, detail: sender ? (sender.active ? "Active sender" : "Sender exists but is not active yet.") : "Add this sender in Brevo → Senders, Domains & IPs." });
        const d = ((dm.body?.domains ?? []) as { domain_name: string; authenticated: boolean; verified: boolean }[]).find((x) => x.domain_name.toLowerCase() === domain);
        checks.push({ id: "domain", label: `Domain ${domain}`, ok: !!d?.authenticated, detail: d ? (d.authenticated ? "Authenticated (DKIM/DMARC)" : "Domain added but not authenticated — finish DNS in Brevo.") : `${domain} is not added in Brevo → Domains.` });
      }
    }

    const ok = checks.every((c) => c.ok);
    if (ok) {
      const patch: Any = {
        company_id: co.id, provider: data.provider, sender_name: data.senderName, sender_email: data.senderEmail,
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
    return { ok, checks };
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

/** Step 2 (Brevo): create/repair the transactional webhook with a private token, then verify. */
export const connectBrevoWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const m = await import("@/lib/company-email.server");
    const r = await row(admin, co.id, "brevo");
    if (!r?.is_active || !r.domain_verified_at) throw new Error("Verify the API key first.");
    const key = (await m.open(r.api_key_enc))!;
    let token = await m.open(r.webhook_secret_enc);
    const fresh = !token;
    if (!token) token = m.randomToken();
    const url = m.webhookUrl("brevo", co.slug, token);
    const base = m.webhookUrl("brevo", co.slug);
    const checks: Check[] = [];
    type W = { id: number; url: string; events: string[] };
    const list = await m.brevo(key, "/webhooks?type=transactional");
    if (!list.ok) return { ok: false, checks: [{ id: "list", label: "Read webhooks", ok: false, detail: `Brevo error ${list.status}: ${list.body?.message ?? ""}` }] };
    const hooks = (list.body?.webhooks ?? []) as W[];
    let hook = hooks.find((w) => w.url === url);
    const stale = hooks.filter((w) => w.url.startsWith(base) && w.url !== url);
    if (!hook) {
      const c = await m.brevo(key, "/webhooks", { method: "POST", body: { url, description: `Branta Console · ${co.name}`, events: [...m.BREVO_EVENTS], type: "transactional" } });
      if (!c.ok) return { ok: false, checks: [{ id: "create", label: "Create webhook", ok: false, detail: `Brevo error ${c.status}: ${c.body?.message ?? ""}` }] };
      hook = { id: c.body?.id, url, events: [...m.BREVO_EVENTS] };
      checks.push({ id: "create", label: "Webhook created in Brevo", ok: true, detail: `ID ${hook.id}` });
    } else {
      const missing = m.BREVO_EVENTS.filter((e) => !hook!.events.includes(e));
      if (missing.length) {
        const u = await m.brevo(key, `/webhooks/${hook.id}`, { method: "PUT", body: { url, events: [...m.BREVO_EVENTS] } });
        checks.push({ id: "repair", label: "Events updated", ok: u.ok, detail: u.ok ? `Added ${missing.join(", ")}` : `Brevo error ${u.status}` });
      } else checks.push({ id: "found", label: "Webhook connected", ok: true, detail: `ID ${hook.id}` });
    }
    for (const s of stale) await m.brevo(key, `/webhooks/${s.id}`, { method: "DELETE" });
    checks.push({ id: "events", label: "Required events", ok: true, detail: `${m.BREVO_EVENTS.length} events subscribed` });
    checks.push({ id: "token", label: "Private token", ok: true, detail: "Generated & stored encrypted" });
    const ok = checks.every((c) => c.ok);
    if (ok) {
      const patch: Any = { webhook_verified_at: new Date().toISOString(), webhook_events: [...m.BREVO_EVENTS], updated_by: context.userId };
      if (fresh) { patch.webhook_secret_enc = await m.seal(token); patch.webhook_secret_hint = m.hint(token); }
      await admin.from("company_email_providers").update(patch).eq("id", r.id);
    }
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
    if (data.email === m.INBOX_GMAIL) throw new Error("Use the company address that forwards to the Inbox, not the Inbox Gmail itself.");
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
    if (data.email === m.INBOX_GMAIL) throw new Error("Use the company address that forwards to the Inbox, not the Inbox Gmail itself.");
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
