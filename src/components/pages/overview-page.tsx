import { useSearch as useSearchRR, useParams as useParamsRR, useNavigate as useNavigateRR } from "@tanstack/react-router";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  getOverviewKpis, getTodaysMeetings, getActivityFeed,
  type RangeKey, type ActivityFeedItem, type OverviewMeeting, type KpiValue,
} from "@/lib/analytics.functions";
import { getOverviewBoard, type BoardLead, type BoardInvoice, type BoardPayment } from "@/lib/overview.functions";
import { ScopeSelector, type ScopeState } from "@/components/branta/scope-selector";
import { listMyTasks } from "@/lib/client-tasks.functions";
import { listAssignableUsers } from "@/lib/leads.functions";
import { MyTasksPanel } from "@/components/clients/client-tasks";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  ArrowUpRight, ArrowDownRight, Minus, Plus, FileText, Wallet, CalendarPlus, Zap, Phone,
  Receipt, UserX, HandCoins, ChevronRight, Calendar, Users, TrendingUp, Workflow, Activity,
  Mail, MessageCircle, Clock, CheckCircle2, UserPlus, ExternalLink, Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveCompany } from "@/components/company/company-switcher";
import { CompanyOverview } from "@/components/company/company-overview";
import { formatDistanceToNow, format } from "date-fns";

export const searchSchema = z.object({
  u: fallback(z.string(), "").default(""),
  r: fallback(z.string(), "7d").default("7d"),
});


type ChartRange = "7d" | "30d" | "90d" | "ytd";
type DrawerState =
  | { kind: "leads"; title: string; rows: BoardLead[] }
  | { kind: "lead"; lead: BoardLead }
  | { kind: "invoices"; title: string; rows: BoardInvoice[] }
  | { kind: "payments"; rows: BoardPayment[] }
  | null;

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-US");
const money = (n: number, c?: string | null) =>
  (c === "USD" ? "$" : "৳") + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const initials = (s: string) => s.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Dhaka" }).format(new Date()));
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}

export function OverviewPage() {
  const { active } = useActiveCompany();
  if (active && !active.is_holding) return <CompanyOverview key={active.slug} slug={active.slug} name={active.name} />;
  return <HoldingOverview />;
}

