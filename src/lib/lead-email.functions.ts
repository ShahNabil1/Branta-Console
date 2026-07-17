// Lead email compose — Resend-only, branded, multi-recipient with variable substitution.
// Gmail pull is retained for inbound sync only; outbound is 100% Resend.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface LeadEmailRow {
  id: string;
  lead_id: string;
  direction: "outbound" | "inbound";
  provider: "gmail" | "resend";
  message_id: string | null;
  thread_id: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  from_email: string | null;
  to_emails: string[];
  cc_emails: string[];
  status: "draft" | "sent" | "failed" | "received";
  error_message: string | null;
  sent_at: string | null;
  sent_by: string | null;
  created_at: string;
}

const SendInput = z.object({
  leadId: z.string().uuid(),
  to: z.array(z.string().trim().email()).min(1).max(50),
  cc: z.array(z.string().trim().email()).default([]),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(100_000),
  contentType: z.enum(["html", "text"]).default("html"),
});

const RESEND_FROM = "Branta Tech <noreply@brantatech.com>";

/** Public helper: substitute {{tokens}} against a value map. Unknown tokens are left intact. */
export function renderVariables(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null || v === "" ? `{{${key}}}` : String(v);
  });
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font:14px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;white-space:pre-wrap">${escaped}</div>`;
}

/**
 * Send a Resend email — one Resend request per recipient so each row tracks its
 * own message_id, deliverability, and future webhook events independently.
 */
export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ sent: number; failed: number; rows: LeadEmailRow[] }> => {
      const { callGateway } = await import("@/lib/connector-gateway.server");

      // Resolve lead + owner for variable substitution.
      const { data: lead } = await context.supabase
        .from("leads")
        .select("id, slug, lead_code, name, company, status, owner_id")
        .eq("id", data.leadId)
        .maybeSingle();
      if (!lead) throw new Error("Lead not found");

      let ownerName: string | null = null;
      if (lead.owner_id) {
        const { data: p } = await context.supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", lead.owner_id)
          .maybeSingle();
        ownerName = p?.full_name ?? null;
      }

      const today = new Date().toISOString().slice(0, 10);
      const firstName = (lead.name || "").split(/\s+/)[0] || null;

      const rows: LeadEmailRow[] = [];
      let sent = 0;
      let failed = 0;

      for (const recipient of data.to) {
        const vars = {
          "lead.name": lead.name,
          "lead.first_name": firstName,
          "lead.company": lead.company,
          "lead.email": recipient,
          "lead.status": lead.status,
          "lead.slug": lead.slug ?? lead.lead_code,
          "owner.name": ownerName,
          today,
        } as Record<string, string | null>;

        const renderedSubject = renderVariables(data.subject, vars);
        const renderedBody = renderVariables(data.body, vars);
        const html =
          data.contentType === "html" ? renderedBody : textToHtml(renderedBody);
        const text = data.contentType === "text" ? renderedBody : null;

        let messageId: string | null = null;
        let status: "sent" | "failed" = "sent";
        let errorMessage: string | null = null;

        try {
          const resp = await callGateway<{ id: string }>({
            connector: "resend",
            path: "/emails",
            method: "POST",
            body: {
              from: RESEND_FROM,
              to: [recipient],
              cc: data.cc.length ? data.cc : undefined,
              subject: renderedSubject,
              html,
              ...(text ? { text } : {}),
              tags: [
                { name: "lead_id", value: lead.id },
                { name: "lead_slug", value: String(lead.slug ?? lead.lead_code) },
              ],
            },
          });
          messageId = resp.id;
          sent += 1;
        } catch (e) {
          status = "failed";
          errorMessage = e instanceof Error ? e.message : String(e);
          failed += 1;
        }

        const { data: row, error } = await context.supabase
          .from("lead_emails")
          .insert({
            lead_id: data.leadId,
            direction: "outbound",
            provider: "resend",
            message_id: messageId,
            thread_id: null,
            subject: renderedSubject,
            body_html: html,
            body_text: text ?? renderedBody,
            from_email: "noreply@brantatech.com",
            to_emails: [recipient],
            cc_emails: data.cc,
            status,
            error_message: errorMessage,
            sent_at: new Date().toISOString(),
            sent_by: context.userId,
          })
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        rows.push(row as LeadEmailRow);

        await context.supabase.from("lead_activities").insert({
          lead_id: data.leadId,
          actor_id: context.userId,
          kind: "email",
          body:
            status === "sent"
              ? `Sent to ${recipient}: ${renderedSubject}`
              : `Failed to ${recipient}: ${errorMessage}`,
          meta: { provider: "resend", to: recipient, status },
        });
      }

      return { sent, failed, rows };
    },
  );

export const listLeadEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<LeadEmailRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("lead_emails")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as LeadEmailRow[];
  });

interface GmailListItem {
  id: string;
  threadId: string;
}
interface GmailHeader {
  name: string;
  value: string;
}
interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload?: { headers?: GmailHeader[]; parts?: unknown[]; body?: { data?: string } };
  snippet?: string;
}

export const pullGmailForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string; email: string }) =>
    z
      .object({ leadId: z.string().uuid(), email: z.string().email() })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ pulled: number }> => {
    const { callGateway } = await import("@/lib/connector-gateway.server");
    const q = `(from:${data.email} OR to:${data.email})`;
    const list = await callGateway<{ messages?: GmailListItem[] }>({
      connector: "google_mail",
      path: "/gmail/v1/users/me/messages",
      query: { q, maxResults: 25 },
    });
    let pulled = 0;
    for (const m of list.messages ?? []) {
      const { data: existing } = await context.supabase
        .from("lead_emails")
        .select("id")
        .eq("provider", "gmail")
        .eq("message_id", m.id)
        .maybeSingle();
      if (existing) continue;
      const msg = await callGateway<GmailMessage>({
        connector: "google_mail",
        path: `/gmail/v1/users/me/messages/${m.id}`,
        query: { format: "metadata", metadataHeaders: "Subject,From,To,Cc,Date" },
      });
      const headers = new Map(
        (msg.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]),
      );
      const from = headers.get("from") ?? "";
      const direction = from.toLowerCase().includes(data.email.toLowerCase())
        ? "inbound"
        : "outbound";
      await context.supabase.from("lead_emails").insert({
        lead_id: data.leadId,
        direction,
        provider: "gmail",
        message_id: msg.id,
        thread_id: msg.threadId,
        subject: headers.get("subject") ?? null,
        body_text: msg.snippet ?? null,
        from_email: from,
        to_emails: (headers.get("to") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        cc_emails: (headers.get("cc") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        status: direction === "inbound" ? "received" : "sent",
        sent_at: new Date(Number(msg.internalDate)).toISOString(),
      });
      pulled += 1;
    }
    return { pulled };
  });
