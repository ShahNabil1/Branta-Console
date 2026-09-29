// Invoice email delivery — Resend-only, branded, attaches signed PDF.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { z } from "zod";

export interface InvoiceEmailEventRow {
  id: string;
  invoice_id: string;
  installment_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  provider_message_id: string | null;
  status: string;
  trigger: string;
  error_message: string | null;
  sent_by: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  bounced_at: string | null;
}

export interface InvoiceRecipient {
  email: string;
  name: string | null;
  role: string | null;
  is_primary: boolean;
  source: "customer" | "lead" | "contact" | "employee";
  label?: string | null;
}

type InvoiceRecipientWithLabel = InvoiceRecipient & { label?: string | null };

function renderVars(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null || v === "" ? `{{${key}}}` : String(v);
  });
}

function money(n: number, cur: string): string {
  const sym = cur === "BDT" ? "৳ " : cur === "USD" ? "$ " : `${cur} `;
  return sym + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const listInvoiceRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<InvoiceRecipient[]> => {
    const { data: inv } = await context.supabase
      .from("invoices").select("id, customer_id").eq("slug", data.slug).maybeSingle();
    if (!inv) return [];
    const invoice = inv as { id: string; customer_id: string };
    const customerId = invoice.customer_id;
    const { data: cust } = await context.supabase
      .from("customers").select("name, email, converted_from_lead_id")
      .eq("id", customerId).maybeSingle();
    const c = cust as { name: string; email: string | null; converted_from_lead_id: string | null } | null;
    const out: InvoiceRecipientWithLabel[] = [];
    const push = (row: InvoiceRecipientWithLabel) => {
      const email = row.email.trim();
      if (!email) return;
      if (out.some((o) => o.email.toLowerCase() === email.toLowerCase())) return;
      out.push({ ...row, email });
    };
    if (c?.email) push({ email: c.email, name: c.name ?? null, role: "Customer", is_primary: true, source: "customer", label: "primary" });
    if (c?.converted_from_lead_id) {
      const { data: lead } = await context.supabase
        .from("leads").select("name, email, email_label, alt_email, alt_email_label")
        .eq("id", c.converted_from_lead_id).maybeSingle();
      const l = lead as { name: string | null; email: string | null; email_label: string | null; alt_email: string | null; alt_email_label: string | null } | null;
      if (l?.email) push({ email: l.email, name: l.name ?? c.name ?? null, role: "Lead", is_primary: false, source: "lead", label: l.email_label ?? "lead" });
      if (l?.alt_email) push({ email: l.alt_email, name: l.name ?? c.name ?? null, role: "Lead", is_primary: false, source: "lead", label: l.alt_email_label ?? "alt" });
      const { data: contacts } = await context.supabase
        .from("lead_contacts").select("name, email, email_label, alt_email, alt_email_label, role, is_primary")
        .eq("lead_id", c.converted_from_lead_id);
      for (const row of (contacts ?? []) as Array<{ name: string | null; email: string | null; email_label: string | null; alt_email: string | null; alt_email_label: string | null; role: string | null; is_primary: boolean }>) {
        if (row.email) push({ email: row.email, name: row.name, role: row.role, is_primary: row.is_primary, source: "contact", label: row.email_label ?? (row.is_primary ? "primary" : "contact") });
        if (row.alt_email) push({ email: row.alt_email, name: row.name, role: row.role, is_primary: false, source: "contact", label: row.alt_email_label ?? "alt" });
      }
    }
    const { data: stakeholders } = await context.supabase
      .from("invoice_stakeholders")
      .select("user_id, role")
      .eq("invoice_id", invoice.id);
    const userIds = Array.from(new Set(((stakeholders ?? []) as Array<{ user_id: string }>).map((s) => s.user_id)));
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const nameByUser = new Map<string, string | null>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) => nameByUser.set(p.user_id, p.full_name));
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const emailByUser = new Map<string, string | null>();
        (usersPage?.users ?? []).forEach((u) => emailByUser.set(u.id, u.email ?? null));
        for (const s of (stakeholders ?? []) as Array<{ user_id: string; role: string }>) {
          const email = emailByUser.get(s.user_id);
          if (email) push({ email, name: nameByUser.get(s.user_id) ?? null, role: s.role, is_primary: false, source: "employee", label: "team" });
        }
      } catch {
        // Auth email enrichment is best-effort; customer/contact recipients still work.
      }
    }
    return out;
  });

