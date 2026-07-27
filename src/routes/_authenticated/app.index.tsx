import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  getOverviewKpis,
  getOverviewInbox,
  getTodaysMeetings,
  getFollowUps,
  getPipelineFunnel,
  getActivityFeed,
  type RangeKey,
  type OverviewFollowUp,
  type PipelineBucket,
  type ActivityFeedItem,
  type OverviewMeeting,
  type OverviewInboxItem,
  type OverviewKpis,
  type KpiValue,
} from "@/lib/analytics.functions";
import { ScopeSelector, type ScopeState } from "@/components/branta/scope-selector";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
  Inbox as InboxIcon,
  Calendar,
  Clock,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

const searchSchema = z.object({
  u: fallback(z.string(), "").default(""),
  r: fallback(z.string(), "7d").default("7d"),
});

export const Route = createFileRoute("/_authenticated/app/")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Overview · Branta Tech Console" }] }),
  component: OverviewPage,
});

function OverviewPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const [scope, setScope] = useState<ScopeState>({
    userId: search.u || null,
    range: (search.r as RangeKey) || "7d",
  });

  const updateScope = (v: ScopeState) => {
    setScope(v);
    navigate({
      search: { u: v.userId ?? "", r: v.range },
      replace: true,
    });
  };

  const kpisFn = useServerFn(getOverviewKpis);
  const inboxFn = useServerFn(getOverviewInbox);
  const meetingsFn = useServerFn(getTodaysMeetings);
  const followFn = useServerFn(getFollowUps);
  const funnelFn = useServerFn(getPipelineFunnel);
  const feedFn = useServerFn(getActivityFeed);

  const scopeArg = { userId: scope.userId, range: scope.range };
  const key = [scope.userId ?? "self", scope.range] as const;

  const kpisQ = useQuery({
    queryKey: ["overview.kpis", ...key],
    queryFn: () => kpisFn({ data: scopeArg }),
    staleTime: 30_000,
  });
  const inboxQ = useQuery({
    queryKey: ["overview.inbox", ...key],
    queryFn: () => inboxFn({ data: scopeArg }),
    staleTime: 30_000,
  });
  const meetingsQ = useQuery({
    queryKey: ["overview.meetings", ...key],
    queryFn: () => meetingsFn({ data: scopeArg }),
    staleTime: 60_000,
  });
  const followQ = useQuery({
    queryKey: ["overview.follow", ...key],
    queryFn: () => followFn({ data: scopeArg }),
    staleTime: 30_000,
  });
  const funnelQ = useQuery({
    queryKey: ["overview.funnel", ...key],
    queryFn: () => funnelFn({ data: scopeArg }),
    staleTime: 60_000,
  });
  const feedQ = useQuery({
    queryKey: ["overview.feed", ...key],
    queryFn: () => feedFn({ data: scopeArg }),
    staleTime: 20_000,
  });

  // Realtime: invalidate on new lead_activities / invoice_activity_logs / inbox_messages
  useEffect(() => {
    const ch = supabase
      .channel("overview-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_activities" }, () => {
        qc.invalidateQueries({ queryKey: ["overview.feed"] });
        qc.invalidateQueries({ queryKey: ["overview.kpis"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_activity_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["overview.feed"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["overview.inbox"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
            Overview
          </h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            What needs your attention right now.
          </p>
        </div>
        <ScopeSelector value={scope} onChange={updateScope} />
      </div>

      {/* KPI grid */}
      <KpiGrid data={kpisQ.data} loading={kpisQ.isLoading} />

      {/* Row: inbox / meetings / follow-ups */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InboxCard rows={inboxQ.data ?? []} loading={inboxQ.isLoading} />
        <MeetingsCard rows={meetingsQ.data ?? []} loading={meetingsQ.isLoading} />
        <FollowUpsCard rows={followQ.data ?? []} loading={followQ.isLoading} />
      </div>

      {/* Pipeline funnel */}
      <FunnelCard buckets={funnelQ.data ?? []} loading={funnelQ.isLoading} />

      {/* Activity feed */}
      <FeedCard rows={feedQ.data ?? []} loading={feedQ.isLoading} />
    </div>
  );
}

// ---------- Widgets ----------

function KpiGrid({ data, loading }: { data: OverviewKpis | undefined; loading: boolean }) {
  const items: (KpiValue & { key: keyof OverviewKpis })[] = data
    ? [
        { key: "newLeads", ...data.newLeads },
        { key: "leadsTouched", ...data.leadsTouched },
        { key: "meetingsToday", ...data.meetingsToday },
        { key: "emailsSent", ...data.emailsSent },
        { key: "invoicesActionable", ...data.invoicesActionable },
        { key: "walletAvailableUsd", ...data.walletAvailableUsd },
        { key: "walletAvailableBdt", ...data.walletAvailableBdt },
      ]
    : [];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {loading && !data
        ? Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-md border border-border bg-card" />
          ))
        : items.map((k) => <KpiTileReal key={k.key} kpi={k} />)}
    </div>
  );
}

function KpiTileReal({ kpi }: { kpi: KpiValue }) {
  const money = Boolean(kpi.currency);
  const sym = kpi.currency === "USD" ? "$" : kpi.currency === "BDT" ? "৳" : "";
  const val = money
    ? `${sym}${Number(kpi.value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : Number(kpi.value).toLocaleString("en-US");
  const body = (
    <div className="hairline flex h-full flex-col justify-between rounded-md border border-border bg-card p-3 transition-colors hover:border-brand/40">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {kpi.label}
      </div>
      <div className="flex items-end justify-between">
        <div className="font-mono text-[22px] font-semibold tracking-tight text-foreground">
          {val}
        </div>
        <DeltaBadge delta={kpi.delta} />
      </div>
    </div>
  );
  return kpi.href ? (
    <Link to={kpi.href as "/app"} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[10px] text-muted-foreground">—</span>;
  if (delta === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground">
        <Minus className="size-3" /> 0%
      </span>
    );
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[10.5px] font-semibold",
        up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(delta)}%
    </span>
  );
}

function SectionCard({
  title,
  action,
  children,
  icon: Icon,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <section className="hairline overflow-hidden rounded-md border border-border bg-card">
      <div className="hairline-b flex h-9 items-center justify-between bg-muted/40 px-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {Icon && <Icon className="size-3.5" />}
          {title}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function InboxCard({ rows, loading }: { rows: OverviewInboxItem[]; loading: boolean }) {
  return (
    <SectionCard
      title="Inbox · unread"
      icon={InboxIcon}
      action={
        <Link to="/app/inbox" className="text-[11px] font-semibold text-brand hover:underline">
          Open →
        </Link>
      }
    >
      {loading ? (
        <div className="grid place-items-center p-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">Inbox zero. Nice.</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-2.5 hover:bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[12.5px] font-medium text-foreground">{r.from}</div>
                <div className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                  {formatDistanceToNow(new Date(r.received_at), { addSuffix: true })}
                </div>
              </div>
              <div className="truncate text-[12px] text-foreground/80">{r.subject}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{r.snippet}</div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function MeetingsCard({ rows, loading }: { rows: OverviewMeeting[]; loading: boolean }) {
  return (
    <SectionCard title="Today's meetings" icon={Calendar}>
      {loading ? (
        <div className="grid place-items-center p-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">
          No meetings scheduled today.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((m) => (
            <li key={m.id} className="p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[12.5px] font-medium text-foreground">{m.title}</div>
                <div className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                  {format(new Date(m.starts_at), "HH:mm")}
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                {m.meeting_link && (
                  <a
                    href={m.meeting_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-0.5 text-brand hover:border-brand/40"
                  >
                    Join <ExternalLink className="size-3" />
                  </a>
                )}
                {m.lead_slug && (
                  <Link
                    to="/app/leads/$slug"
                    params={{ slug: m.lead_slug }}
                    className="inline-flex items-center rounded-sm border border-border bg-card px-1.5 py-0.5 text-muted-foreground hover:border-brand/40 hover:text-foreground"
                  >
                    Open lead
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function FollowUpsCard({ rows, loading }: { rows: OverviewFollowUp[]; loading: boolean }) {
  return (
    <SectionCard title="Follow-ups due" icon={Clock}>
      {loading ? (
        <div className="grid place-items-center p-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">Nothing overdue. 🎉</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-2.5 hover:bg-muted/40">
              <Link to="/app/leads/$slug" params={{ slug: r.slug }} className="block">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-[12.5px] font-medium text-foreground">
                    {r.name}
                  </div>
                  {r.stalled && (
                    <span className="inline-flex items-center gap-0.5 rounded-sm bg-rose-50 px-1 py-0.5 text-[10px] font-semibold text-rose-700">
                      <AlertTriangle className="size-2.5" /> Stalled
                    </span>
                  )}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  {r.next_action || r.company || "—"}
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                  Last: {formatDistanceToNow(new Date(r.last_activity_at), { addSuffix: true })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function FunnelCard({ buckets, loading }: { buckets: PipelineBucket[]; loading: boolean }) {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  return (
    <SectionCard title="Pipeline funnel">
      {loading ? (
        <div className="grid place-items-center p-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : total === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">
          No leads in this window.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-6">
          {buckets.map((b) => {
            const pct = total ? Math.round((b.count / total) * 100) : 0;
            return (
              <div
                key={b.key}
                className="rounded-sm border border-border bg-background p-2.5"
              >
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  {b.label}
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="font-mono text-[20px] font-semibold text-foreground">
                    {b.count}
                  </div>
                  <div className="font-mono text-[10.5px] text-muted-foreground">{pct}%</div>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${pct}%`, background: b.color_var ? `var(${b.color_var})` : undefined }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function FeedCard({ rows, loading }: { rows: ActivityFeedItem[]; loading: boolean }) {
  return (
    <SectionCard title="Live activity">
      {loading ? (
        <div className="grid place-items-center p-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">
          No recent activity yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const inner = (
              <div className="flex gap-3 p-2.5">
                <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[12.5px] font-medium text-foreground">
                      {r.title}
                    </div>
                    <div className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                      {formatDistanceToNow(new Date(r.at), { addSuffix: true })}
                    </div>
                  </div>
                  {r.meta && (
                    <div className="truncate text-[11.5px] text-muted-foreground">{r.meta}</div>
                  )}
                </div>
              </div>
            );
            return r.href ? (
              <li key={r.id} className="hover:bg-muted/40">
                <Link to={r.href as "/app"}>{inner}</Link>
              </li>
            ) : (
              <li key={r.id}>{inner}</li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
