// Brevo outbound webhook receiver for transactional email events.
// Brevo can POST one event at a time or batches of up to 500 events.
// This is a public route under /api/public/*, so we verify the shared secret
// before writing anything to the database.
import { createFileRoute } from "@tanstack/react-router";

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

// Constant-time string compare using Web-standard APIs (Workers-safe).
const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
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

const jsonHeaders = { "content-type": "application/json" };

const getAuthToken = (request: Request, url: URL): string => {
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  const headerToken = request.headers.get("x-webhook-token");
  if (headerToken) return headerToken;

  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^(?:bearer|token)\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const normalizeItems = (body: unknown): Record<string, unknown>[] => {
  if (Array.isArray(body)) return body.filter(isObjectRecord);
  if (!isObjectRecord(body)) return [];

  const nested = body.events ?? body.items ?? body.data;
  if (Array.isArray(nested)) return nested.filter(isObjectRecord);

  return [body];
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  const provided = getAuthToken(request, url);
  if (!provided || !safeEqual(provided, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const items = normalizeItems(body);

  const rows: EventRow[] = [];
  for (const item of items) {
    const row = buildRow(item);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      headers: jsonHeaders,
    });
  }

  try {
    const inserted = await insertEmailEvents(rows);
    return new Response(JSON.stringify({ ok: true, inserted }), {
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("[brevo-webhook] insert failed", error);
    // 500 makes Brevo retry — desirable for transient DB failures.
    const message = error instanceof Error ? error.message : "Unknown DB error";
    return new Response(`DB error: ${message}`, { status: 500 });
  }
}

async function insertEmailEvents(rows: EventRow[]): Promise<number> {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    throw new Error("SUPABASE_DB_URL is not configured");
  }

  const { default: postgres } = await import("postgres");
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
  });

  try {
    const payload = rows.map((row) => ({
      event: row.event,
      email: row.email,
      message_id: row.message_id,
      subject: row.subject,
      reason: row.reason,
      tag: row.tag,
      link: row.link,
      list_id: row.list_id,
      occurred_at: row.occurred_at,
      raw: row.raw,
    }));

    const inserted = await sql<{ id: string }[]>`
      INSERT INTO public.email_events (
        event,
        email,
        message_id,
        subject,
        reason,
        tag,
        link,
        list_id,
        occurred_at,
        raw
      )
      SELECT
        item.event,
        item.email,
        item.message_id,
        item.subject,
        item.reason,
        item.tag,
        item.link,
        item.list_id,
        item.occurred_at,
        item.raw
      FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS item(
        event text,
        email text,
        message_id text,
        subject text,
        reason text,
        tag text,
        link text,
        list_id integer,
        occurred_at timestamptz,
        raw jsonb
      )
      RETURNING id
    `;

    return inserted.length;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
