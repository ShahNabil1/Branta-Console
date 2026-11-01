// Inbox reply — send via Resend or Brevo with In-Reply-To/References headers so
// Gmail threads the message with the incoming conversation. Mirrors the
// lead-compose provider selection & queue-friendly plain-text/html handling.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "@/lib/connector-gateway.server";

const FROM_NAME = "Branta Tech";
const FROM_EMAIL = "hello@brantatech.com";

// RFC 5322 Message-ID(s): <local@domain>, no whitespace/CR/LF inside.
const MSG_ID_RE = /^<[^<>\s]+>$/;
const MSG_IDS_RE = /^<[^<>\s]+>( <[^<>\s]+>)*$/;

const ReplyInput = z.object({
  threadId: z.string().min(1),
  to: z.array(z.string().trim().email()).min(1).max(20),
  cc: z.array(z.string().trim().email()).default([]),
  // Single-line subject only (no header smuggling via CR/LF or control chars).
  subject: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Subject must be a single line"),
  body: z.string().trim().min(1).max(20_000),
  // Replies are always sent as escaped plain text; caller HTML is never sent.
  contentType: z.literal("text").default("text"),
  provider: z.enum(["resend", "brevo"]).default("resend"),
  inReplyTo: z.string().trim().max(998).regex(MSG_ID_RE, "Invalid Message-ID").nullable().optional(), // original Message-ID header
  references: z.string().trim().max(4000).regex(MSG_IDS_RE, "Invalid References header").nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
});

function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font:14px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;white-space:pre-wrap">${esc}</div>`;
}

export const sendInboxReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReplyInput.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; messageId: string; provider: string }> => {
      // The thread must exist in the shared inbox, and every recipient must
      // be a participant of that thread — no arbitrary outbound addresses.
      const { data: threadMsgs } = await context.supabase
        .from("inbox_messages")
        .select("from_email, lead_id")
        .eq("gmail_thread_id", data.threadId)
        .limit(100);
      if (!threadMsgs || threadMsgs.length === 0)
        throw new Error("Thread not found in the shared inbox");
      const msgs = threadMsgs as Array<{ from_email: string; lead_id: string | null }>;
      const participants = new Set<string>(
        msgs.map((m) => m.from_email.trim().toLowerCase()),
      );
      // A lead can only be tagged/logged when the thread is linked to it.
      if (data.leadId && !msgs.some((m) => m.lead_id === data.leadId))
        throw new Error("This thread is not linked to that lead");
      participants.add(FROM_EMAIL);
      const outsider = [...data.to, ...data.cc].find(
        (e) => !participants.has(e.trim().toLowerCase()),
      );
      if (outsider)
        throw new Error(`${outsider} is not a participant of this thread`);

      const html = textToHtml(data.body);
      const text = data.body;

      // Compose References header per RFC: existing References + In-Reply-To id.
      const refs = [
        data.references?.trim() ?? "",
        data.inReplyTo?.trim() ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      let messageId = "";
      if (data.provider === "resend") {
        const res = await callGateway<{ id: string }>({
          connector: "resend",
          path: "/emails",
          method: "POST",
          body: {
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: data.to,
            cc: data.cc.length ? data.cc : undefined,
            subject: data.subject,
            html,
            text,
            headers: {
              ...(data.inReplyTo ? { "In-Reply-To": data.inReplyTo } : {}),
              ...(refs ? { References: refs } : {}),
            },
            tags: [
              { name: "kind", value: "inbox_reply" },
              { name: "thread_id", value: data.threadId },
              ...(data.leadId
                ? [{ name: "lead_id", value: data.leadId }]
                : []),
            ],
          },
        });
        messageId = res.id;
      } else {
        const res = await callGateway<{ messageId: string }>({
          connector: "brevo",
          path: "/smtp/email",
          method: "POST",
          body: {
            sender: { name: FROM_NAME, email: FROM_EMAIL },
            to: data.to.map((email) => ({ email })),
            cc: data.cc.length ? data.cc.map((email) => ({ email })) : undefined,
            subject: data.subject,
            htmlContent: html,
            textContent: text,
            headers: {
              ...(data.inReplyTo ? { "In-Reply-To": data.inReplyTo } : {}),
              ...(refs ? { References: refs } : {}),
            },
            tags: [
              "inbox_reply",
              `thread_id:${data.threadId}`,
              ...(data.leadId ? [`lead_id:${data.leadId}`] : []),
            ],
          },
        });
        messageId = res.messageId;
      }

      // If linked to a lead, log the outbound activity.
      if (data.leadId) {
        await context.supabase.from("lead_activities").insert({
          lead_id: data.leadId,
          actor_id: context.userId,
          kind: "email_reply",
          body: `Replied via ${data.provider}: ${data.subject}`,
          meta: {
            provider: data.provider,
            thread_id: data.threadId,
            to: data.to.join(", "),
          },
        });
      }

      return { ok: true, messageId, provider: data.provider };
    },
  );
