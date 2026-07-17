// Resend webhook receiver (Svix-signed). Verifies signature, then appends
// the delivery event to the Google Sheet — no Supabase writes on the hot path.
//
// Setup:
//   Resend → Webhooks → Add endpoint
//   URL:  https://console.brantatech.com/api/public/resend/webhook
//   Enable events: email.sent, email.delivered, email.delivery_delayed,
//                  email.bounced, email.complained, email.opened,
//                  email.clicked, email.failed, email.scheduled,
//                  email.received, email.suppressed
//   Copy the "whsec_..." signing secret into RESEND_WEBHOOK_SECRET.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

function verifySvix(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  body: string,
): boolean {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(raw, "base64");
  } catch {
    return false;
  }
  const signed = `${svixId}.${svixTimestamp}.${body}`;
  const expected = createHmac("sha256", keyBytes).update(signed).digest("base64");
  // svix-signature header format: "v1,<base64> v1,<base64> ..."
  const parts = svixSignature.split(" ");
  for (const p of parts) {
    const [, sig] = p.split(",");
    if (!sig || sig.length !== expected.length) continue;
    try {
      if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true;
    } catch {
      // length mismatch, continue
    }
  }
  return false;
}

// Resend delivers `data.tags` as an object `{ key: value }` in webhook payloads,
// even though the send API accepts `[{name, value}]`. Handle both shapes.
function pickTag(tags: unknown, name: string): string {
  if (Array.isArray(tags)) {
    const hit = (tags as Array<{ name?: string; value?: string }>).find(
      (t) => t?.name === name,
    );
    return hit?.value ?? "";
  }
  if (tags && typeof tags === "object") {
    const v = (tags as Record<string, unknown>)[name];
    return typeof v === "string" ? v : "";
  }
  return "";
}

export const Route = createFileRoute("/api/public/resend/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not set");
          return new Response("Not configured", { status: 500 });
        }

        const svixId = request.headers.get("svix-id") ?? "";
        const svixTs = request.headers.get("svix-timestamp") ?? "";
        const svixSig = request.headers.get("svix-signature") ?? "";
        const body = await request.text();

        if (!svixId || !svixTs || !svixSig) {
          return new Response("Missing svix headers", { status: 400 });
        }
        if (!verifySvix(secret, svixId, svixTs, svixSig, body)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: {
          type?: string;
          created_at?: string;
          data?: {
            email_id?: string;
            to?: string[] | string;
            subject?: string;
            tags?: unknown;
          };
        };
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const data = payload.data ?? {};
        const recipient = Array.isArray(data.to) ? data.to[0] : data.to ?? "";
        const tags = data.tags ?? [];
        const lead_id = pickTag(tags, "lead_id");
        const lead_slug = pickTag(tags, "lead_slug");
        const lead_email_id = pickTag(tags, "lead_email_id");

        if (!lead_id) {
          // Event not from a lead-tagged send — acknowledge quietly.
          return new Response("ok", { status: 200 });
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { appendResendEvent } = await import(
            "@/lib/resend-events.server"
          );
          await appendResendEvent(supabaseAdmin, {
            timestamp: payload.created_at ?? new Date().toISOString(),
            event_type: (payload.type ?? "unknown").replace(/^email\./, ""),
            email_id: data.email_id ?? "",
            lead_email_id,
            lead_id,
            lead_slug,
            recipient,
            subject: data.subject ?? "",
          });
        } catch (e) {
          console.error("[resend-webhook] append failed:", e);
          // Return 500 so Resend retries.
          return new Response("Sheet append failed", { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
