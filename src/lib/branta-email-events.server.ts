// Server-only Brevo activity sync for the Employees mail-status column.
// This reads Brevo's own transactional event log through the linked connector,
// then mirrors recent activity into public.email_events for the console UI.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";

const CANON: Record<string, string> = {
  request: "sent",
  requests: "sent",
  sent: "sent",
  delivered: "delivered",
  opened: "opened",
  first_opened: "opened",
  proxy_open: "opened",
  unique_opened: "opened",
  click: "clicked",
  clicks: "clicked",
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

interface BrevoStatsEvent {
  email?: unknown;
  date?: unknown;
  event?: unknown;
  messageId?: unknown;
  message_id?: unknown;
  "message-id"?: unknown;
  subject?: unknown;
  reason?: unknown;
  error?: unknown;
  link?: unknown;
  tag?: unknown;
  tags?: unknown;
  list_id?: unknown;
  [key: string]: unknown;
}

interface EmailEventInsert {
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

const canonical = (ev: unknown): string => {
  const raw = String(ev ?? "unknown").toLowerCase().replace(/\s+/g, "_");
  return CANON[raw] ?? raw;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const pickDate = (value: unknown): string => {
  if (typeof value === "number") {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  if (typeof value === "string" && value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
};

const dedupeKey = (row: {
  email: string;
  event: string;
  message_id: string | null;
  occurred_at: string;
}) =>
  [
    row.email.toLowerCase(),
    row.event,
    row.message_id ?? "",
    new Date(row.occurred_at).toISOString(),
  ].join("|");

const toInsert = (event: BrevoStatsEvent): EmailEventInsert | null => {
  const email = text(event.email);
  if (!email) return null;

  const tags = event.tags ?? event.tag;
  const tag = Array.isArray(tags) ? tags.map(String).join(",") : text(tags);
  const messageId =
    text(event.messageId) ?? text(event.message_id) ?? text(event["message-id"]);

  return {
    event: canonical(event.event),
    email: email.toLowerCase(),
    message_id: messageId,
    subject: text(event.subject),
    reason: text(event.reason) ?? text(event.error),
    tag,
    link: text(event.link),
    list_id: typeof event.list_id === "number" ? event.list_id : null,
    occurred_at: pickDate(event.date),
    raw: event,
  };
};

export async function syncRecentBrevoEmailEvents({ limit = 100 } = {}) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!BREVO_KEY) throw new Error("BREVO_API_KEY connector is not linked");

  const url = new URL(`${GATEWAY_URL}/smtp/statistics/events`);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 500)));
  url.searchParams.set("offset", "0");
  url.searchParams.set("sort", "desc");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": BREVO_KEY,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo event sync failed [${response.status}]: ${body}`);
  }

  const body = (await response.json()) as { events?: BrevoStatsEvent[] };
  const incoming = (body.events ?? []).map(toInsert).filter(Boolean) as EmailEventInsert[];
  if (incoming.length === 0) return { fetched: 0, inserted: 0 };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const messageIds = Array.from(
    new Set(incoming.map((row) => row.message_id).filter(Boolean) as string[]),
  );

  const existingKeys = new Set<string>();
  if (messageIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("email_events")
      .select("email,event,message_id,occurred_at")
      .in("message_id", messageIds);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((row) => existingKeys.add(dedupeKey(row)));
  }

  const fresh = incoming.filter((row) => !existingKeys.has(dedupeKey(row)));
  if (fresh.length === 0) return { fetched: incoming.length, inserted: 0 };

  const { error } = await supabaseAdmin
    .from("email_events")
    .insert(fresh as unknown as never);
  if (error) throw new Error(error.message);
  return { fetched: incoming.length, inserted: fresh.length };
}