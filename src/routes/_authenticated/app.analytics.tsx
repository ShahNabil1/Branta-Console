import { useActiveCompany } from "@/components/company/company-switcher";
import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  getLeadVelocity,
  getLeadSourceMix,
  getPipelineFunnel,
  getActivityHeatmap,
  getFinanceAttribution,
  getTeamLeaderboard,
  type RangeKey,
  type VelocityPoint,
  type SourceSlice,
  type PipelineBucket,
  type HeatmapCell,
  type FinanceAttribution,
  type LeaderboardRow,
} from "@/lib/analytics.functions";
import { getMyPermissions } from "@/lib/permissions.functions";
import { ScopeSelector, type ScopeState } from "@/components/branta/scope-selector";
import { cn } from "@/lib/utils";
import { Loader2, TrendingUp, PieChart as PieIcon, BarChart3, Activity, Wallet, Trophy } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";

const searchSchema = z.object({
  u: fallback(z.string(), "").default(""),
  r: fallback(z.string(), "30d").default("30d"),
});

export const Route = createFileRoute("/_authenticated/app/analytics")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Analytics · Branta Tech Console" }] }),
  component: AnalyticsPage,
});

export function AnalyticsPage() {
  const _ac = useActiveCompany().active;
  const workspace = _ac && !_ac.is_holding ? _ac.slug : null;
  const search = useSearch({ strict: false }) as { u?: string; r?: string };
  const navigate = useNavigate();
  const [scope, setScope] = useState<ScopeState>({
    userId: search.u || null,
    range: (search.r as RangeKey) || "30d",
  });
  const updateScope = (v: ScopeState) => {
    setScope(v);
    navigate({ to: ".", search: { u: v.userId ?? "", r: v.range } as never, replace: true });
  };

  const scopeArg = { userId: scope.userId, range: scope.range, workspace };
  const key = [workspace ?? "holding", scope.userId ?? "self", scope.range] as const;

  const permsFn = useServerFn(getMyPermissions);
  const permsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permsFn(),
    staleTime: 60_000,
  });
  const isAdmin = Boolean(permsQ.data?.isAdmin || permsQ.data?.isSuperAdmin);

  const velocityFn = useServerFn(getLeadVelocity);
  const sourceFn = useServerFn(getLeadSourceMix);
  const funnelFn = useServerFn(getPipelineFunnel);
  const heatFn = useServerFn(getActivityHeatmap);
  const finFn = useServerFn(getFinanceAttribution);
  const boardFn = useServerFn(getTeamLeaderboard);

  const velocityQ = useQuery({ queryKey: ["a.velocity", ...key], queryFn: () => velocityFn({ data: scopeArg }), staleTime: 60_000 });
  const sourceQ = useQuery({ queryKey: ["a.source", ...key], queryFn: () => sourceFn({ data: scopeArg }), staleTime: 60_000 });
  const funnelQ = useQuery({ queryKey: ["a.funnel", ...key], queryFn: () => funnelFn({ data: scopeArg }), staleTime: 60_000 });
  const heatQ = useQuery({ queryKey: ["a.heat", ...key], queryFn: () => heatFn({ data: scopeArg }), staleTime: 60_000 });
  const finQ = useQuery({ queryKey: ["a.fin", ...key], queryFn: () => finFn({ data: scopeArg }), staleTime: 60_000 });
  const boardQ = useQuery({
    queryKey: ["a.board", workspace ?? "holding", scope.range],
    queryFn: () => boardFn({ data: { userId: null, range: scope.range, workspace } }),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
            Analytics
          </h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Trends, productivity, and revenue attribution over time.
          </p>
        </div>
        <ScopeSelector value={scope} onChange={updateScope} />
      </div>

      {/* Pipeline funnel + conversion */}
      <FunnelSummary buckets={funnelQ.data ?? []} loading={funnelQ.isLoading} />

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Lead velocity" icon={TrendingUp} span="lg:col-span-2">
          <VelocityChart data={velocityQ.data ?? []} loading={velocityQ.isLoading} />
        </ChartCard>
        <ChartCard title="Source mix" icon={PieIcon}>
          <SourceChart data={sourceQ.data ?? []} loading={sourceQ.isLoading} />
        </ChartCard>
      </div>

      {/* Activity heatmap */}
      <ChartCard title="Working pattern · lead activities per hour" icon={Activity}>
        <Heatmap cells={heatQ.data ?? []} loading={heatQ.isLoading} />
      </ChartCard>

      {/* Finance attribution */}
      <ChartCard title="Revenue attributed to this employee" icon={Wallet}>
        <FinanceBlock data={finQ.data} loading={finQ.isLoading} />
      </ChartCard>

      {/* Leaderboard (admin) */}
      {isAdmin && (
        <ChartCard title="Team leaderboard" icon={Trophy}>
          <Leaderboard
            rows={boardQ.data ?? []}
            loading={boardQ.isLoading}
            onPick={(uid) => updateScope({ ...scope, userId: uid })}
          />
        </ChartCard>
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function ChartCard({
  title, icon: Icon, children, span,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  span?: string;
}) {
  return (
    <section className={cn("hairline overflow-hidden rounded-md border border-border bg-card", span)}>
      <div className="hairline-b flex h-9 items-center gap-1.5 bg-muted/40 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {Icon && <Icon className="size-3.5" />} {title}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function LoadingBlock({ h = 200 }: { h?: number }) {
  return (
    <div style={{ height: h }} className="grid place-items-center text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}

function FunnelSummary({ buckets, loading }: { buckets: PipelineBucket[]; loading: boolean }) {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const converted = buckets.find((b) => b.key === "converted")?.count ?? 0;
  const lost = buckets.find((b) => b.key === "lost")?.count ?? 0;
  const closed = converted + lost;
  const rate = closed > 0 ? Math.round((converted / closed) * 100) : null;

  return (
    <section className="hairline rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <BarChart3 className="size-3.5" /> Leads funnel
        </div>
        <div className="flex items-center gap-4">
          <Kpi label="Total" value={total} />
          <Kpi label="Converted" value={converted} tone="pos" />
          <Kpi label="Lost" value={lost} tone="neg" />
          <Kpi label="Conversion" value={rate === null ? "—" : `${rate}%`} tone={rate && rate >= 25 ? "pos" : "neutral"} />
        </div>
      </div>
      {loading ? (
        <div className="mt-3"><LoadingBlock h={80} /></div>
      ) : (
        <div className="mt-3 flex h-6 overflow-hidden rounded-sm border border-border">
          {buckets.map((b) => {
            const pct = total ? (b.count / total) * 100 : 0;
            return (
              <div
                key={b.key}
                title={`${b.label}: ${b.count}`}
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: b.color_var ? `var(${b.color_var})` : "hsl(var(--muted))",
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: "pos" | "neg" | "neutral" }) {
  return (
    <div className="flex flex-col items-end">
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-mono text-[15px] font-semibold",
          tone === "pos" && "text-emerald-600",
          tone === "neg" && "text-rose-600",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function VelocityChart({ data, loading }: { data: VelocityPoint[]; loading: boolean }) {
  if (loading) return <LoadingBlock />;
  if (data.length === 0) return <EmptyBlock msg="No leads yet." />;
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} fontSize={10} stroke="hsl(var(--muted-foreground))" />
          <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4 }} />
          <Line type="monotone" dataKey="created" stroke="hsl(var(--brand))" strokeWidth={2} dot={false} name="Created" />
          <Line type="monotone" dataKey="converted" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} name="Converted" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_COLORS = ["hsl(var(--brand))", "hsl(210 90% 55%)", "hsl(280 65% 60%)", "hsl(142 71% 45%)", "hsl(38 92% 55%)", "hsl(0 84% 60%)", "hsl(190 80% 45%)"];

function SourceChart({ data, loading }: { data: SourceSlice[]; loading: boolean }) {
  if (loading) return <LoadingBlock />;
  if (data.length === 0) return <EmptyBlock msg="No source data." />;
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="source" innerRadius={45} outerRadius={80} paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function Heatmap({ cells, loading }: { cells: HeatmapCell[]; loading: boolean }) {
  if (loading) return <LoadingBlock h={140} />;
  const max = Math.max(1, ...cells.map((c) => c.count));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid grid-cols-[40px_repeat(24,minmax(14px,1fr))] gap-0.5">
          <div />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="text-center font-mono text-[9px] text-muted-foreground">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {days.map((d, dow) => (
            <>
              <div key={`l-${dow}`} className="pr-1 text-right text-[10px] text-muted-foreground">{d}</div>
              {Array.from({ length: 24 }).map((_, h) => {
                const c = cells.find((x) => x.dow === dow && x.hour === h)?.count ?? 0;
                const intensity = c === 0 ? 0 : 0.15 + 0.85 * (c / max);
                return (
                  <div
                    key={`c-${dow}-${h}`}
                    title={`${d} ${h}:00 · ${c} activities`}
                    className="h-4 rounded-[2px]"
                    style={{
                      background: c === 0 ? "hsl(var(--muted))" : `hsl(var(--brand) / ${intensity})`,
                    }}
                  />
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

function FinanceBlock({ data, loading }: { data: FinanceAttribution | undefined; loading: boolean }) {
  if (loading || !data) return <LoadingBlock />;
  const money = (n: number, cur: string) =>
    `${cur === "USD" ? "$" : "৳"}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Booked BDT" value={money(data.bookedBdt, "BDT")} tone="pos" />
        <Kpi label="Booked USD" value={money(data.bookedUsd, "USD")} tone="pos" />
        <Kpi label="Pipeline BDT" value={money(data.pipelineBdt, "BDT")} />
        <Kpi label="Pipeline USD" value={money(data.pipelineUsd, "USD")} />
      </div>
      {data.monthly.length === 0 ? (
        <EmptyBlock msg="No revenue booked yet in this window." />
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthly} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" fontSize={10} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="usd" stroke="hsl(var(--brand))" strokeWidth={2} dot={false} name="USD" />
              <Line type="monotone" dataKey="bdt" stroke="hsl(210 90% 55%)" strokeWidth={2} dot={false} name="BDT" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Leaderboard({
  rows, loading, onPick,
}: { rows: LeaderboardRow[]; loading: boolean; onPick: (uid: string) => void }) {
  if (loading) return <LoadingBlock h={160} />;
  if (rows.length === 0) return <EmptyBlock msg="No activity in this window." />;
  return (
    <div className="overflow-x-auto rounded-sm border border-border">
      <table className="w-full text-[12px]">
        <thead className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Employee</th>
            <th className="px-3 py-2 text-right">Leads</th>
            <th className="px-3 py-2 text-right">Converted</th>
            <th className="px-3 py-2 text-right">Emails</th>
            <th className="px-3 py-2 text-right">Meetings</th>
            <th className="px-3 py-2 text-right">BDT</th>
            <th className="px-3 py-2 text-right">USD</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{r.full_name ?? "—"}</span>
                  {r.employee_code && (
                    <span className="rounded-sm border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                      {r.employee_code}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right font-mono">{r.leads_created}</td>
              <td className="px-3 py-2 text-right font-mono text-emerald-600">{r.leads_converted}</td>
              <td className="px-3 py-2 text-right font-mono">{r.emails_sent}</td>
              <td className="px-3 py-2 text-right font-mono">{r.meetings_held}</td>
              <td className="px-3 py-2 text-right font-mono">৳{r.revenue_bdt.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-mono">${r.revenue_usd.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onPick(r.user_id)}
                    className="rounded-sm border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:border-brand/40 hover:text-foreground"
                  >
                    View
                  </button>
                  <Link
                    to="/app/employees/$userId"
                    params={{ userId: r.user_id }}
                    className="rounded-sm border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:border-brand/40 hover:text-foreground"
                  >
                    Profile
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyBlock({ msg }: { msg: string }) {
  return <div className="grid place-items-center py-8 text-[12px] text-muted-foreground">{msg}</div>;
}