function HoldingOverview() {
  const search = (useSearchRR({ strict: false }) as z.infer<typeof searchSchema>);
  const navigate = useNavigateRR();
  const qc = useQueryClient();
  const [scope, setScope] = useState<ScopeState>({ userId: search.u || null, range: (search.r as RangeKey) || "7d" });
  const [chart, setChart] = useState<ChartRange>("30d");
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const updateScope = (v: ScopeState) => {
    setScope(v);
    navigate({ search: { u: v.userId ?? "", r: v.range } as never, replace: true } as never);
  };

  const kpisFn = useServerFn(getOverviewKpis);
  const meetingsFn = useServerFn(getTodaysMeetings);
  const feedFn = useServerFn(getActivityFeed);
  const boardFn = useServerFn(getOverviewBoard);
  const scopeArg = { userId: scope.userId, range: scope.range };
  const key = [scope.userId ?? "self", scope.range] as const;

  const kpisQ = useQuery({ queryKey: ["overview.kpis", ...key], queryFn: () => kpisFn({ data: scopeArg }), staleTime: 30_000 });
  const meetingsQ = useQuery({ queryKey: ["overview.meetings", ...key], queryFn: () => meetingsFn({ data: scopeArg }), staleTime: 60_000 });
  const feedQ = useQuery({ queryKey: ["overview.feed", ...key], queryFn: () => feedFn({ data: scopeArg }), staleTime: 20_000 });
  const boardQ = useQuery({
    queryKey: ["overview.board", scope.userId ?? "self", chart],
    queryFn: () => boardFn({ data: { userId: scope.userId, chart } }),
    staleTime: 30_000,
    placeholderData: (p) => p,
  });

  useEffect(() => {
    const ch = supabase
      .channel("overview-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_activities" }, () => {
        qc.invalidateQueries({ queryKey: ["overview.feed"] });
        qc.invalidateQueries({ queryKey: ["overview.kpis"] });
        qc.invalidateQueries({ queryKey: ["overview.board"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_activity_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["overview.feed"] });
        qc.invalidateQueries({ queryKey: ["overview.board"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const b = boardQ.data;

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-semibold tracking-tight text-foreground sm:text-[24px]">
            {greeting()}, {b?.firstName ?? "…"}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Here's what needs your attention today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/leads" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-primary-foreground shadow-sm transition hover:bg-brand-700">
            <Plus className="size-3.5" /> New Lead
          </Link>
          {b?.isFinance && (
            <>
              <QuickBtn to="/app/finance/invoices/new" icon={FileText} label="Create Invoice" />
              <QuickBtn to="/app/finance/invoices" icon={Wallet} label="Record Payment" />
            </>
          )}
          <QuickBtn to="/app/leads" icon={CalendarPlus} label="Schedule Meeting" />
          <ScopeSelector value={scope} onChange={updateScope} />
        </div>
      </div>

      <AttentionStrip b={b} loading={boardQ.isLoading} onOpen={setDrawer} />

      <KpiRow
        kpis={kpisQ.data}
        loading={kpisQ.isLoading}
        board={b}
        onOpenInvoices={() => b && setDrawer({ kind: "invoices", title: "Open invoices", rows: b.openInvoices })}
      />

      <MyTasksSection />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <MyDay meetings={meetingsQ.data ?? []} followUps={b?.attention.followUpsOverdue ?? []} loading={meetingsQ.isLoading || boardQ.isLoading} onLead={(lead) => setDrawer({ kind: "lead", lead })} />
        </div>
        <div className="min-w-0 xl:col-span-8">
          <Pipeline stages={b?.stages ?? []} loading={boardQ.isLoading} onLead={(lead) => setDrawer({ kind: "lead", lead })} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
        {b?.isFinance && (
          <div className="xl:col-span-4">
            <RevenueChart series={b.series} range={chart} onRange={setChart} loading={boardQ.isFetching} />
          </div>
        )}
        <div className={cn(b?.isFinance ? "xl:col-span-5" : b?.team.length ? "xl:col-span-8" : "xl:col-span-12", "min-w-0")}>
          <FeedCard rows={feedQ.data ?? []} loading={feedQ.isLoading} />
        </div>
        {!!b?.team.length && (
          <div className="xl:col-span-3">
            <TeamCard team={b.team} />
          </div>
        )}
      </div>

      <OverviewDrawer state={drawer} onClose={() => setDrawer(null)} onLead={(lead) => setDrawer({ kind: "lead", lead })} />
    </div>
  );
}

// ---------- Building blocks ----------

function QuickBtn({ to, icon: Icon, label }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link to={to as "/app"} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12.5px] font-medium text-foreground transition hover:border-brand/40 hover:bg-muted">
      <Icon className="size-3.5 text-muted-foreground" /> {label}
    </Link>
  );
}

function Card({ title, icon: Icon, action, children, className }: {
  title: string; icon?: React.ComponentType<{ className?: string }>; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-foreground">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
        </div>
        {action}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function ViewAll({ to, label = "View All" }: { to: string; label?: string }) {
  return (
    <Link to={to as "/app"} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-brand hover:underline">
      {label} <ChevronRight className="size-3.5" />
    </Link>
  );
}

function Skel({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full min-h-[120px] place-items-center p-6 text-center text-[12.5px] text-muted-foreground">{children}</div>;
}

function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return src ? (
    <img src={src} alt={name} className={cn("size-7 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <div className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-semibold text-brand-700", className)}>{initials(name)}</div>
  );
}

// ---------- Attention ----------

function AttentionStrip({ b, loading, onOpen }: { b: ReturnType<typeof useBoardType>; loading: boolean; onOpen: (d: DrawerState) => void }) {
  const items = b
    ? [
        { icon: Phone, n: b.attention.followUpsOverdue.length, label: "Follow-ups overdue", tone: "text-rose-600 bg-rose-50", go: () => onOpen({ kind: "leads", title: "Follow-ups overdue", rows: b.attention.followUpsOverdue }) },
        ...(b.isFinance
          ? [{ icon: Receipt, n: b.attention.invoicesOverdue.length, label: "Invoices overdue", tone: "text-amber-700 bg-amber-50", go: () => onOpen({ kind: "invoices", title: "Invoices overdue", rows: b.attention.invoicesOverdue }) }]
          : []),
        { icon: UserX, n: b.attention.leadsNotContacted.length, label: "Leads not contacted", tone: "text-sky-700 bg-sky-50", go: () => onOpen({ kind: "leads", title: "Leads not contacted (24h+)", rows: b.attention.leadsNotContacted }) },
        ...(b.isFinance
          ? [{ icon: HandCoins, n: b.attention.paymentsPending.length, label: "Employee payments pending", tone: "text-emerald-700 bg-emerald-50", go: () => onOpen({ kind: "payments", rows: b.attention.paymentsPending }) }]
          : []),
      ]
    : [];
  const total = items.reduce((a, i) => a + i.n, 0);
  return (
    <section className="rounded-xl border border-brand/15 bg-brand-50/60 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-start gap-2.5 lg:w-56">
          <Zap className="mt-0.5 size-4 text-brand" />
          <div>
            <div className="text-[14px] font-semibold text-foreground">Needs Your Attention</div>
            <div className="text-[12px] text-muted-foreground">
              {loading ? "Checking…" : total === 0 ? "All clear — nothing pending." : `${total} items need your action today.`}
            </div>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-[58px] bg-card" />)
            : items.map((i) => (
                <button key={i.label} type="button" onClick={i.go}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-left transition hover:border-brand/40 hover:shadow-sm">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", i.tone)}><i.icon className="size-4" /></span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[17px] font-semibold leading-none text-foreground">{i.n}</span>
                    <span className="mt-1 block truncate text-[11.5px] text-muted-foreground">{i.label}</span>
                  </span>
                  <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </button>
              ))}
        </div>
      </div>
    </section>
  );
}
// helper type
function useBoardType() { return undefined as undefined | Awaited<ReturnType<typeof getOverviewBoard>>; }

// ---------- KPIs ----------

function KpiRow({ kpis, loading, board, onOpenInvoices }: {
  kpis: Awaited<ReturnType<typeof getOverviewKpis>> | undefined; loading: boolean; board: ReturnType<typeof useBoardType>; onOpenInvoices: () => void;
}) {
  if (loading || !kpis) {
    return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skel key={i} className="h-[96px]" />)}</div>;
  }
  const rev = board?.revenueMonthBdt;
  const revDelta = board && board.revenuePrevMonthBdt ? Math.round((((rev ?? 0) - board.revenuePrevMonthBdt) / board.revenuePrevMonthBdt) * 100) : null;
  const wallet = kpis.walletAvailableBdt.value > 0 || kpis.walletAvailableUsd.value === 0 ? kpis.walletAvailableBdt : kpis.walletAvailableUsd;
  const tiles: { icon: React.ComponentType<{ className?: string }>; tone: string; label: string; value: string; delta: number | null; note: string; to?: string; onClick?: () => void }[] = [
    { icon: UserPlus, tone: "bg-emerald-50 text-emerald-700", label: "New Leads", value: String(kpis.newLeads.value), delta: kpis.newLeads.delta, note: "vs previous period", to: "/app/leads" },
    { icon: Calendar, tone: "bg-sky-50 text-sky-700", label: "Meetings Today", value: String(kpis.meetingsToday.value), delta: null, note: "scheduled today" },
    board?.isFinance
      ? { icon: FileText, tone: "bg-amber-50 text-amber-700", label: "Open Invoices", value: String(board.openInvoices.length), delta: null, note: "awaiting payment", onClick: onOpenInvoices }
      : { icon: FileText, tone: "bg-amber-50 text-amber-700", label: "Open Invoices", value: String(kpis.invoicesActionable.value), delta: null, note: "created by you", to: "/app/finance/invoices" },
    ...(board?.isFinance && rev != null
      ? [{ icon: TrendingUp, tone: "bg-emerald-50 text-emerald-700", label: "Revenue (BDT)", value: bdt(rev), delta: revDelta, note: "this month vs last", to: "/app/finance" }]
      : [{ icon: Activity, tone: "bg-emerald-50 text-emerald-700", label: "Leads Touched", value: String(kpis.leadsTouched.value), delta: kpis.leadsTouched.delta, note: "vs previous period" }]),
    { icon: Wallet, tone: "bg-brand-50 text-brand-700", label: `Wallet (${wallet.currency})`, value: money(wallet.value, wallet.currency), delta: null, note: "available balance", to: "/app/profile/wallet" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => {
        const inner = (
          <div className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-brand/40 hover:shadow-sm">
            <span className={cn("hidden size-9 shrink-0 place-items-center rounded-lg sm:grid", t.tone)}><t.icon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-muted-foreground">{t.label}</div>
              <div className="mt-1 truncate font-mono text-[20px] font-semibold tracking-tight text-foreground">{t.value}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <DeltaBadge delta={t.delta} /> <span className="truncate">{t.note}</span>
              </div>
            </div>
          </div>
        );
        if (t.onClick) return <button key={t.label} type="button" onClick={t.onClick} className="text-left">{inner}</button>;
        if (t.to) return <Link key={t.label} to={t.to as "/app"} className="block">{inner}</Link>;
        return <div key={t.label}>{inner}</div>;
      })}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta === 0) return <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="size-3" />0%</span>;
  const up = delta > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold", up ? "text-emerald-600" : "text-rose-600")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(delta)}%
    </span>
  );
}

