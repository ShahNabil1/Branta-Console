// Shared helpers for the mobile-first Leads experience.
export type LeadPriority = "low" | "medium" | "high" | "urgent";

export const PRIORITY_OPTIONS: { key: LeadPriority; label: string; tone: string }[] = [
  { key: "low", label: "Low", tone: "--color-status-contacted" },
  { key: "medium", label: "Medium", tone: "--color-status-new" },
  { key: "high", label: "High", tone: "--color-status-meeting" },
  { key: "urgent", label: "Urgent", tone: "--destructive" },
];

export function priorityMeta(p?: string | null) {
  return PRIORITY_OPTIONS.find((o) => o.key === p) ?? PRIORITY_OPTIONS[1];
}

/** Accepts 01XXXXXXXXX, 8801XXXXXXXXX, +8801XXXXXXXXX (spaces/dashes ignored). */
export function isValidBDPhone(v: string): boolean {
  const s = v.replace(/[\s-]/g, "");
  return /^(?:\+?88)?01[3-9]\d{8}$/.test(s);
}

export function normalizePhone(v: string): string {
  const s = v.replace(/[\s-]/g, "");
  if (/^01\d{9}$/.test(s)) return `+88${s}`;
  if (/^8801\d{9}$/.test(s)) return `+${s}`;
  return s;
}

export function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

const TZ = "Asia/Dhaka";

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKey(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(yest)) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function sameDay(a: string, b: string) {
  return dayKey(new Date(a)) === dayKey(new Date(b));
}

export type FollowUpState = "none" | "overdue" | "today" | "upcoming";

export function followUpState(iso?: string | null): FollowUpState {
  if (!iso) return "none";
  const t = new Date(iso).getTime();
  if (t < Date.now()) return "overdue";
  if (dayKey(new Date(iso)) === dayKey(new Date())) return "today";
  return "upcoming";
}

export function fmtFollowUp(iso: string) {
  const label = dayLabel(iso);
  return `${label} · ${fmtTime(iso)}`;
}

/** Combine a yyyy-mm-dd and HH:mm (Dhaka local, UTC+6) into ISO. */
export function bdToISO(date: string, time: string): string {
  return new Date(`${date}T${time || "10:00"}:00+06:00`).toISOString();
}

/** Split ISO into Dhaka-local {date, time}. */
export function isoToBD(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(new Date(iso).getTime() + 6 * 3600_000);
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

export function initialsOf(name?: string | null) {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .join("")
    .slice(0, 2);
}
