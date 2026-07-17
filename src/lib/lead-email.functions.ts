// Lead email compose (Gmail personal thread OR Resend branded).
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
  provider: z.enum(["gmail", "resend"]),
  to: z.string().email(),
  cc: z.array(z.string().email()).default([]),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(50000),
});

const RESEND_FROM = "Branta Tech <noreply@brantatech.com>";
const GMAIL_FROM_HEADER = "Branta Tech <hello@brantatech.com>";

function buildRfc2822(
  from: string,
  to: string,
  cc: string[],
  subject: string,
  html: string,
): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ];
  return lines.join("\r\n");
}

export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadEmailRow> => {
    const { callGateway, base64UrlEncode } = await import(
      "@/lib/connector-gateway.server"
    );
    const html = data.body.includes("<") ? data.body : data.body.replace(/\n/g, "<br/>");
    let messageId: string | null = null;
    let threadId: string | null = null;
    let fromEmail: string | null = null;
    let status: "sent" | "failed" = "sent";
    let errorMessage: string | null = null;

    try {
      if (data.provider === "gmail") {
        const raw = buildRfc2822(
          GMAIL_FROM_HEADER,
          data.to,
          data.cc,
          data.subject,
          html,
        );
        const resp = await callGateway<{ id: string; threadId: string }>({
          connector: "google_mail",
          path: "/gmail/v1/users/me/messages/send",
          method: "POST",
          body: { raw: base64UrlEncode(raw) },
        });
        messageId = resp.id;
        threadId = resp.threadId;
        fromEmail = "hello@brantatech.com";
      } else {
        const resp = await callGateway<{ id: string }>({
          connector: "resend",
          path: "/emails",
          method: "POST",
          body: {
            from: RESEND_FROM,
            to: [data.to],
            cc: data.cc.length ? data.cc : undefined,
            subject: data.subject,
            html,
          },
        });
        messageId = resp.id;
        fromEmail = "noreply@brantatech.com";
      }
    } catch (e) {
      status = "failed";
      errorMessage = e instanceof Error ? e.message : String(e);
    }

    const { data: row, error } = await context.supabase
      .from("lead_emails")
      .insert({
        lead_id: data.leadId,
        direction: "outbound",
        provider: data.provider,
        message_id: messageId,
        thread_id: threadId,
        subject: data.subject,
        body_html: html,
        body_text: data.body,
        from_email: fromEmail,
        to_emails: [data.to],
        cc_emails: data.cc,
        status,
        error_message: errorMessage,
        sent_at: new Date().toISOString(),
        sent_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Activity log
    await context.supabase.from("lead_activities").insert({
      lead_id: data.leadId,
      actor_id: context.userId,
      kind: "email",
      body:
        status === "sent"
          ? `Sent via ${data.provider}: ${data.subject}`
          : `Failed ${data.provider} email: ${errorMessage}`,
      meta: { provider: data.provider, subject: data.subject, status },
    });

    if (status === "failed") throw new Error(errorMessage ?? "Send failed");
    return row as LeadEmailRow;
  });

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
      // dedupe
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
