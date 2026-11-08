// Small shared pieces for Company Tasks (board cards + drawers).
import { useState } from "react";
import { motion } from "framer-motion";
import { Flag } from "lucide-react";
import { priorityLabel, statusLabel } from "@/lib/company-task-rules";
import { cn } from "@/lib/utils";

export const FIELD = "h-10 rounded-lg text-[13px] font-semibold shadow-sm transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]";
export const AREA = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-snug shadow-sm outline-none transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]";
export const LABEL = "text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70";

export const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const;

export function PersonAvatar({ name, src, size = 22, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return src && !err ? (
    <img src={src} alt={name} title={name} onError={() => setErr(true)} style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full object-cover ring-2 ring-card", className)} />
  ) : (
    <span title={name} style={{ width: size, height: size, fontSize: Math.max(8, size * 0.4) }}
      className={cn("grid shrink-0 place-items-center rounded-full bg-muted font-extrabold text-foreground/70 ring-2 ring-card", className)}>{ini}</span>
  );
}

export function AvatarStack({ people, max = 4, size = 22 }: { people: { user_id: string; name: string; avatar_url: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max), rest = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p, i) => (
        <motion.span key={p.user_id} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: i * 0.03 }}>
          <PersonAvatar name={p.name} src={p.avatar_url} size={size} />
        </motion.span>
      ))}
      {rest > 0 && <span style={{ width: size, height: size }} className="grid place-items-center rounded-full bg-muted text-[9.5px] font-bold text-muted-foreground ring-2 ring-card">+{rest}</span>}
    </div>
  );
}

const PRIORITY_TONE: Record<string, string> = {
  low: "border-border text-muted-foreground",
  normal: "border-border text-foreground/80",
  high: "border-status-contacted/40 text-status-contacted",
  urgent: "border-destructive/40 text-destructive",
};
export function PriorityBadge({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10.5px] font-bold", PRIORITY_TONE[value] ?? PRIORITY_TONE.normal)}>
      <Flag className="size-3" />{priorityLabel(value)}
    </span>
  );
}

const STATUS_DOT: Record<string, string> = { todo: "bg-muted-foreground/60", doing: "bg-brand", in_review: "bg-status-contacted", done: "bg-status-converted" };
export function StatusDot({ value, className }: { value: string; className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full", STATUS_DOT[value] ?? STATUS_DOT.todo, className)} />;
}
export function StatusChip({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-foreground/80">
      <StatusDot value={value} />{statusLabel(value)}
    </span>
  );
}

/** Segmented subtask progress; each finished segment springs in. */
export function SegmentedProgress({ done, total }: { done: number; total: number }) {
  const n = Math.max(1, Math.min(total, 12));
  const filled = total ? Math.round((done / total) * n) : 0;
  return (
    <div className="flex gap-1">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.span className="absolute inset-0 origin-left rounded-full bg-brand"
            initial={false} animate={{ scaleX: i < filled ? 1 : 0 }} transition={{ ...spring, delay: i * 0.025 }} />
        </span>
      ))}
    </div>
  );
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });

/** "Due 09 Nov 2026 · 05:30 PM" style label; time optional (HH:MM[:SS]). */
export const fmtDue = (d: string | null | undefined, t?: string | null) => {
  if (!d) return "—";
  if (!t) return fmtDate(d);
  const [h, m] = t.split(":").map(Number);
  const hh = ((h + 11) % 12) + 1;
  return `${fmtDate(d)} · ${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
