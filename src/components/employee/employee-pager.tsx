import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listEmployees } from "@/lib/employees.functions";
import { cn } from "@/lib/utils";

/** Previous / Next between employee profiles (alphabetical), with Alt+← / Alt+→. */
export function EmployeePager({ segment }: { segment: string }) {
  const navigate = useNavigate();
  const listFn = useServerFn(listEmployees);
  const q = useQuery({ queryKey: ["employees.list"], queryFn: () => listFn(), staleTime: 60_000 });
  const list = useMemo(
    () => [...(q.data ?? [])].sort((a, b) => (a.fullName || a.brantaId).localeCompare(b.fullName || b.brantaId)),
    [q.data],
  );
  const idx = list.findIndex((r) => r.userId === segment || r.brantaId === segment);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const go = (r: (typeof list)[number] | null) => r && navigate({ to: "/app/employees/$userId", params: { userId: r.brantaId || r.userId } });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowLeft" && prev) { e.preventDefault(); go(prev); }
      if (e.key === "ArrowRight" && next) { e.preventDefault(); go(next); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (idx < 0 || list.length < 2) return null;
  const btn = "group inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[12px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" disabled={!prev} onClick={() => go(prev)} title={prev ? `Previous: ${prev.fullName || prev.brantaId} (Alt+←)` : undefined} className={btn}>
        <ChevronLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span className="hidden max-w-28 truncate sm:inline">{prev ? prev.fullName || prev.brantaId : "Previous"}</span>
      </button>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{idx + 1}/{list.length}</span>
      <button type="button" disabled={!next} onClick={() => go(next)} title={next ? `Next: ${next.fullName || next.brantaId} (Alt+→)` : undefined} className={cn(btn, "flex-row-reverse")}>
        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        <span className="hidden max-w-28 truncate sm:inline">{next ? next.fullName || next.brantaId : "Next"}</span>
      </button>
    </div>
  );
}
