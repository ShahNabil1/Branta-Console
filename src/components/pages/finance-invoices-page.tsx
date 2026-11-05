import { useActiveCompany } from "@/components/company/company-switcher";
import { useCompanyPath } from "@/components/company/use-company-path";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listInvoices, type InvoiceRow, type InvoiceStatus } from "@/lib/finance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/branta/page-hero";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, FileText, Wallet, CheckCircle2, Clock, Calendar, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { invoiceStatusLabel } from "@/components/finance/qty-price-fields";


const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-sky-50 text-sky-700 border-sky-200",
  partially_paid: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overdue: "bg-rose-50 text-rose-700 border-rose-200",
  void: "bg-neutral-100 text-neutral-500 border-neutral-200 line-through",
};

function fmt(n: number, cur: string) {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  return sym + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoicesPage() {
  const company = useActiveCompany().active;
  const workspace = company?.slug ?? null;
  const list = useServerFn(listInvoices);
  const q = useQuery({
    queryKey: ["finance", "invoices", workspace],
    queryFn: () => list({ data: { workspace } }),
    staleTime: 15_000,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  

  useEffect(() => {
    const ch = supabase.channel("finance:invoices")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => void q.refetch())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [q]);

  const rows = useMemo(() => {
    const n = search.trim().toLowerCase();
    return (q.data ?? []).filter((r: InvoiceRow) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!n) return true;
      return (
        r.slug?.toLowerCase().includes(n) ||
        r.title.toLowerCase().includes(n) ||
        r.customer_name?.toLowerCase().includes(n)
      );
    });
  }, [q.data, search, statusFilter]);

  const stats = useMemo(() => {
    const all = (q.data ?? []).filter((r: InvoiceRow) => r.status !== "void");
    const cur = all.some((r) => r.currency === "BDT") || !all.length ? "BDT" : all[0].currency;
    const same = all.filter((r) => r.currency === cur);
    const billed = same.reduce((a, r) => a + Number(r.total_amount), 0);
    const paid = same.reduce((a, r) => a + Number(r.paid_amount), 0);
    return { cur, billed, paid, due: Math.max(billed - paid, 0), open: all.filter((r) => r.status !== "paid").length };
  }, [q.data]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <PageHero
        icon={FileText}
        eyebrow={company?.name ?? "Finance"}
        title="Invoices"
        subtitle={`${q.data?.length ?? 0} invoice${(q.data?.length ?? 0) === 1 ? "" : "s"} · only ${company?.name ?? "this company"}'s records`}
        actions={
          <Button asChild className="gap-1.5 shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-95">
            <Link to={cp("/app/finance/invoices/new") as "/app/finance/invoices/new"}><Plus className="size-4" /> New invoice</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          { l: "Billed", v: fmt(stats.billed, stats.cur), I: Wallet, tone: "text-sky-600 bg-sky-50 ring-sky-200" },
          { l: "Collected", v: fmt(stats.paid, stats.cur), I: CheckCircle2, tone: "text-emerald-600 bg-emerald-50 ring-emerald-200" },
          { l: "Outstanding", v: fmt(stats.due, stats.cur), I: Clock, tone: "text-amber-600 bg-amber-50 ring-amber-200" },
          { l: "Open invoices", v: String(stats.open), I: FileText, tone: "text-brand bg-brand/10 ring-brand/20" },
        ] as const).map((k, i) => (
          <div key={k.l} style={{ animationDelay: `${i * 40}ms` }} className="group rounded-lg border border-border bg-card p-4 shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-bottom-1 fill-mode-both hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{k.l}</span>
              <span className={cn("grid size-7 place-items-center rounded-md ring-1 ring-inset transition-transform group-hover:scale-110", k.tone)}><k.I className="size-3.5" /></span>
            </div>
            <div className="mt-2 truncate font-mono text-[18px] font-bold">{q.isLoading ? "—" : k.v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, title, customer…"
            className="h-9 w-full rounded-md pl-8 text-[12.5px] sm:w-80" />
        </div>
        <div className="inline-flex max-w-full items-center overflow-x-auto rounded-md border border-border bg-card p-0.5">
          {(["all","sent","partially_paid","paid","overdue"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors",
                statusFilter === s ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}>
              {s === "all" ? "All" : invoiceStatusLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-brand/10 text-brand"><FileText className="size-6" /></span>
          <div className="mt-3 text-[14px] font-bold">{(q.data?.length ?? 0) ? "No invoice matches these filters" : "No invoices yet"}</div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Create the first invoice for one of {company?.name ?? "this company"}'s customers.</p>
          <Button asChild className="mt-4 gap-1.5"><Link to={cp("/app/finance/invoices/new") as "/app/finance/invoices/new"}><Plus className="size-4" /> New invoice</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, i) => <InvoiceCard key={r.id} r={r} index={i} />)}
        </div>
      )}
    </div>
  );
}

const ACCENT: Record<InvoiceStatus, string> = {
  draft: "bg-slate-400", sent: "bg-sky-500", partially_paid: "bg-amber-500",
  paid: "bg-emerald-500", overdue: "bg-rose-500", void: "bg-neutral-300",
};

function InvoiceCard({ r, index }: { r: InvoiceRow; index: number }) {
  const total = Number(r.total_amount) || 0;
  const paid = Number(r.paid_amount) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const initials = (r.customer_name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <Link
      to="/app/finance/invoices/$slug" params={{ slug: r.slug }}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card p-5 shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 fill-mode-both hover:-translate-y-1 hover:border-transparent hover:shadow-xl active:scale-[0.99]"
    >
      <span className={cn("absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100", ACCENT[r.status])} />
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11.5px] font-bold text-foreground">{r.slug}</span>
        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", STATUS_STYLES[r.status])}>
          {invoiceStatusLabel(r.status)}
        </span>
      </div>
      <div className="mt-3 line-clamp-2 min-h-[2.5rem] text-[14.5px] font-bold leading-snug">{r.title}</div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] font-bold text-brand transition-transform duration-300 group-hover:scale-110">{initials || "?"}</span>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold">{r.customer_name ?? "—"}</div>
          <div className="truncate font-mono text-[10.5px] text-muted-foreground">{r.customer_code ?? ""}{r.project_type === "monthly_retainer" ? " · Monthly retainer" : " · One-time"}</div>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="font-mono text-[17px] font-bold">{fmt(total, r.currency)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Due</div>
          <div className={cn("font-mono text-[13px] font-bold", total - paid > 0.009 ? "text-amber-600" : "text-emerald-600")}>{fmt(Math.max(total - paid, 0), r.currency)}</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all duration-700", ACCENT[r.status])} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10.5px] font-semibold text-muted-foreground">
          <span>{pct}% collected</span>
          <span className="flex items-center gap-1"><Calendar className="size-3" />{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      </div>
      <ArrowUpRight className="absolute bottom-4 right-4 size-4 text-muted-foreground opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
    </Link>
  );
}
