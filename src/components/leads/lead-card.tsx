import { CalendarClock, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/social/whatsapp-icon";
import { cn } from "@/lib/utils";
import type { LeadRow } from "@/lib/leads.functions";
import { followUpState, fmtFollowUp, initialsOf, priorityMeta, waLink } from "./lead-meta";

export function LeadCard({
  row,
  statusLabel,
  statusColor,
  onOpen,
  index = 0,
}: {
  row: LeadRow;
  statusLabel: string;
  statusColor: string;
  onOpen: () => void;
  index?: number;
}) {
  const pr = priorityMeta(row.priority);
  const fu = followUpState(row.next_follow_up_at);
  const phone = row.phone;
  const wa = row.whatsapp || row.phone;
  return (
    <div
      className="group relative animate-bubble-in rounded-lg border border-border bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all active:scale-[0.99]"
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
    >
      <span className="absolute left-0 top-4 h-8 w-[3px] rounded-r-full" style={{ background: statusColor }} />
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold text-foreground">{row.name || "—"}</div>
            <div className="truncate text-[13px] text-muted-foreground">
              {row.company || row.contact_person || row.phone || "—"}
            </div>
          </div>
          <span className="shrink-0 font-mono text-[11.5px] font-semibold text-primary">{row.slug ?? row.lead_code}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-semibold"
            style={{
              color: statusColor,
              borderColor: `color-mix(in oklab, ${statusColor} 45%, transparent)`,
              background: `color-mix(in oklab, ${statusColor} 12%, transparent)`,
            }}
          >
            <span className="size-1.5 rounded-full" style={{ background: statusColor }} />
            {statusLabel}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[12px] font-semibold"
            style={{ color: `var(${pr.tone})`, background: `color-mix(in oklab, var(${pr.tone}) 12%, transparent)` }}
          >
            {pr.label}
          </span>
          {row.next_follow_up_at && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold",
                fu === "overdue" ? "bg-destructive/10 text-destructive" : fu === "today" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3" />
              {fu === "overdue" ? "Overdue · " : ""}
              {fmtFollowUp(row.next_follow_up_at)}
            </span>
          )}
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          {row.owner_avatar_url ? (
            <img src={row.owner_avatar_url} alt="" className="size-6 shrink-0 rounded-full object-cover ring-1 ring-border" />
          ) : (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-foreground">
              {initialsOf(row.owner_name)}
            </span>
          )}
          <span className="truncate">{row.owner_name ?? "Unassigned"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {phone && (
            <a
              href={`tel:${phone}`}
              aria-label="Call"
              className="grid size-10 place-items-center rounded-full text-channel-foreground transition-all hover:brightness-110 active:scale-90"
              style={{
                background: "var(--color-channel-call)",
                boxShadow: "0 1px 3px color-mix(in oklab, var(--color-channel-call) 38%, transparent)",
              }}
            >
              <Phone className="size-4" />
            </a>
          )}
          {wa && (
            <a
              href={waLink(wa)}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp"
              className="grid size-10 place-items-center rounded-full text-channel-foreground transition-all hover:brightness-110 active:scale-90"
              style={{
                background: "var(--color-channel-whatsapp)",
                boxShadow: "0 1px 3px color-mix(in oklab, var(--color-channel-whatsapp) 38%, transparent)",
              }}
            >
              <WhatsAppIcon className="size-[18px]" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
