// Inbox reply — send via Resend or Brevo with In-Reply-To/References headers so
// Gmail threads the message with the incoming conversation. Mirrors the
// lead-compose provider selection & queue-friendly plain-text/html handling.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "@/lib/connector-gateway.server";

const FROM_NAME = "Branta Tech";
const FROM_EMAIL = "hello@brantatech.com";

const ReplyInput = z.object({
  threadId: z.string().min(1),
  to: z.array(z.string().trim().email()).min(1).max(20),
  cc: z.array(z.string().trim().email()).default([]),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(100_000),
  contentType: z.enum(["html", "text"]).default("html"),
  provider: z.enum(["resend", "brevo"]).default("resend"),
  inReplyTo: z.string().nullable().optional(), // original Message-ID header
  references: z.string().nullable().optional(),
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
      const html =
        data.contentType === "html" ? data.body : textToHtml(data.body);
      const text = data.contentType === "text" ? data.body : undefined;

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
