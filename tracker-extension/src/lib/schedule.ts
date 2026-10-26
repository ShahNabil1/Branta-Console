// Shift schedule maths (pure, testable). Times are Asia/Dhaka (UTC+6, no DST).
export interface Slot { start: string; end: string }
export interface Schedule { days: Record<string, Slot[]>; break_minutes: number; grace_minutes: number }
export interface Plan { label: string; index: number; count: number; startAt: number; endAt: number; breakMinutes: number; graceMinutes: number }

const OFFSET = 6 * 3_600_000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseSchedule(value: unknown): Schedule | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!v.days || typeof v.days !== 'object') return null;
  const days: Record<string, Slot[]> = {};
  for (const [k, slots] of Object.entries(v.days as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k) || !Array.isArray(slots)) continue;
    days[k] = slots.filter((s): s is Slot => !!s && HHMM.test((s as Slot).start) && HHMM.test((s as Slot).end) && (s as Slot).start < (s as Slot).end)
      .sort((a, b) => a.start.localeCompare(b.start));
  }
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : d);
  return { days, break_minutes: num(v.break_minutes, 0), grace_minutes: num(v.grace_minutes, 0) };
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** The scheduled slot a check-in belongs to: the one it falls in, else the nearest one that day. */
export function planFor(schedule: Schedule | null, checkInAt: number): Plan | null {
  if (!schedule) return null;
  const local = new Date(checkInAt + OFFSET);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET;
  const slots = schedule.days[String(local.getUTCDay())] ?? [];
  if (!slots.length) return null;
  const at = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number) as [number, number]; return midnight + (h * 60 + m) * 60_000; };
  let best = 0, bestDist = Infinity;
  slots.forEach((s, i) => {
    const a = at(s.start), b = at(s.end);
    const d = checkInAt >= a && checkInAt <= b ? 0 : Math.min(Math.abs(checkInAt - a), Math.abs(checkInAt - b));
    if (d < bestDist) { bestDist = d; best = i; }
  });
  const s = slots[best]!;
  return { label: `${clock(s.start)} – ${clock(s.end)}`, index: best, count: slots.length, startAt: at(s.start), endAt: at(s.end), breakMinutes: schedule.break_minutes, graceMinutes: schedule.grace_minutes };
}

export type Punctuality = { kind: 'late' | 'early' | 'ontime'; minutes: number };
/** Late is counted from the scheduled start (after grace); early when before start. */
export function punctuality(plan: Plan, checkInAt: number): Punctuality {
  const diff = Math.round((checkInAt - plan.startAt) / 60_000);
  if (diff > plan.graceMinutes) return { kind: 'late', minutes: diff };
  if (diff < 0) return { kind: 'early', minutes: -diff };
  return { kind: 'ontime', minutes: 0 };
}
/** Overtime minutes past the scheduled end while the Shift is still open (or at check-out). */
export function overtimeMinutes(plan: Plan, until: number): number {
  return Math.max(0, Math.floor((until - plan.endAt) / 60_000));
}
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
