// Inbox reply — send via Resend or Brevo with In-Reply-To/References headers so
// Gmail threads the message with the incoming conversation. Mirrors the
// lead-compose provider selection & queue-friendly plain-text/html handling.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "@/lib/connector-gateway.server";
import { COMPANY_SLUG_RE, googleScope, resolveMailbox } from "@/lib/company-mailbox.server";

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
  company: z.string().regex(COMPANY_SLUG_RE).optional(),
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
      const mb = await resolveMailbox(context.supabase, context.userId, data.company);
      // Sister companies always reply through their own verified sender.
      let fromName = FROM_NAME;
      let fromEmail = FROM_EMAIL;
      let own: { provider: "resend" | "brevo"; apiKey: string } | null = null;
      if (!mb.isHolding) {
        const { resolveCompanySender } = await import("@/lib/company-email.server");
        const s = await resolveCompanySender(mb.companyId, data.provider);
        if (!s) throw new Error(`${mb.companyName} has no verified Resend or Brevo sender yet. Set one up in Integrations.`);
        fromName = s.fromName;
        fromEmail = s.fromEmail.toLowerCase();
        own = { provider: s.provider, apiKey: s.apiKey };
      }
      const provider = own?.provider ?? data.provider;
      // The thread must exist in this company's connected Gmail mailbox, and
      // every recipient must be a participant of that thread — no arbitrary
      // outbound addresses. Gmail is the source of truth (the DB ledger only
      // holds lead-linked messages).
      type Hdr = { name: string; value: string };
      const thread = await callGateway<{ messages?: Array<{ payload?: { headers?: Hdr[] } }> }>({
        connector: "google_mail",
        ...googleScope(mb),
        path: `/gmail/v1/users/me/threads/${encodeURIComponent(data.threadId)}`,
        query: { format: "metadata", metadataHeaders: ["From", "To", "Cc", "Reply-To"] },
      }).catch(() => null);
      const gmailMsgs = thread?.messages ?? [];
      if (gmailMsgs.length === 0) throw new Error("Thread not found in this company's inbox");
      const participants = new Set<string>();
      const addrRe = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
      for (const m of gmailMsgs)
        for (const h of m.payload?.headers ?? [])
          if (/^(from|to|cc|reply-to)$/i.test(h.name))
            for (const a of h.value.match(addrRe) ?? []) participants.add(a.toLowerCase());
      // A lead can only be tagged/logged when the thread is linked to it.
      if (data.leadId) {
        const { data: linked } = await context.supabase
          .from("inbox_messages")
          .select("gmail_message_id")
          .eq("gmail_thread_id", data.threadId)
          .eq("company_id", mb.companyId)
          .eq("lead_id", data.leadId)
          .limit(1);
        if (!linked || linked.length === 0) throw new Error("This thread is not linked to that lead");
      }
      participants.add(fromEmail);
      participants.add(mb.inboxAddr);
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
      const viaCompany = async <T,>(path: string, body: unknown): Promise<T> => {
        const m = await import("@/lib/company-email.server");
        const r = own!.provider === "resend" ? await m.resend(own!.apiKey, path, { method: "POST", body }) : await m.brevo(own!.apiKey, path, { method: "POST", body });
        if (!r.ok) throw new Error(`${own!.provider} rejected the reply [${r.status}]: ${JSON.stringify(r.body).slice(0, 300)}`);
        return r.body as T;
      };
      const send = <T,>(connector: "resend" | "brevo", path: string, body: unknown) =>
        own ? viaCompany<T>(path, body) : callGateway<T>({ connector, path, method: "POST", body });
      if (provider === "resend") {
        const res = await send<{ id: string }>("resend", "/emails", {
            from: `${fromName} <${fromEmail}>`,
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
        });
        messageId = res.id;
      } else {
        const res = await send<{ messageId: string }>("brevo", "/smtp/email", {
            sender: { name: fromName, email: fromEmail },
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
        });
        messageId = res.messageId;
      }

      // If linked to a lead, log the outbound activity.
      if (data.leadId) {
        await context.supabase.from("lead_activities").insert({
          lead_id: data.leadId,
          actor_id: context.userId,
          kind: "email_reply",
          body: `Replied via ${provider}: ${data.subject}`,
          meta: {
            provider,
            company_id: mb.companyId,
            thread_id: data.threadId,
            to: data.to.join(", "),
          },
        });
      }

      return { ok: true, messageId, provider };
    },
  );
