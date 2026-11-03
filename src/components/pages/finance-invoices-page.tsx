import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listInvoices, type InvoiceRow, type InvoiceStatus } from "@/lib/finance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordCard } from "@/components/finance/responsive-record-list";
import { Plus, Search, FileText, Loader2 } from "lucide-react";
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
  const list = useServerFn(listInvoices);
  const q = useQuery({
    queryKey: ["finance", "invoices"],
    queryFn: () => list(),
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

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">Invoices</h1>
          <p className="text-[12.5px] text-muted-foreground">
            {q.data?.length ?? 0} invoice{(q.data?.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-brand-700">
          <Link to="/app/finance/invoices/new"><Plus className="mr-1.5 size-3.5" /> New invoice</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search BT-01, title, customer…"
            className="h-8 w-full rounded-sm pl-7 text-[12.5px] sm:w-72" />
        </div>
        <div className="-mx-1 inline-flex max-w-full items-center overflow-x-auto rounded-sm border border-border bg-card p-0.5">
          {(["all","sent","partially_paid","paid"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-[3px] px-2 py-1 text-[11px] font-medium capitalize",
                statusFilter === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}>
              {invoiceStatusLabel(s)}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-border bg-card md:block">
        <table className="w-full min-w-[800px] text-[12.5px]">
          <thead className="border-b border-border bg-muted/30 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                <Loader2 className="mx-auto size-4 animate-spin" />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-16 text-center text-muted-foreground">
                <FileText className="mx-auto mb-2 size-6 opacity-40" />
                No invoices yet. Click <span className="font-semibold text-foreground">New invoice</span> to create one.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-3 py-2 font-mono font-semibold text-brand">
                  <Link to="/app/finance/invoices/$slug" params={{ slug: r.slug }}>{r.slug}</Link>
                </td>
                <td className="px-3 py-2 font-medium text-foreground">
                  <Link to="/app/finance/invoices/$slug" params={{ slug: r.slug }}>{r.title}</Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.customer_name ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.total_amount, r.currency)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.paid_amount, r.currency)}</td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider", STATUS_STYLES[r.status])}>
                    {invoiceStatusLabel(r.status)}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="rounded-md border border-border bg-card md:hidden">
        {q.isLoading ? (
          <div className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="mx-auto size-4 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-16 text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 size-6 opacity-40" />
            No invoices yet.
          </div>
        ) : rows.map((r) => (
          <RecordCard
            key={`m-${r.id}`}
            title={<Link to="/app/finance/invoices/$slug" params={{ slug: r.slug }}>{r.title}</Link>}
            subtitle={r.customer_name ?? "—"}
            amount={fmt(r.total_amount, r.currency)}
            badge={
              <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", STATUS_STYLES[r.status])}>
                {invoiceStatusLabel(r.status)}
              </span>
            }
            fields={[
              { label: "Slug", value: <Link to="/app/finance/invoices/$slug" params={{ slug: r.slug }} className="font-mono font-semibold text-brand">{r.slug}</Link>, primary: true },
              { label: "Paid", value: fmt(r.paid_amount, r.currency) },
              { label: "Created", value: new Date(r.created_at).toLocaleDateString() },
            ]}
          />
        ))}
      </div>
    </div>
  );
}
