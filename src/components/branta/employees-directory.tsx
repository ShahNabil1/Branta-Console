import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, Mail, Phone, Plus, Search, UserPlus } from "lucide-react";
import type { EmployeeRow } from "@/lib/employees.functions";
import { useOnlineUsers, type PresenceInfo } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";
import { MAIL_LABEL, mailTone } from "@/components/employee/mail-activity";

type Status = "online" | "idle" | "offline";
interface MailEvent {
  event: string;
  occurred_at: string;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  finance: "Finance",
  manager: "Manager",
  user: "User",
};
const roleBadge = (role: string) => {
  switch (role) {
    case "super_admin":
      return "border-brand/40 bg-brand/10 text-brand";
    case "admin":
      return "border-violet-300 bg-violet-50 text-violet-700";
    case "finance":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "manager":
      return "border-sky-300 bg-sky-50 text-sky-700";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
};
const BAD_MAIL = new Set(["hard_bounce", "blocked", "spam", "invalid_email", "error"]);

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
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function statusOf(p: PresenceInfo | undefined): Status {
  if (!p) return "offline";
  return p.state === "idle" ? "idle" : "online";
}

const DOT: Record<Status, string> = {
  online: "bg-emerald-500",
  idle: "bg-amber-400",
  offline: "bg-muted-foreground/40",
};

export function EmployeesDirectory({
  rows,
  loading,
  emailEvents,
  onOpen,
  onCreate,
  onDestinations,
  children,
}: {
  onDestinations?: () => void;
  rows: EmployeeRow[];
  loading: boolean;
  emailEvents: Map<string, MailEvent[]>;
  onOpen: (userId: string) => void;
  onCreate: () => void;
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

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const p = online.get(r.userId);
        return { ...r, status: statusOf(p), presence: p };
      }),
    [rows, online],
  );
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
      .filter(
        (r) =>
          !needle ||
          [r.fullName, r.email, r.employeeCode, r.jobRole, r.role].some((v) =>
            (v ?? "").toLowerCase().includes(needle),
          ),
      )
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""),
      );
  }, [enriched, q, filter]);

  const tabs: { key: "all" | Status; label: string }[] = [
    { key: "all", label: "All" },
    { key: "online", label: "Active now" },
    { key: "idle", label: "Away" },
    { key: "offline", label: "Offline" },
  ];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-screen-2xl flex-col gap-4 p-3 sm:p-5 lg:p-6">
      <header className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Directory
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Employees</h1>
          <p className="mt-1 max-w-2xl text-[13px] font-medium text-muted-foreground">
            {""}
          </p>
        </div>
        <div className="flex gap-2">
        {onDestinations && (
          <button onClick={onDestinations} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-border bg-card px-4 text-[13px] font-semibold transition-colors hover:border-brand hover:text-brand sm:h-9">
            <Mail className="size-3.5" /> Destinations
          </button>
        )}
        <button
          onClick={onCreate}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-brand px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-brand-700 sm:h-9"
        >
          <Plus className="size-3.5" strokeWidth={2} />
          Create Employee
        </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["Total staff", counts.all, "bg-foreground/70"],
            ["Active now", counts.online, DOT.online],
            ["Away", counts.idle, DOT.idle],
            ["Offline", counts.offline, DOT.offline],
          ] as const
        ).map(([label, n, dot]) => (
          <div key={label} className="rounded-sm border border-border bg-card px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className={cn("size-2 rounded-full", dot)} />
              {label}
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{n}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-sm border border-border bg-card p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                "shrink-0 rounded-[3px] px-3 py-1.5 text-[12px] font-semibold transition-colors",
                filter === t.key ? "bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className="font-mono text-[11px] opacity-70">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <label className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, code, role…"
            className="h-9 w-full rounded-sm border border-border bg-card pl-8 pr-3 text-[13px] outline-none focus:border-brand"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          <span className="text-sm">Loading employees…</span>
        </div>
      ) : list.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-sm border border-border bg-card text-muted-foreground">
          <UserPlus className="size-5" strokeWidth={1.5} />
          <p className="text-sm">{rows.length === 0 ? "No employees yet." : "No one matches this filter."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((r) => {
            const name = r.fullName?.trim() || r.brantaId;
            const mail = emailEvents.get(r.email)?.[0];
            const mailBad = mail && BAD_MAIL.has(mail.event);
            const statusText =
              r.status === "online"
                ? "Active now"
                : r.status === "idle"
                  ? `Away · ${ago(r.presence?.since ?? null, now)}`
                  : `Last active ${ago(r.lastSeenAt, now)}`;
            return (
              <button
                key={r.userId}
                type="button"
                onClick={() => onOpen(r.userId)}
                className="group flex min-w-0 flex-col rounded-sm border border-border bg-card text-left transition-colors hover:border-brand/40"
              >
                <div className="flex items-start gap-3 p-4">
                  <div className="relative shrink-0">
                    {r.avatarUrl ? (
                      <img
                        src={r.avatarUrl}
                        alt={name}
                        loading="lazy"
                        className="size-12 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <span className="grid size-12 place-items-center rounded-full bg-muted text-[14px] font-bold text-foreground ring-1 ring-border">
                        {initials(name)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 size-3.5 rounded-full ring-2 ring-card",
                        DOT[r.status],
                      )}
                    >
                      {r.status === "online" && (
                        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
                      )}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      title={name}
                      className="line-clamp-2 break-words text-[14.5px] font-bold leading-snug text-foreground"
                    >
                      {name}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-muted-foreground" title={r.jobRole ?? undefined}>
                      {r.jobRole || ROLE_LABEL[r.role] || r.role}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
                          roleBadge(r.role),
                        )}
                      >
                        {ROLE_LABEL[r.role] ?? r.role}
                      </span>
                      {r.employeeCode && (
                        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                          {r.employeeCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 px-4 pb-3 text-[12px] text-muted-foreground">
                  <div className="flex min-w-0 items-center gap-1.5" title={r.email}>
                    <Mail className="size-3 shrink-0" />
                    <span className="truncate font-mono">{r.email}</span>
                  </div>
                  {r.phone && (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Phone className="size-3 shrink-0" />
                      <span className="truncate font-mono">{r.phone}</span>
                    </div>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-[11.5px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn("size-1.5 shrink-0 rounded-full", DOT[r.status])} />
                    <span
                      className={cn(
                        "truncate font-medium",
                        r.status === "online" ? "text-emerald-700" : "text-muted-foreground",
                      )}
                    >
                      {statusText}
                    </span>
                  </span>
                  {mail ? (
                    <span title={`Last mail: ${MAIL_LABEL[mail.event] ?? mail.event} · ${ago(mail.occurred_at, now)}`} className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold", mailTone(mail.event))}>
                      {mailBad ? "⚠ " : ""}{MAIL_LABEL[mail.event] ?? mail.event}
                    </span>
                  ) : (
                    <span className="shrink-0 font-semibold text-brand sm:opacity-0 sm:group-hover:opacity-100">
                      Open →
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
}
