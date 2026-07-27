// Client-safe helpers for deferral windows. Pure functions.

/** Return HH:MM (24h) in the given IANA time zone for a given instant. */
function hmInTz(d: Date, tz: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { h, m };
}

function parseHM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":");
  return { h: Number(h) || 0, m: Number(m) || 0 };
}

function inWindow(
  now: { h: number; m: number },
  start: { h: number; m: number },
  end: { h: number; m: number },
): boolean {
  const cur = now.h * 60 + now.m;
  const s = start.h * 60 + start.m;
  const e = end.h * 60 + end.m;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e; // overnight
}

/** Compute UTC Date for the next `hh:mm` in `tz` after `from`. */
function nextTzTimeUtc(
  from: Date,
  tz: string,
  target: { h: number; m: number },
): Date {
  // Iterate minutes forward up to 36h until tz clock matches target.
  const step = 60 * 1000;
  const max = 36 * 60;
  const d = new Date(from.getTime() + step);
  for (let i = 0; i < max; i++) {
    const t = new Date(d.getTime() + i * step);
    const { h, m } = hmInTz(t, tz);
    if (h === target.h && m === target.m) return t;
  }
  return new Date(from.getTime() + 8 * 60 * 60 * 1000);
}

export interface DeferralPrefs {
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string; // HH:MM[:SS]
  quiet_hours_end?: string;
  timezone?: string;
  digest_mode?: boolean;
}

/**
 * Given user prefs and current time, decide when this non-critical event
 * should be delivered. Returns null if it should send immediately.
 */
export function computeDeferredUntil(
  prefs: DeferralPrefs,
  now: Date = new Date(),
): Date | null {
  const tz = prefs.timezone || "Asia/Dhaka";

  // Quiet hours take precedence — release at window end.
  if (prefs.quiet_hours_enabled && prefs.quiet_hours_start && prefs.quiet_hours_end) {
    const start = parseHM(prefs.quiet_hours_start);
    const end = parseHM(prefs.quiet_hours_end);
    const cur = hmInTz(now, tz);
    if (inWindow(cur, start, end)) {
      return nextTzTimeUtc(now, tz, end);
    }
  }

  // Digest mode → batch to the next :00 or :30 slot.
  if (prefs.digest_mode) {
    const next = new Date(now.getTime());
    next.setUTCSeconds(0, 0);
    const mins = next.getUTCMinutes();
    if (mins < 30) next.setUTCMinutes(30);
    else {
      next.setUTCMinutes(0);
      next.setUTCHours(next.getUTCHours() + 1);
    }
    return next;
  }
  return null;
}

/** Backoff for retries in ms. */
export function retryDelayMs(attempt: number): number {
  const table = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
  return table[Math.min(attempt, table.length - 1)];
}
export const MAX_ATTEMPTS = 5;
