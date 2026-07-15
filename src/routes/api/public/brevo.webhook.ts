// Brevo transactional / marketing webhook receiver.
// Brevo POSTs one event per request (transactional) or a batch (marketing).
// This is a public route under /api/public/*, so we require ?token=<secret>
// (Brevo lets you add arbitrary query params to the webhook URL).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/brevo/webhook")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, service: "brevo-webhook" }),
          { headers: { "content-type": "application/json" } },
        ),
      POST: async ({ request }) => handlePost(request),
    },
  },
});

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};

// Brevo sends event names in different shapes across products.
// Normalise them to a single canonical vocabulary the UI reads.
const CANON: Record<string, string> = {
  request: "sent",
  sent: "sent",
  delivered: "delivered",
  opened: "opened",
  first_opened: "opened",
  proxy_open: "opened",
  unique_opened: "opened",
  click: "clicked",
  clicked: "clicked",
  hard_bounce: "hard_bounce",
  hardbounce: "hard_bounce",
  soft_bounce: "soft_bounce",
  softbounce: "soft_bounce",
  bounce: "hard_bounce",
  blocked: "blocked",
  deferred: "deferred",
  spam: "spam",
  complaint: "spam",
  invalid: "invalid_email",
  invalid_email: "invalid_email",
  error: "error",
  unsubscribed: "unsubscribed",
  unsubscribe: "unsubscribed",
};

const canonical = (ev: unknown): string => {
  const raw = String(ev ?? "unknown").toLowerCase().replace(/\s+/g, "_");
  return CANON[raw] ?? raw;
};

const pickDate = (payload: Record<string, unknown>): string => {
  const candidates = [
    payload.ts_event,
    payload.date,
    payload.ts,
    payload["event-time"],
  ];
  for (const c of candidates) {
    if (typeof c === "number") {
      // Brevo sends epoch seconds for ts fields.
      return new Date(c > 1e12 ? c : c * 1000).toISOString();
    }
    if (typeof c === "string" && c.length > 0) {
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return new Date().toISOString();
};

interface EventRow {
  event: string;
  email: string;
  message_id: string | null;
  subject: string | null;
  reason: string | null;
  tag: string | null;
  link: string | null;
  list_id: number | null;
  occurred_at: string;
  raw: Record<string, unknown>;
}

const buildRow = (payload: Record<string, unknown>): EventRow | null => {
  const emailRaw =
    (payload.email as string | undefined) ??
    (payload.recipient as string | undefined) ??
    (payload.to as string | undefined);
  if (!emailRaw || typeof emailRaw !== "string") return null;

  const tagValue = (() => {
    const t = payload.tag ?? payload.tags;
    if (Array.isArray(t)) return t.join(",");
    if (typeof t === "string") return t;
    return null;
  })();

  return {
    event: canonical(payload.event),
    email: emailRaw.toLowerCase(),
    message_id:
      (payload["message-id"] as string | undefined) ??
      (payload.message_id as string | undefined) ??
      null,
    subject: (payload.subject as string | undefined) ?? null,
    reason:
      (payload.reason as string | undefined) ??
      (payload.error as string | undefined) ??
      null,
    tag: tagValue,
    link: (payload.link as string | undefined) ?? null,
    list_id:
      typeof payload.list_id === "number"
        ? payload.list_id
        : Array.isArray(payload.list_id) && typeof payload.list_id[0] === "number"
          ? payload.list_id[0]
          : null,
    occurred_at: pickDate(payload),
    raw: payload,
  };
};

async function handlePost(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const expected = process.env.BREVO_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[brevo-webhook] BREVO_WEBHOOK_SECRET is not configured");
    return new Response("Server misconfigured", { status: 500 });
  }
  const provided =
    url.searchParams.get("token") ??
    request.headers.get("x-webhook-token") ??
    "";
  if (!provided || !safeEqual(provided, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const items = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : [body as Record<string, unknown>];

  const rows: EventRow[] = [];
  for (const item of items) {
    const row = buildRow(item);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("email_events")
    .insert(rows as unknown as never);
  if (error) {
    console.error("[brevo-webhook] insert failed", error);
    // 500 makes Brevo retry — desirable for transient DB failures.
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
    headers: { "content-type": "application/json" },
  });
}
