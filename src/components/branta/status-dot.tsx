import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/mock-data";

const LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  viewed: "Viewed",
  meeting: "Meeting Scheduled",
  converted: "Converted",
};

const DOT: Record<LeadStatus, string> = {
  new: "bg-[var(--color-status-new)]",
  contacted: "bg-[var(--color-status-contacted)]",
  viewed: "bg-[var(--color-status-viewed)]",
  meeting: "bg-[var(--color-status-meeting)]",
  converted: "bg-[var(--color-status-converted)]",
};

export function StatusDot({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px]", className)}>
      <span className={cn("size-1.5 rounded-full", DOT[status])} />
      <span>{LABEL[status]}</span>
    </span>
  );
}
