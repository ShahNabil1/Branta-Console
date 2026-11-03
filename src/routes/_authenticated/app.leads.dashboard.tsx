import { useActiveCompany } from "@/components/company/company-switcher";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarRange, RotateCcw } from "lucide-react";
import { getLeadDashboard, type LeadDashboardInput } from "@/lib/lead-dashboard.functions";
import {
  listLeadServiceOptions,
  listLeadSourceOptions,
  listLeadStatusOptions,
  SERVICE_FALLBACK,
  SOURCE_FALLBACK,
  STATUS_FALLBACK,
} from "@/lib/lead-options.functions";
import { PRIORITY_OPTIONS } from "@/components/leads/lead-meta";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/leads/dashboard")({
  head: () => ({
    meta: [
      { title: "Lead Dashboard — Branta Console" },
      { name: "description", content: "Management summary of leads by status, source, employee and priority." },
      { property: "og:title", content: "Lead Dashboard — Branta Console" },
      { property: "og:description", content: "Management summary of leads by status, source, employee and priority." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadDashboardPage,
});

type Preset = "today" | "yesterday" | "week" | "month" | "all" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All time" },
];

function bdToday() {
  return new Date(Date.now() + 6 * 3600_000);
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function rangeFor(p: Preset, custom: { from: string; to: string }): { from: string | null; to: string | null } {
  const now = bdToday();
  const day = 86_400_000;
  switch (p) {
    case "today":
      return { from: ymd(now), to: ymd(now) };
    case "yesterday": {
      const y = new Date(now.getTime() - day);
      return { from: ymd(y), to: ymd(y) };
    }
    case "week": {
      // Bangladesh business week starts Saturday
      const back = (now.getUTCDay() + 1) % 7;
      return { from: ymd(new Date(now.getTime() - back * day)), to: ymd(now) };
    }
    case "month":
      return { from: `${ymd(now).slice(0, 7)}-01`, to: ymd(now) };
    case "custom":
      return { from: custom.from || null, to: custom.to || null };
    default:
      return { from: null, to: null };
  }
}

function LeadDashboardPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [customOpen, setCustomOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [priority, setPriority] = useState("");

  const range = rangeFor(preset, custom);
  const input: LeadDashboardInput = {
    ...range,
    owner: owner || null,
    source: source || null,
    status: status || null,
    service: service || null,
    priority: priority || null,
    workspace,
  };

  const fetchDash = useServerFn(getLeadDashboard);
  const fStatus = useServerFn(listLeadStatusOptions);
  const fSource = useServerFn(listLeadSourceOptions);
  const fService = useServerFn(listLeadServiceOptions);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["lead-dashboard", input],
    queryFn: () => fetchDash({ data: input }),
    placeholderData: (p) => p,
  });
  const statuses = useQuery({ queryKey: ["lead-status-options"], queryFn: () => fStatus() }).data ?? STATUS_FALLBACK;
  const sources = useQuery({ queryKey: ["lead-source-options"], queryFn: () => fSource() }).data ?? SOURCE_FALLBACK;
  const services = useQuery({ queryKey: ["lead-service-options"], queryFn: () => fService() }).data ?? SERVICE_FALLBACK;

  const labelStatus = (k: string) => statuses.find((s) => s.key === k)?.label ?? STATUS_FALLBACK.find((s) => s.key === k)?.label ?? k;
  const labelSource = (k: string) => (k === "unknown" ? "Not set" : sources.find((s) => s.key === k)?.label ?? k);

  const t = data?.totals;
  const tiles = useMemo(
    () => [
      { label: "Total Leads", value: t?.total, tone: "--primary", onClick: () => setStatus("") },
      { label: "New Leads", value: t?.new, tone: "--color-status-new", onClick: () => setStatus("new") },
      { label: "Contacted", value: t?.contacted, tone: "--color-status-contacted", onClick: () => setStatus("contacted") },
      { label: "Follow-up Required", value: t?.followUp, tone: "--destructive" },
      { label: "Proposal Sent", value: t?.proposal, tone: "--color-status-meeting", onClick: () => setStatus("proposal_sent") },
      { label: "Negotiation", value: t?.negotiation, tone: "--color-status-viewed", onClick: () => setStatus("negotiation") },
      { label: "Converted", value: t?.converted, tone: "--color-status-converted", onClick: () => setStatus("converted") },
      { label: "Lost", value: t?.lost, tone: "--muted-foreground", onClick: () => setStatus("lost") },
    ],
    [t],
  );

  const activeCount = [owner, source, status, service, priority].filter(Boolean).length + (preset !== "month" ? 1 : 0);
  const reset = () => {
    setPreset("month");
    setOwner("");
    setSource("");
    setStatus("");
    setService("");
    setPriority("");
  };
  const convRate = t && t.total ? Math.round((t.converted / t.total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 pb-safe sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to="/app/leads" className="grid size-9 place-items-center rounded-md border border-border bg-card hover:bg-muted" aria-label="Back to leads">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-[18px] font-bold leading-tight">Lead Dashboard</h1>
            <p className="text-[12px] text-muted-foreground">
              {range.from ? `${range.from} → ${range.to}` : "All time"} · Conversion {convRate}%
              {isFetching && " · updating…"}
            </p>
          </div>
        </div>
        {activeCount > 0 && (
          <button onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted">
            <RotateCcw className="size-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2 rounded-md border border-border bg-card p-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                preset === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
          <Popover open={customOpen} onOpenChange={(o) => { setCustomOpen(o); if (o) setDraft(custom); }}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold",
                  preset === "custom" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                )}
              >
                <CalendarRange className="size-3.5" />
                {preset === "custom" && custom.from ? `${custom.from} → ${custom.to || "…"}` : "Custom Date"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2">
              <label className="block text-[12px] font-semibold">From
                <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]" />
              </label>
              <label className="block text-[12px] font-semibold">To
                <input type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]" />
              </label>
              <button
                disabled={!draft.from}
                onClick={() => { setCustom({ from: draft.from, to: draft.to || draft.from }); setPreset("custom"); setCustomOpen(false); }}
                className="h-9 w-full rounded-md bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                Apply
              </button>
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <Sel label="Employee" value={owner} onChange={setOwner} options={(data?.owners ?? []).map((o) => ({ key: o.id, label: o.name }))} />
          <Sel label="Lead Source" value={source} onChange={setSource} options={sources.map((s) => ({ key: s.key, label: s.label }))} />
          <Sel label="Status" value={status} onChange={setStatus} options={statuses.map((s) => ({ key: s.key, label: s.label }))} />
          <Sel label="Service" value={service} onChange={setService} options={services.map((s) => ({ key: s.key, label: s.label }))} />
          <Sel label="Priority" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS.map((p) => ({ key: p.key, label: p.label }))} />
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {tiles.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={k.onClick}
            disabled={!k.onClick}
            className="animate-in fade-in rounded-md border border-border bg-card p-3 text-left shadow-[var(--shadow-hairline)] transition-colors enabled:hover:border-primary/40 sm:p-4"
            style={{ borderLeft: `3px solid var(${k.tone})` }}
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{k.label}</div>
            <div className="mt-1 font-mono text-[26px] font-semibold leading-none">
              {isLoading ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted" /> : (k.value ?? 0)}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Breakdown title="By Status" rows={(data?.byStatus ?? []).map((r) => ({ label: labelStatus(r.key), count: r.count }))} total={t?.total ?? 0} />
        <Breakdown title="By Lead Source" rows={(data?.bySource ?? []).map((r) => ({ label: labelSource(r.key), count: r.count }))} total={t?.total ?? 0} />
        <div className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 text-[14px] font-bold">By Employee</h2>
          {(data?.byOwner ?? []).length === 0 && <p className="text-[13px] text-muted-foreground">No leads</p>}
          <ul className="space-y-2">
            {(data?.byOwner ?? []).map((o) => (
              <li key={o.id}>
                <button onClick={() => setOwner(o.id)} className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left text-[13px] hover:bg-muted">
                  <span className="truncate font-medium">{o.name}</span>
                  <span className="shrink-0 font-mono text-[12px]">
                    <b>{o.total}</b> <span className="text-muted-foreground">· {o.converted} won</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { key: string; label: string }[] }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-10 w-full truncate rounded-md border bg-background px-2 text-[13px] font-medium", value ? "border-primary" : "border-border")}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: { label: string; count: number }[]; total: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h2 className="mb-3 text-[14px] font-bold">{title}</h2>
      {rows.length === 0 && <p className="text-[13px] text-muted-foreground">No leads</p>}
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex justify-between text-[13px]">
              <span className="truncate font-medium">{r.label}</span>
              <span className="font-mono font-semibold">{r.count}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