function MyTasksSection() {
  const listMine = useServerFn(listMyTasks);
  const listUsers = useServerFn(listAssignableUsers);
  const q = useQuery({ queryKey: ["my-tasks"], queryFn: () => listMine(), staleTime: 30_000 });
  const usersQ = useQuery({ queryKey: ["leads", "assignable-users"], queryFn: () => listUsers(), staleTime: 60_000 });
  if (!q.data?.length) return null;
  return (
    <section>
      <div className="mb-2 text-[14px] font-semibold text-foreground">My Tasks <span className="text-muted-foreground">({q.data.length})</span></div>
      <MyTasksPanel tasks={q.data} users={usersQ.data ?? []} />
    </section>
  );
}

// ---------- My Day ----------

function MyDay({ meetings, followUps, loading, onLead }: { meetings: OverviewMeeting[]; followUps: BoardLead[]; loading: boolean; onLead: (l: BoardLead) => void }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const items = useMemo(() => {
    const m = meetings.map((x) => ({ id: `m-${x.id}`, at: x.starts_at, icon: Video, tone: "text-sky-600", title: x.title, sub: x.lead_slug ? "Lead meeting" : "Meeting", link: x.meeting_link, lead: null as BoardLead | null }));
    const f = followUps.slice(0, 6).map((l) => ({ id: `f-${l.id}`, at: l.nextFollowUp!, icon: Phone, tone: "text-rose-600", title: `Follow up with ${l.name}`, sub: l.nextAction || l.service || l.company || "Overdue follow-up", link: null as string | null, lead: l }));
    return [...m, ...f].sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [meetings, followUps]);
  const toggle = (id: string) => {
    setDone((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else { n.add(id); toast.success("Marked done for today"); }
      return n;
    });
  };
  return (
    <Card title="My Day" icon={Calendar} action={<ViewAll to="/app/leads" label="View Leads" />}>
      {loading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-12" />)}</div>
      ) : items.length === 0 ? (
        <Empty>No meetings or overdue follow-ups today.</Empty>
      ) : (
        <ul className="max-h-[360px] overflow-y-auto">
          {items.map((it) => {
            const isDone = done.has(it.id);
            const overdue = new Date(it.at).getTime() < Date.now();
            return (
              <li key={it.id} className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-muted/50">
                <div className="font-mono text-[11px] text-muted-foreground">
                  {new Date(it.at).toDateString() === new Date().toDateString() ? format(new Date(it.at), "hh:mm a") : format(new Date(it.at), "dd MMM")}
                </div>
                <button type="button" onClick={() => (it.lead ? onLead(it.lead) : it.link && window.open(it.link, "_blank"))} className="flex min-w-0 items-center gap-2.5 text-left">
                  <it.icon className={cn("size-4 shrink-0", it.tone)} />
                  <span className="min-w-0">
                    <span className={cn("block truncate text-[12.5px] font-medium text-foreground", isDone && "text-muted-foreground line-through")}>{it.title}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{overdue && it.lead ? "Overdue · " : ""}{it.sub}</span>
                  </span>
                </button>
                <button type="button" aria-label="Mark done" onClick={() => toggle(it.id)}
                  className={cn("grid size-5 place-items-center rounded-md border transition", isDone ? "border-emerald-500 bg-emerald-500 text-primary-foreground" : "border-border hover:border-brand")}>
                  {isDone && <CheckCircle2 className="size-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------- Pipeline ----------

function Pipeline({ stages, loading, onLead }: { stages: { key: string; label: string; color: string | null; count: number; leads: BoardLead[] }[]; loading: boolean; onLead: (l: BoardLead) => void }) {
  return (
    <Card title="Sales Pipeline" icon={Workflow} action={<ViewAll to="/app/leads" label="View Full Pipeline" />}>
      {loading ? (
        <div className="flex gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skel key={i} className="h-[280px] w-44 shrink-0" />)}</div>
      ) : stages.length === 0 ? (
        <Empty>No pipeline stages configured.</Empty>
      ) : (
        <div className="flex gap-3 overflow-x-auto p-4">
          {stages.map((s) => (
            <div key={s.key} className="flex w-[180px] shrink-0 flex-col rounded-lg border border-border bg-muted/40">
              <div className="h-[3px] rounded-t-lg" style={{ background: s.color ? `var(${s.color})` : "var(--color-border)" }} />
              <div className="flex items-baseline justify-between px-3 pt-2.5 pb-2">
                <span className="truncate text-[12px] font-semibold text-foreground">{s.label}</span>
                <span className="font-mono text-[12px] text-muted-foreground">{s.count}</span>
              </div>
              <div className="flex min-h-[200px] flex-1 flex-col gap-2 px-2 pb-2">
                {s.leads.length === 0 ? (
                  <div className="grid flex-1 place-items-center text-center text-[11px] text-muted-foreground">No leads</div>
                ) : (
                  s.leads.map((l) => (
                    <button key={l.id} type="button" onClick={() => onLead(l)}
                      className="rounded-lg border border-border bg-card p-2.5 text-left transition hover:border-brand/40 hover:shadow-sm">
                      <div className="flex items-center gap-2">
                        <Avatar name={l.ownerName ?? l.name} src={l.ownerAvatar} className="size-6 text-[9px]" />
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold text-foreground">{l.name}</span>
                          <span className="block truncate text-[10.5px] text-muted-foreground">{l.service || l.company || "—"}</span>
                        </span>
                      </div>
                      {l.value != null && <div className="mt-1.5 font-mono text-[12px] font-semibold text-foreground">{money(l.value, l.currency)}</div>}
                    </button>
                  ))
                )}
                {s.count > s.leads.length && (
                  <Link to="/app/leads" className="text-center text-[11px] font-medium text-brand hover:underline">+{s.count - s.leads.length} more</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Revenue ----------

function RevenueChart({ series, range, onRange, loading }: { series: { day: string; income: number; expense: number }[]; range: ChartRange; onRange: (r: ChartRange) => void; loading: boolean }) {
  const hasData = series.some((s) => s.income || s.expense);
  return (
    <Card title="Revenue & Expense" icon={TrendingUp} action={
      <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
        {(["7d", "30d", "90d", "ytd"] as ChartRange[]).map((r) => (
          <button key={r} type="button" onClick={() => onRange(r)}
            className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase", range === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{r}</button>
        ))}
      </div>
    }>
      <div className={cn("h-[260px] p-3 transition-opacity", loading && "opacity-60")}>
        {!hasData ? (
          <Empty>No BDT income or expense in this period.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-status-converted)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--color-status-converted)" stopOpacity={0} /></linearGradient>
                <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.18} /><stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="day" tickFormatter={(d) => format(new Date(d), "d MMM")} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="income" stroke="var(--color-status-converted)" fill="url(#inc)" strokeWidth={2} />
              <Area type="monotone" dataKey="expense" stroke="var(--color-destructive)" fill="url(#exp)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: { day: string; income: number; expense: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-[11.5px] shadow-md">
      <div className="mb-1 font-semibold text-foreground">{format(new Date(p.day), "d MMM yyyy")}</div>
      <div className="flex justify-between gap-4"><span className="text-emerald-600">Income</span><span className="font-mono">{bdt(p.income)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-rose-600">Expense</span><span className="font-mono">{bdt(p.expense)}</span></div>
      <div className="mt-1 flex justify-between gap-4 border-t border-border pt-1"><span className="text-muted-foreground">Net</span><span className="font-mono font-semibold">{bdt(p.income - p.expense)}</span></div>
    </div>
  );
}

// ---------- Activity ----------

function feedIcon(kind: string) {
  const k = kind.toLowerCase();
  if (k.includes("email") || k.includes("sent")) return { icon: Mail, tone: "bg-amber-50 text-amber-700" };
  if (k.includes("paid") || k.includes("payment")) return { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" };
  if (k.includes("meeting")) return { icon: Calendar, tone: "bg-sky-50 text-sky-700" };
  if (k.includes("call") || k.includes("whatsapp")) return { icon: MessageCircle, tone: "bg-emerald-50 text-emerald-700" };
  if (k.includes("created") || k.includes("new")) return { icon: UserPlus, tone: "bg-brand-50 text-brand-700" };
  return { icon: Activity, tone: "bg-muted text-muted-foreground" };
}

function FeedCard({ rows, loading }: { rows: ActivityFeedItem[]; loading: boolean }) {
  return (
    <Card title="Recent Activity" icon={Activity} action={<ViewAll to="/app/notifications" />}>
      {loading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-11" />)}</div>
      ) : rows.length === 0 ? (
        <Empty>No recent activity yet.</Empty>
      ) : (
        <ul className="max-h-[260px] overflow-y-auto">
          {rows.slice(0, 12).map((r) => {
            const { icon: Icon, tone } = feedIcon(r.kind + " " + r.title);
            const inner = (
              <div className="flex items-start gap-3 px-4 py-2.5">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", tone)}><Icon className="size-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-foreground">{r.title}</div>
                  {r.meta && <div className="truncate text-[11.5px] text-muted-foreground">{r.meta}</div>}
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.at), { addSuffix: true })}</div>
              </div>
            );
            return (
              <li key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                {r.href ? <Link to={r.href as "/app"}>{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------- Team ----------

function TeamCard({ team }: { team: { userId: string; name: string; avatar: string | null; leads: number; due: number; value: number }[] }) {
  const max = Math.max(1, ...team.map((t) => t.leads));
  return (
    <Card title="Team Performance" icon={Users} action={<ViewAll to="/app/employees" />}>
      <ul>
        {team.map((t) => (
          <li key={t.userId} className="border-b border-border last:border-0">
            <Link to="/app/employees/$userId" params={{ userId: t.userId }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
              <Avatar name={t.name} src={t.avatar} className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-medium text-foreground">{t.name}</span>
                  <span className="shrink-0 font-mono text-[12px] font-semibold text-foreground">{t.value ? bdt(t.value) : "—"}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{t.leads} leads · {t.due} due</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(t.leads / max) * 100}%` }} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------- Drawer ----------

function OverviewDrawer({ state, onClose, onLead }: { state: DrawerState; onClose: () => void; onLead: (l: BoardLead) => void }) {
  return (
    <Sheet open={!!state} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {state?.kind === "lead" ? (
          <LeadDetail lead={state.lead} />
        ) : state?.kind === "leads" ? (
          <>
            <SheetHeader><SheetTitle>{state.title}</SheetTitle><SheetDescription>{state.rows.length} leads</SheetDescription></SheetHeader>
            <DrawerList empty="Nothing here — nice work.">
              {state.rows.map((l) => (
                <button key={l.id} type="button" onClick={() => onLead(l)} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:border-brand/40">
                  <Avatar name={l.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{l.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{l.nextAction || l.service || l.company || "—"}</span>
                  </span>
                  {l.nextFollowUp && <span className="shrink-0 text-[11px] text-rose-600">{formatDistanceToNow(new Date(l.nextFollowUp), { addSuffix: true })}</span>}
                </button>
              ))}
            </DrawerList>
          </>
        ) : state?.kind === "invoices" ? (
          <>
            <SheetHeader><SheetTitle>{state.title}</SheetTitle><SheetDescription>{state.rows.length} invoices</SheetDescription></SheetHeader>
            <DrawerList empty="No invoices here.">
              {state.rows.map((i) => (
                <Link key={i.id} to="/app/finance/invoices/$slug" params={{ slug: i.slug }} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-brand/40">
                  <FileText className="size-4 shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{i.slug}{i.title ? ` · ${i.title}` : ""}</span>
                    <span className="block text-[11.5px] text-muted-foreground">Due {i.due ? format(new Date(i.due), "d MMM yyyy") : "—"}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[12px] font-semibold">{money(i.total - i.paid, i.currency)}</span>
                </Link>
              ))}
            </DrawerList>
            <div className="px-4 pb-4"><ViewAll to="/app/finance/invoices" label="Open Invoices page" /></div>
          </>
        ) : state?.kind === "payments" ? (
          <>
            <SheetHeader><SheetTitle>Employee payments pending</SheetTitle><SheetDescription>Draft, approved or committed — not yet paid.</SheetDescription></SheetHeader>
            <DrawerList empty="No pending employee payments.">
              {state.rows.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Avatar name={p.employee} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{p.employee}</span>
                    <span className="block truncate text-[11.5px] capitalize text-muted-foreground">{p.status}{p.description ? ` · ${p.description}` : ""}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[12px] font-semibold">{bdt(p.amount)}</span>
                </div>
              ))}
            </DrawerList>
            <div className="px-4 pb-4"><ViewAll to="/app/finance/employee-payments" label="Open Employee Payments" /></div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DrawerList({ children, empty }: { children: React.ReactNode[]; empty: string }) {
  return <div className="space-y-2 p-4">{children.length ? children : <Empty>{empty}</Empty>}</div>;
}

function LeadDetail({ lead: l }: { lead: BoardLead }) {
  const wa = (l.whatsapp || l.phone || "").replace(/\D/g, "");
  const rows: [string, React.ReactNode][] = [
    ["Company", l.company || "—"],
    ["Stage", <span className="capitalize">{l.status.replace(/_/g, " ")}</span>],
    ["Deal value", l.value != null ? money(l.value, l.currency) : "—"],
    ["Service", l.service || "—"],
    ["Assigned", l.ownerName || "—"],
    ["Last contact", l.lastActivity ? formatDistanceToNow(new Date(l.lastActivity), { addSuffix: true }) : "—"],
    ["Next follow-up", l.nextFollowUp ? format(new Date(l.nextFollowUp), "d MMM yyyy, hh:mm a") : "—"],
  ];
  return (
    <>
      <SheetHeader>
        <SheetTitle>{l.name}</SheetTitle>
        <SheetDescription>{l.nextAction || "Lead details"}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <ActionBtn href={l.phone ? `tel:${l.phone}` : undefined} icon={Phone} label="Call" className="bg-channel-call" />
          <ActionBtn href={wa ? `https://wa.me/${wa}` : undefined} icon={MessageCircle} label="WhatsApp" className="bg-channel-whatsapp" />
          <ActionBtn href={l.email ? `mailto:${l.email}` : undefined} icon={Mail} label="Email" className="bg-channel-email" />
        </div>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-3 py-2 text-[12.5px]">
              <dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        {l.notes && <div className="rounded-lg bg-muted/60 p-3 text-[12.5px] text-foreground whitespace-pre-wrap">{l.notes}</div>}
        <div className="grid grid-cols-2 gap-2">
          <Link to="/app/leads/$slug" params={{ slug: l.slug }} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border text-[12.5px] font-medium hover:bg-muted"><Clock className="size-3.5" /> Add Note / Schedule</Link>
          <Link to="/app/leads/$slug" params={{ slug: l.slug }} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand text-[12.5px] font-semibold text-primary-foreground hover:bg-brand-700"><ExternalLink className="size-3.5" /> Open Lead</Link>
        </div>
      </div>
    </>
  );
}

function ActionBtn({ href, icon: Icon, label, className }: { href?: string; icon: React.ComponentType<{ className?: string }>; label: string; className: string }) {
  if (!href) return <span className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-muted text-[12px] text-muted-foreground"><Icon className="size-3.5" />{label}</span>;
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold text-channel-foreground transition hover:opacity-90", className)}>
      <Icon className="size-3.5" />{label}
    </a>
  );
}