export const listInvoiceEmailEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<InvoiceEmailEventRow[]> => {
    const { data: inv } = await context.supabase
      .from("invoices").select("id").eq("slug", data.slug).maybeSingle();
    if (!inv) return [];
    const { data: rows } = await context.supabase
      .from("invoice_email_events").select("*")
      .eq("invoice_id", (inv as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(200);
    return (rows ?? []) as unknown as InvoiceEmailEventRow[];
  });

export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    slug: string;
    recipients: Array<{ email: string; name?: string | null }>;
    trigger?: string;
    installment_id?: string | null;
    subjectOverride?: string;
  }) =>
    z.object({
      slug: z.string().min(1),
      recipients: z.array(z.object({
        email: z.string().trim().email(),
        name: z.string().max(160).nullable().optional(),
      })).min(1).max(20),
      trigger: z.enum(["manual", "auto_created", "auto_installment_paid", "auto_fully_paid", "resend"]).optional(),
      installment_id: z.string().uuid().nullable().optional(),
      subjectOverride: z.string().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const trigger = data.trigger ?? "manual";
    return await internalSendInvoiceEmail({
      slug: data.slug,
      recipients: data.recipients,
      trigger,
      installment_id: data.installment_id ?? null,
      subjectOverride: data.subjectOverride,
      actorId: context.userId,
    });
  });

/**
 * Server-only implementation. Callable from other server fns/routes without going
 * through the RPC boundary. Never import from client.
 */
type InvoiceEmailTrigger = "manual" | "auto_created" | "auto_installment_paid" | "auto_fully_paid" | "resend" | "reminder";

