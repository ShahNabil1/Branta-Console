import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Briefcase, Mail, Phone, Plus, Search, UserPlus, Users } from "lucide-react";
import type { EmployeeRow } from "@/lib/employees.functions";
import { useOnlineUsers, type PresenceInfo } from "@/hooks/use-presence";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudflareMark, PageHero } from "@/components/branta/page-hero";
import { cn } from "@/lib/utils";

type Status = "online" | "idle" | "offline";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || name.slice(0, 2).toUpperCase();

function ago(iso: string | null, now: number): string {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Never";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const statusOf = (p: PresenceInfo | undefined): Status => (!p ? "offline" : p.state === "idle" ? "idle" : "online");

const DOT: Record<Status, string> = {
  online: "bg-status-converted",
  idle: "bg-amber-400",
  offline: "bg-muted-foreground/40",
};

const TABS: { key: "all" | Status; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Active now" },
  { key: "idle", label: "Away" },
  { key: "offline", label: "Offline" },
];

export function EmployeesDirectory({
  rows,
  loading,
  onOpen,
  onCreate,
  onRouting,
  children,
}: {
  rows: EmployeeRow[];
  loading: boolean;
  onOpen: (userId: string) => void;
  onCreate: () => void;
  onRouting?: () => void;
  children?: ReactNode;
}) {
  const online = useOnlineUsers();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");

  const enriched = useMemo(() => rows.map((r) => { const p = online.get(r.userId); return { ...r, status: statusOf(p), presence: p }; }), [rows, online]);
  const counts = useMemo(() => {
    const c = { all: enriched.length, online: 0, idle: 0, offline: 0 };
    enriched.forEach((r) => c[r.status]++);
    return c;
  }, [enriched]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank: Record<Status, number> = { online: 0, idle: 1, offline: 2 };
    return enriched
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) => !needle || [r.fullName, r.email, r.employeeCode, r.jobRole].some((v) => (v ?? "").toLowerCase().includes(needle)))
      .sort((a, b) => rank[a.status] - rank[b.status] || (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));
  }, [enriched, q, filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHero
        icon={Users}
        eyebrow="Branta Tech Group"
        title="Employees"
        subtitle={loading ? undefined : `${counts.all} people · ${counts.online} active now`}
        actions={
          <>
            {onRouting && (
              <Button variant="outline" onClick={onRouting} className="gap-2 transition-all hover:-translate-y-0.5 active:scale-95">
                <CloudflareMark className="size-4" /> Email Routing
              </Button>
            )}
            <Button onClick={onCreate} className="gap-1.5 shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-95">
              <Plus className="size-4" /> Create employee
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <UnderlineTabs
          className="border-b border-border"
          ariaLabel="Presence filter"
          value={filter}
          onChange={setFilter}
          items={TABS.map((t) => ({ id: t.key, label: t.label, count: counts[t.key], lead: t.key !== "all" ? <span className={cn("size-1.5 rounded-full", DOT[t.key])} /> : undefined }))}
        />
        <label className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, code, job role…"
            className="h-9 w-full rounded-full border border-border bg-card pl-8 pr-3 text-[13px] shadow-sm outline-none transition-colors focus:border-brand"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
        {!loading && list.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center text-[13px] font-semibold text-muted-foreground">
            <UserPlus className="size-5" />
            {rows.length === 0 ? "No employees yet." : "No one matches this filter."}
          </div>
        )}
        {!loading && list.map((r, i) => {
          const name = r.fullName?.trim() || r.brantaId;
          const statusText = r.status === "online" ? "Active now" : r.status === "idle" ? `Away · ${ago(r.presence?.since ?? null, now)}` : `Last active ${ago(r.lastSeenAt, now)}`;
          return (
            <button
              key={r.userId}
              type="button"
              onClick={() => onOpen(r.userId)}
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
              className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-5 text-left shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 fill-mode-both hover:-translate-y-1 hover:border-transparent hover:shadow-xl active:scale-[0.99]"
            >
              <span className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-brand/15 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
              <span className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-brand transition-transform duration-300 group-hover:scale-x-100" />
              <div className="relative flex items-start gap-3">
                <div className="relative shrink-0 transition-transform duration-300 group-hover:scale-105">
                  {r.avatarUrl ? (
                    <img src={r.avatarUrl} alt={name} loading="lazy" className="size-12 rounded-full object-cover ring-2 ring-card shadow-sm" />
                  ) : (
                    <span className="grid size-12 place-items-center rounded-full bg-muted text-[14px] font-bold ring-2 ring-card shadow-sm">{initials(name)}</span>
                  )}
                  <span className={cn("absolute bottom-0 right-0 size-3.5 rounded-full ring-2 ring-card", DOT[r.status])}>
                    {r.status === "online" && <span className="absolute inset-0 animate-ping rounded-full bg-status-converted opacity-50" />}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div title={name} className="line-clamp-2 break-words text-[15px] font-bold leading-snug">{name}</div>
                  {r.jobRole ? (
                    <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand" title={r.jobRole}>
                      <Briefcase className="size-3 shrink-0" /><span className="truncate">{r.jobRole}</span>
                    </span>
                  ) : (
                    <span className="mt-1.5 inline-block text-[11.5px] text-muted-foreground">No job role set</span>
                  )}
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>

              <div className="relative mt-4 space-y-1.5 rounded-md bg-muted/60 p-2.5 text-[12px] text-muted-foreground">
                <div className="flex min-w-0 items-center gap-2" title={r.email}><Mail className="size-3.5 shrink-0" /><span className="truncate font-mono">{r.email}</span></div>
                {r.phone && <div className="flex min-w-0 items-center gap-2"><Phone className="size-3.5 shrink-0" /><span className="truncate font-mono">{r.phone}</span></div>}
              </div>

              <div className="relative mt-auto flex items-center justify-between gap-2 pt-3 text-[11.5px] font-semibold text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className={cn("size-1.5 shrink-0 rounded-full", DOT[r.status])} />
                  <span className={cn("truncate", r.status === "online" && "text-status-converted")}>{statusText}</span>
                </span>
                {r.employeeCode && <span className="shrink-0 font-mono text-[10.5px]">{r.employeeCode}</span>}
              </div>
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}
