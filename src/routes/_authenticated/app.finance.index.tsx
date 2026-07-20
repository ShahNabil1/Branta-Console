import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getFinanceReport, type Currency } from "@/lib/finance.functions";
import { KpiTile } from "@/components/branta/kpi-tile";
import { Button } from "@/components/ui/button";
import { FileText, Download, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/finance/")({
  head: () => ({ meta: [{ title: "Finance Dashboard · Branta" }] }),
  component: FinanceDashboard,
});

const PRESETS = [
  { key: "mtd", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "ytd", label: "Year to date" },
  { key: "all", label: "All time" },
] as const;

function rangeFor(preset: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "mtd")
    return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (preset === "last")
    return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (preset === "ytd")
    return { from: iso(new Date(y, 0, 1)), to: iso(now) };
  return { from: "2000-01-01", to: iso(new Date(y + 5, 0, 1)) };
}

function fmt(n: number, cur: Currency) {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  return sym + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FinanceDashboard() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["key"]>("mtd");
  const [currency, setCurrency] = useState<Currency>("BDT");
  const range = useMemo(() => rangeFor(preset), [preset]);

  const fetchReport = useServerFn(getFinanceReport);
  const q = useQuery({
    queryKey: ["finance-report", range.from, range.to, currency],
    queryFn: () => fetchReport({ data: { from: range.from, to: range.to, currency } }),
    staleTime: 30_000,
  });

  const r = q.data;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">Finance Dashboard</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Income, expense and outstanding across the whole company.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-sm border border-border bg-card p-0.5">
            {(["BDT", "USD"] as Currency[]).map((c) => (
              <button key={c}
                onClick={() => setCurrency(c)}
                className={`rounded-[3px] px-2.5 py-1 text-[11.5px] font-semibold ${currency === c ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center rounded-sm border border-border bg-card p-0.5">
            {PRESETS.map((p) => (
              <button key={p.key}
                onClick={() => setPreset(p.key)}
                className={`rounded-[3px] px-2.5 py-1 text-[11.5px] font-medium ${preset === p.key ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled className="h-8 rounded-sm text-[12px]">
            <Download className="mr-1.5 size-3.5" /> PDF report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Income" value={fmt(r?.income ?? 0, currency)} delta="paid" positive={true} />
        <KpiTile label="Expense" value={fmt(r?.expense ?? 0, currency)} delta="spent" positive={false} />
        <KpiTile label="Net profit" value={fmt(r?.profit ?? 0, currency)} delta={(r?.profit ?? 0) >= 0 ? "positive" : "loss"} positive={(r?.profit ?? 0) >= 0} />
        <KpiTile label="Outstanding" value={fmt(r?.outstanding ?? 0, currency)} delta="unpaid" positive={null} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-foreground">Expense by category</h2>
            <span className="text-[11px] text-muted-foreground">{currency}</span>
          </div>
          <div className="mt-3 space-y-2">
            {Object.entries(r?.expenses_by_category ?? {}).length === 0 ? (
              <div className="rounded-sm border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-[12px] text-muted-foreground">
                No expenses in the selected range.
              </div>
            ) : (
              Object.entries(r?.expenses_by_category ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amt]) => {
                  const pct = r && r.expense > 0 ? (amt / r.expense) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="capitalize text-foreground">{cat}</span>
                        <span className="font-mono text-muted-foreground">{fmt(amt, currency)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Link to="/app/finance/invoices" className="block rounded-md border border-border bg-card p-4 hover:bg-muted">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
              <FileText className="size-4 text-brand" /> Invoices
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">Create, track and get paid.</p>
          </Link>
          <Link to="/app/finance/wallet" className="block rounded-md border border-border bg-card p-4 hover:bg-muted">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
              <TrendingUp className="size-4 text-emerald-600" /> My Wallet
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">See locked, available and paid.</p>
          </Link>
          <Link to="/app/finance/expenses" className="block rounded-md border border-border bg-card p-4 hover:bg-muted">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
              <TrendingDown className="size-4 text-rose-600" /> Expenses
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">Track company outflow.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