export async function internalSendInvoiceEmail(opts: {
  slug: string;
  recipients: Array<{ email: string; name?: string | null }>;
  trigger: InvoiceEmailTrigger;
  installment_id?: string | null;
  subjectOverride?: string;
  bodyOverride?: string;
  extraVars?: Record<string, string>;
  actorId?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadInvoicePdfPayload } = await import("@/lib/invoice-pdf-signing.server");
  const { renderInvoicePdf } = await import("@/lib/invoice-pdf.server");
  const { callGateway } = await import("@/lib/connector-gateway.server");
  const { buildSignedInvoiceUrl } = await import("@/lib/invoice-pdf-signing.server");

  const payload = await loadInvoicePdfPayload(supabaseAdmin, opts.slug);
  if (!payload) throw new Error("Invoice not found");

  const { data: emailSettings } = await supabaseAdmin
    .from("invoice_email_settings").select("*").eq("id", "default").maybeSingle();
  const es = emailSettings as {
    from_name: string; from_email: string; reply_to: string | null;
    subject_template: string; brand_color: string; background_color: string;
    card_background: string; header_html: string; body_html: string;
    cta_label: string; footer_html: string;
  } | null;
  const settings = es ?? {
    from_name: "Invoice — Branta Tech", from_email: "finance@brantatech.com", reply_to: "finance@brantatech.com",
    subject_template: "Invoice {{invoice_slug}} — {{invoice_title}} ({{currency}} {{total_amount}})",
    brand_color: "#E56A17", background_color: "#F9FAFB", card_background: "#FFFFFF",
    header_html: "<h1>Invoice {{invoice_slug}}</h1>",
    body_html: "<p>Hi {{recipient_name}}, please find your invoice attached.</p>",
    cta_label: "View invoice",
    footer_html: "<p>— Branta Tech · Finance</p>",
  };

  const pdfSettings = payload.settings ?? {
    company_name: "Branta Tech", company_tagline: null, company_address: null,
    company_email: null, company_website: null, logo_url: null,
    brand_color: "#E56A17", header_bg_color: "#FFFFFF", page_bg_color: "#FFFFFF",
    panel_bg_color: "#F9FAFB", text_color: "#111827", muted_color: "#6B7280",
    hairline_color: "#E5E7EB", header_text: "INVOICE", footer_text: "Thank you.",
    signature_name: null, signature_title: null,
    sections: { description: true, installments: true, stakeholders: false, notes: true, footer: true },
  };

  const pdfBytes = await renderInvoicePdf({
    invoice: payload.invoice,
    customer: payload.customer,
    installments: payload.installments,
    settings: pdfSettings,
  });
  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

  // Build a signed public URL for the CTA. Fall back to request origin.
  const { getRequestOrigin } = await import("@/lib/invoice-request-origin.server");
  let origin = await getRequestOrigin();
  if (!origin) origin = process.env.PUBLIC_BASE_URL || "https://console.brantatech.com";

  const signedUrl = buildSignedInvoiceUrl(origin, opts.slug);

  const outstanding = Math.max(0, Number(payload.invoice.total_amount) - Number(payload.invoice.paid_amount));
  const results: Array<{ email: string; ok: boolean; error?: string; eventId?: string }> = [];

  for (const r of opts.recipients) {
    const vars: Record<string, string> = {
      recipient_name: r.name ?? r.email.split("@")[0],
      invoice_slug: payload.invoice.slug,
      invoice_title: payload.invoice.title,
      currency: payload.invoice.currency,
      total_amount: money(payload.invoice.total_amount, payload.invoice.currency).replace(/^[^\d]+/, ""),
      paid_amount: money(payload.invoice.paid_amount, payload.invoice.currency).replace(/^[^\d]+/, ""),
      outstanding_amount: money(outstanding, payload.invoice.currency).replace(/^[^\d]+/, ""),
      customer_name: payload.customer.name ?? "",
      status: payload.invoice.status,
      view_url: signedUrl,
      ...(opts.extraVars ?? {}),
    };

    const subject = opts.subjectOverride
      ? renderVars(opts.subjectOverride, vars)
      : renderVars(settings.subject_template, vars);
    const header = renderVars(settings.header_html, vars);
    const body = renderVars(opts.bodyOverride ?? settings.body_html, vars);
    const footer = renderVars(settings.footer_html, vars);

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:${settings.background_color};font-family:Inter,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${settings.background_color};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:${settings.card_background};border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;">
<tr><td style="padding:24px 28px 12px;border-bottom:3px solid ${settings.brand_color};">${header}</td></tr>
<tr><td style="padding:20px 28px;">${body}
<div style="margin:20px 0;">
  <a href="${signedUrl}" style="display:inline-block;padding:10px 18px;background:${settings.brand_color};color:#fff;text-decoration:none;border-radius:4px;font:600 13px/1 Inter,Arial,sans-serif;">${renderVars(settings.cta_label, vars)}</a>
</div>
</td></tr>
<tr><td style="padding:0 28px 22px;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    // Insert queued event first for realtime UI.
    const { data: eventRow, error: insErr } = await supabaseAdmin
      .from("invoice_email_events")
      .insert({
        invoice_id: payload.invoice.id,
        installment_id: opts.installment_id ?? null,
        recipient_email: r.email,
        recipient_name: r.name ?? null,
        subject,
        status: "sending",
        trigger: opts.trigger,
        sent_by: opts.actorId ?? null,
      })
      .select("id").single();
    if (insErr || !eventRow) {
      results.push({ email: r.email, ok: false, error: insErr?.message ?? "insert failed" });
      continue;
    }
    const eventId = (eventRow as { id: string }).id;

    try {
      const resp = await callGateway<{ id: string }>({
        connector: "resend",
        path: "/emails",
        method: "POST",
        body: {
          from: `${settings.from_name} <${settings.from_email}>`,
          to: [r.email],
          reply_to: settings.reply_to || undefined,
          subject,
          html,
          attachments: [
            { filename: `Invoice-${payload.invoice.slug}.pdf`, content: pdfBase64 },
          ],
          tags: [
            { name: "invoice_id", value: payload.invoice.id },
            { name: "invoice_slug", value: payload.invoice.slug },
            { name: "invoice_event_id", value: eventId },
          ],
        },
      });
      await supabaseAdmin.from("invoice_email_events").update({
        status: "sent",
        provider_message_id: resp.id,
      }).eq("id", eventId);
      await (supabaseAdmin as never as { from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<unknown> } })
        .from("invoice_activity_logs")
        .insert({
          invoice_id: payload.invoice.id,
          invoice_slug: payload.invoice.slug,
          actor_id: opts.actorId ?? null,
          action: "invoice_email_sent",
          title: `Invoice email sent to ${r.email}`,
          body: subject,
          related_table: "invoice_email_events",
          related_id: eventId,
          deep_link: `/app/finance/invoices/${payload.invoice.slug}#delivery`,
          metadata: { recipient_email: r.email, recipient_name: r.name ?? null, trigger: opts.trigger, provider_message_id: resp.id },
        });
      results.push({ email: r.email, ok: true, eventId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("invoice_email_events").update({
        status: "failed",
        error_message: msg.slice(0, 500),
      }).eq("id", eventId);
      await (supabaseAdmin as never as { from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<unknown> } })
        .from("invoice_activity_logs")
        .insert({
          invoice_id: payload.invoice.id,
          invoice_slug: payload.invoice.slug,
          actor_id: opts.actorId ?? null,
          action: "invoice_email_failed",
          title: `Invoice email failed for ${r.email}`,
          body: msg.slice(0, 500),
          related_table: "invoice_email_events",
          related_id: eventId,
          deep_link: `/app/finance/invoices/${payload.invoice.slug}#delivery`,
          metadata: { recipient_email: r.email, recipient_name: r.name ?? null, trigger: opts.trigger },
        });
      results.push({ email: r.email, ok: false, error: msg, eventId });
    }
  }

  const sentOk = results.filter((r) => r.ok);
  if (sentOk.length > 0 && (opts.trigger === "manual" || opts.trigger === "resend")) {
    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "invoice.sent",
        recipientRoles: ["finance", "super_admin"],
        vars: { slug: payload.invoice.slug, to: sentOk.map((r) => r.email).join(", ") },
        dedupeKey: `invoice:${payload.invoice.id}:sent:${opts.trigger}:${Date.now()}`,
        actorId: opts.actorId ?? undefined,
      });
    } catch (e) {
      console.error("[internalSendInvoiceEmail] notify failed:", e);
    }
  }

  return { ok: true as const, sent: sentOk.length, failed: results.filter((r) => !r.ok).length, results };
}

