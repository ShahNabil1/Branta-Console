import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { getFundDashboard, retryAllocation } from "@/lib/fund-ledger.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/finance/funds/")({
  head: () => ({
    meta: [
      { title: "Fund Ledger · Branta Finance" },
      { name: "description", content: "Automatic fund allocation of received client payments with derived fund balances." },
      { property: "og:title", content: "Fund Ledger · Branta Finance" },
      { property: "og:description", content: "Automatic fund allocation of received client payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundLedgerPage,
});

export const bdt = (n: number) => "৳ " + (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function FundLedgerPage() {
  const fetchDash = useServerFn(getFundDashboard);
  const retry = useServerFn(retryAllocation);
  const q = useQuery({ queryKey: ["fund-dashboard"], queryFn: () => fetchDash(), staleTime: 15_000 });
  const retryM = useMutation({
    mutationFn: (id: string) => retry({ data: { installmentId: id } }),
    onSuccess: () => { toast.success("Allocated"); void q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return <div className="mx-auto max-w-7xl p-6"><div className="h-64 animate-pulse rounded-md bg-muted" /></div>;
  if (q.isError) return <div className="p-6 text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!;
  if (!d.allowed) return <div className="p-10 text-center text-[13px] text-muted-foreground">Finance access required.</div>;
  const o = d.overview;

  const tiles: [string, number][] = [
    ["Total invoiced", o.invoiced], ["Total collected", o.collected], ["Outstanding", o.outstanding],
    ["Direct deductions", o.deductions], ["Distributable income", o.distributable], ["Total allocated", o.allocated],
    ["Fund spending", o.spent], ["Total fund balance", o.balance], ["Available across funds", o.available],
    ["Profit fund balance", o.profit],
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-foreground">Branta Fund Ledger</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Accounting allocation of real cash received — funds are not separate bank accounts.
            {d.version && <> Active version: <b className="text-foreground">{d.version.name}</b> (from {d.version.effective_from}).</>}
          </p>
        </div>
        <Button asChild variant="outline" className="h-9 rounded-sm"><Link to="/app/my-company">Fund settings</Link></Button>
      </div>

      {d.failures.length > 0 && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-amber-900">
            <AlertTriangle className="size-4" /> Unallocated paid installments: {d.failures.length}
          </div>
          <div className="space-y-2">
            {d.failures.map((f: any) => (
              <div key={f.installment_id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-amber-200 bg-card px-3 py-2 text-[12.5px]">
                <div className="min-w-0">
                  <div className="font-semibold">{f.client ?? "—"} · {f.invoice_title ?? f.invoice_slug} · {f.label}</div>
                  <div className="truncate text-muted-foreground">{bdt(f.amount)} · {f.error}</div>
                </div>
                <div className="flex gap-2">
                  {f.invoice_slug && <Button asChild size="sm" variant="ghost" className="h-7"><Link to="/app/finance/invoices/$slug" params={{ slug: f.invoice_slug }}>Open invoice</Link></Button>}
                  <Button size="sm" className="h-7" disabled={retryM.isPending} onClick={() => retryM.mutate(f.installment_id)}>
                    {retryM.isPending ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="mr-1 size-3" />} Retry
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([l, v]) => (
          <div key={l} className="rounded-md border border-border bg-card p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</div>
            <div className="mt-1 font-mono text-[16px] font-bold">{bdt(v)}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-[14px] font-semibold">Funds</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.funds.map((f) => (
            <div key={f.fund_id} className={cn("rounded-md border border-border bg-card p-4", !f.is_active && "opacity-60")}>
              <div className="flex items-center justify-between">
                <Link to="/app/finance/funds/$code" params={{ code: f.code }} className="text-[14px] font-bold hover:text-primary hover:underline">{f.name}</Link>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px]">{f.percent}%</span>
              </div>
              <div className="mt-2 font-mono text-[20px] font-bold">{bdt(f.ledger_balance)}</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                {([["Allocated", f.allocation_total], ["Spent", f.spent_total], ["Committed", f.committed], ["Borrowed", f.borrowed], ["Lent", f.lent], ["Available", f.available]] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-mono">{bdt(v)}</dd></div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
