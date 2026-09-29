import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getInvoiceAllocations, retryAllocation, reverseAllocation } from "@/lib/fund-ledger.functions";
import { Button } from "@/components/ui/button";

const bdt = (n: number) => "৳ " + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Finance Allocation section for invoice detail. Renders nothing for non-finance users. */
export function InvoiceFundAllocation({ invoiceId }: { invoiceId: string }) {
  const fetchA = useServerFn(getInvoiceAllocations);
  const retry = useServerFn(retryAllocation);
  const reverse = useServerFn(reverseAllocation);
  const q = useQuery({ queryKey: ["invoice-allocations", invoiceId], queryFn: () => fetchA({ data: { invoiceId } }) });
  const mRetry = useMutation({ mutationFn: (id: string) => retry({ data: { installmentId: id } }), onSuccess: () => void q.refetch(), onError: (e) => toast.error((e as Error).message) });
  const mRev = useMutation({ mutationFn: (p: { allocationId: string; reason: string }) => reverse({ data: p }), onSuccess: () => { toast.success("Reversed"); void q.refetch(); }, onError: (e) => toast.error((e as Error).message) });

  if (!q.data?.allowed) return null;
  const rows = q.data.rows as any[];

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-[14px] font-semibold">Finance Allocation</h3>
        <p className="text-[12px] text-muted-foreground">Fund distribution of each paid installment (immutable snapshot).</p>
      </header>
      {rows.length === 0 && <div className="px-4 py-4 text-[12.5px] text-muted-foreground">No paid installments yet.</div>}
      <div className="divide-y divide-border">
        {rows.map((r) => {
          const a = r.active;
          const label = r.installment.label ?? `Installment ${r.installment.sequence}`;
          return (
            <div key={r.installment.id} className="space-y-2 px-4 py-3 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{label}</span>
                {!a && (
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{r.error ? "Allocation required" : "Legacy / Not allocated"}</span>
                    <Button size="sm" className="h-7" disabled={mRetry.isPending} onClick={() => mRetry.mutate(r.installment.id)}>Allocate</Button>
                  </div>
                )}
                {a && (
                  <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => {
                    const reason = window.prompt("Reversal reason (min 5 chars)");
                    if (reason && reason.length >= 5) mRev.mutate({ allocationId: a.id, reason });
                  }}>Reverse</Button>
                )}
              </div>
              {r.error && !a && <div className="text-[11.5px] text-destructive">{r.error}</div>}
              {a && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 rounded-sm bg-muted/40 p-2.5">
                    <Row k="Payment received" v={bdt(a.received_amount)} />
                    {a.installment_allocation_deductions.map((d: any, i: number) => (
                      <Row key={i} k={`− ${d.name}${d.amount_type === "percent" ? ` (${d.value}%)` : ""}`} v={bdt(d.amount)} />
                    ))}
                    <Row k="Distributable" v={bdt(a.distributable_amount)} strong />
                    <Row k="Version" v={a.fund_allocation_versions?.name ?? "—"} />
                  </div>
                  <div className="space-y-1 rounded-sm bg-muted/40 p-2.5">
                    {a.installment_allocation_items.map((it: any, i: number) => (
                      <Row key={i} k={`${it.fund_name} · ${Number(it.percent)}%`} v={bdt(it.amount)} />
                    ))}
                  </div>
                </div>
              )}
              {r.history.length > 0 && (
                <div className="text-[11.5px] text-muted-foreground">
                  {r.history.map((h: any) => <div key={h.id}>Reversed allocation {bdt(h.distributable_amount)} — {h.reversal_reason}</div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-bold" : ""}`}><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>;
}
