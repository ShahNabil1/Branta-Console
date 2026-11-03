export type TestEvent = { id: string; event: string; occurred_at: string; details: Record<string, unknown> };

export function deliveryProgress(accepted: boolean, events: Pick<TestEvent, "event">[]) {
  const names = events.map((e) => e.event.replace(/^email\./, "").toLowerCase().replace(/[_\s-]/g, ""));
  const failed = names.some((n) => ["bounced", "hardbounce", "failed", "blocked", "invalid", "invalidemail", "error", "suppressed", "complained", "spam"].includes(n));
  const delivered = names.some((n) => ["delivered", "opened", "firstopened", "uniqueopened", "proxyopen", "clicked", "click", "clicks"].includes(n));
  return { percent: delivered ? 100 : events.length ? 60 : accepted ? 30 : 0, failed, delivered };
}

export function chooseCompanyProvider<T extends { provider: string; is_default: boolean }>(rows: T[], prefer?: string): T | undefined {
  return rows.find((r) => r.provider === prefer) ?? rows.find((r) => r.is_default) ?? rows[0];
}

export function testCorrelation(tags: unknown): string | null {
  let value: unknown;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === "string" && tag.startsWith("console_test:")) value = tag.slice(13);
      else if (tag && typeof tag === "object" && "name" in tag && tag.name === "console_test" && "value" in tag) value = tag.value;
    }
  } else if (tags && typeof tags === "object" && "console_test" in tags) value = tags.console_test;
  else if (typeof tags === "string") value = tags.split(/[,\s]+/).find((s) => s.startsWith("console_test:"))?.slice(13);
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function safeEventDetails(payload: Record<string, unknown>) {
  const keys = ["email_id", "message-id", "message_id", "to", "email", "recipient", "from", "subject", "reason", "error", "bounce", "click", "link", "ip", "user_agent", "ts", "ts_event", "date", "tags", "tag", "sending_ip", "template_id"];
  return Object.fromEntries(keys.filter((k) => payload[k] !== undefined).map((k) => [k, payload[k]]));
}