/**
 * Auto-send after an invoice event when the settings toggle allows it.
 * Called from finance functions. Best-effort — never throw.
 */
export async function autoSendInvoiceEmail(opts: {
  slug: string;
  trigger: "auto_created" | "auto_installment_paid" | "auto_fully_paid";
  installment_id?: string | null;
  actorId?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("invoice_email_settings").select("auto_send_on_create, auto_send_on_installment_paid, auto_send_on_fully_paid")
      .eq("id", "default").maybeSingle();
    const s = settings as { auto_send_on_create: boolean; auto_send_on_installment_paid: boolean; auto_send_on_fully_paid: boolean } | null;
    if (!s) return;
    if (opts.trigger === "auto_created" && !s.auto_send_on_create) return;
    if (opts.trigger === "auto_installment_paid" && !s.auto_send_on_installment_paid) return;
    if (opts.trigger === "auto_fully_paid" && !s.auto_send_on_fully_paid) return;

    // Resolve auto recipients: customer primary + any primary contact.
    // Alt/contact/team emails remain manual-select only so finance can choose deliberately.
    const { data: inv } = await supabaseAdmin.from("invoices").select("customer_id").eq("slug", opts.slug).maybeSingle();
    if (!inv) return;
    const customerId = (inv as { customer_id: string }).customer_id;
    const { data: cust } = await supabaseAdmin
      .from("customers").select("name, email, converted_from_lead_id")
      .eq("id", customerId).maybeSingle();
    const c = cust as { name: string; email: string | null; converted_from_lead_id: string | null } | null;
    const recipients: Array<{ email: string; name: string | null }> = [];
    if (c?.email) recipients.push({ email: c.email, name: c.name });
    if (c?.converted_from_lead_id) {
      const { data: contacts } = await supabaseAdmin
        .from("lead_contacts").select("name, email, is_primary")
        .eq("lead_id", c.converted_from_lead_id).eq("is_primary", true);
      for (const row of (contacts ?? []) as Array<{ name: string | null; email: string | null }>) {
        if (row.email && !recipients.some((r) => r.email.toLowerCase() === row.email!.toLowerCase())) {
          recipients.push({ email: row.email, name: row.name });
        }
      }
    }
    if (!recipients.length) return;

    await internalSendInvoiceEmail({
      slug: opts.slug,
      recipients,
      trigger: opts.trigger,
      installment_id: opts.installment_id ?? null,
      actorId: opts.actorId ?? null,
    });
  } catch (e) {
    console.error("[autoSendInvoiceEmail] failed:", e);
  }
}

// ---- Template settings CRUD ----
export const getInvoiceTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: pdf }, { data: email }] = await Promise.all([
      context.supabase.from("invoice_pdf_settings").select("*").eq("id", "default").maybeSingle(),
      context.supabase.from("invoice_email_settings").select("*").eq("id", "default").maybeSingle(),
    ]);
    return { pdf, email };
  });

export const updateInvoicePdfSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invoice_pdf_settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ ...(data as any), updated_by: context.userId })
      .eq("id", "default");
    if (error) throw dbError(error);
    return { ok: true as const };
  });

export const updateInvoiceEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invoice_email_settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ ...(data as any), updated_by: context.userId })
      .eq("id", "default");
    if (error) throw dbError(error);
    return { ok: true as const };
  });

export const getSignedInvoicePdfUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string; mode?: "digital" | "print" }) =>
    z.object({ slug: z.string().min(1), mode: z.enum(["digital", "print"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify user can see this invoice (RLS on invoices).
    const { data: inv } = await context.supabase
      .from("invoices").select("id").eq("slug", data.slug).maybeSingle();
    if (!inv) throw new Error("Invoice not found");
    const { getRequestOrigin } = await import("@/lib/invoice-request-origin.server");
    const { buildSignedInvoiceUrl } = await import("@/lib/invoice-pdf-signing.server");
    let origin = await getRequestOrigin();
    if (!origin) origin = process.env.PUBLIC_BASE_URL || "https://console.brantatech.com";
    const base = buildSignedInvoiceUrl(origin, data.slug);
    return { url: data.mode === "print" ? `${base}&mode=print` : base };
  });

