import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getInvoiceAllocations, retryAllocation, reverseAllocation, getAllocationBaseReport, correctAllocationBase,
  getAllocationEmployeePool, assignAllocationEmployeePayouts, getInvoiceEmployeePlan,
} from "@/lib/fund-ledger.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const bdt = (n: number) => "৳ " + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Finance Allocation section for invoice detail. Renders nothing for non-finance users. */
export function InvoiceFundAllocation({ invoiceId }: { invoiceId: string }) {
  const fetchA = useServerFn(getInvoiceAllocations);
  const fetchR = useServerFn(getAllocationBaseReport);
  const retry = useServerFn(retryAllocation);
  const reverse = useServerFn(reverseAllocation);
  const correct = useServerFn(correctAllocationBase);
  const q = useQuery({ queryKey: ["invoice-allocations", invoiceId], queryFn: () => fetchA({ data: { invoiceId } }) });
  const rq = useQuery({ queryKey: ["allocation-base-report"], queryFn: () => fetchR() });
  const refresh = () => { void q.refetch(); void rq.refetch(); };
  const mRetry = useMutation({ mutationFn: (id: string) => retry({ data: { installmentId: id } }), onSuccess: refresh, onError: (e) => toast.error((e as Error).message) });
  const mRev = useMutation({ mutationFn: (p: { allocationId: string; reason: string }) => reverse({ data: p }), onSuccess: () => { toast.success("Reversed"); refresh(); }, onError: (e) => toast.error((e as Error).message) });
  const mFix = useMutation({ mutationFn: (p: { allocationId: string; reason: string }) => correct({ data: p }), onSuccess: () => { toast.success("Allocation corrected"); refresh(); }, onError: (e) => toast.error((e as Error).message) });

  if (!q.data?.allowed) return null;
  const rows = q.data.rows as any[];
  const wrong = new Map(((rq.data?.rows ?? []) as any[]).map((r) => [r.allocation_id, r]));

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-[14px] font-semibold">Finance Allocation</h3>
        <p className="text-[12px] text-muted-foreground">Payment received − project cost share − other deductions = fund distributable, split across the 9 funds.</p>
      </header>
      {rows.length === 0 && <div className="px-4 py-4 text-[12.5px] text-muted-foreground">No paid installments yet.</div>}
      <div className="divide-y divide-border">
        {rows.map((r) => {
          const a = r.active;
          const label = r.installment.label ?? `Installment ${r.installment.sequence}`;
          const deds = (a?.installment_allocation_deductions ?? []) as any[];
          const pc = deds.filter((d) => d.amount_type === "project_cost");
          const other = deds.filter((d) => d.amount_type !== "project_cost");
          const bad = a ? wrong.get(a.id) : null;
          return (
            <div key={r.installment.id} className="space-y-2 px-4 py-3 text-[12.5px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
              {bad && (
                <div className="space-y-1 rounded-sm border border-amber-300 bg-amber-50 p-2.5 text-[12px]">
                  <b>Wrong base — project cost was not deducted.</b>
                  <Row k="Current fund distributable" v={bdt(bad.current)} />
                  <Row k="Project cost share" v={`− ${bdt(bad.project_cost)}`} />
                  <Row k="Correct fund distributable" v={bdt(bad.correct)} strong />
                  <Row k="Over-allocated" v={bdt(bad.difference)} />
                  <p className="text-[11px] text-muted-foreground">Correction reverses this allocation (kept in history) and creates a new one. Nothing is edited or deleted.</p>
                  <Button size="sm" className="h-7" disabled={mFix.isPending} onClick={() => {
                    const reason = window.prompt(`Reverse ${bdt(bad.current)} and re-allocate ${bdt(bad.correct)}. Reason (min 5 chars):`);
                    if (reason && reason.length >= 5) mFix.mutate({ allocationId: a.id, reason });
                  }}>Preview confirmed — correct allocation</Button>
                </div>
              )}
              {a && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 rounded-sm bg-muted/40 p-2.5">
                    <Row k="Payment received" v={bdt(a.received_amount)} />
                    <Row k="Project cost share" v={`− ${bdt(pc.reduce((s, d) => s + Number(d.amount), 0))}`} />
                    {other.map((d, i) => (
                      <Row key={i} k={`− ${d.name}${d.amount_type === "percent" ? ` (${d.value}%)` : ""}`} v={bdt(d.amount)} />
                    ))}
                    <Row k="Fund distributable" v={bdt(a.distributable_amount)} strong />
                    <Row k="Allocation version" v={a.fund_allocation_versions?.name ?? "—"} />
                  </div>
                  <div className="space-y-1 rounded-sm bg-muted/40 p-2.5">
                    {a.installment_allocation_items.map((it: any, i: number) => (
                      <Row key={i} k={`${it.fund_name} · ${Number(it.percent)}%`} v={bdt(it.amount)} />
                    ))}
                  </div>
                </div>
              )}
              {a && !bad && <EmployeePayouts allocationId={a.id} invoiceId={invoiceId} />}
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

function EmployeePayouts({ allocationId, invoiceId }: { allocationId: string; invoiceId: string }) {
  const get = useServerFn(getAllocationEmployeePool);
  const getPlan = useServerFn(getInvoiceEmployeePlan);
  const planQ = useQuery({ queryKey: ["invoice-employee-plan", invoiceId], queryFn: () => getPlan({ data: { invoiceId } }) });
  const plan = (planQ.data?.rows ?? []) as Array<{ employee_id: string; planned_amount: number }>;
  const assign = useServerFn(assignAllocationEmployeePayouts);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"fixed" | "percent">("fixed");
  const [lines, setLines] = useState<{ employee_id: string; value: string }[]>([{ employee_id: "", value: "" }]);
  const q = useQuery({ queryKey: ["alloc-pool", allocationId], queryFn: () => get({ data: { allocationId } }), enabled: open });
  const m = useMutation({
    mutationFn: () => assign({ data: { allocationId, mode, rows: lines.filter((l) => l.employee_id && Number(l.value) > 0).map((l) => ({ employee_id: l.employee_id, value: Number(l.value) })) } }),
    onSuccess: () => { toast.success("Draft employee payments created — approve and pay them in Employee Payments"); setLines([{ employee_id: "", value: "" }]); void q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!open) return <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>Employee payouts from Employee Fund</Button>;
  const d = q.data;
  const pool = d?.pool ?? 0;
  // Planned split → % of the invoice's expected Employee Fund, applied to this installment's actual share.
  const expected = Number((planQ.data as { expectedPool?: number } | undefined)?.expectedPool ?? 0);
  const applyPlan = () => {
    if (!expected || !plan.length) return;
    setMode("percent");
    setLines(plan.map((p) => ({ employee_id: p.employee_id, value: String(Math.round((p.planned_amount / expected) * 10000) / 100) })));
  };
  const req = lines.reduce((s, l) => s + (mode === "fixed" ? Number(l.value) || 0 : pool * (Number(l.value) || 0) / 100), 0);
  return (
    <div className="space-y-2 rounded-sm border border-border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Employee payout allocation</span>
        {plan.length > 0 && <Button size="sm" variant="outline" className="h-7" onClick={applyPlan}>Use invoice plan</Button>}
      </div>
      {d && (
        <div className="space-y-1">
          <Row k="Employee Fund allocated" v={bdt(d.pool)} />
          <Row k="Already assigned" v={bdt(d.assigned)} />
          <Row k="Remaining assignable" v={bdt(d.remaining)} strong />
          {d.payments.map((p: any) => <Row key={p.id} k={`${p.name} · ${p.status}`} v={bdt(p.amount)} />)}
        </div>
      )}
      <div className="flex gap-2 text-[12px]">
        <label className="flex items-center gap-1"><input type="radio" checked={mode === "fixed"} onChange={() => setMode("fixed")} /> Fixed amount</label>
        <label className="flex items-center gap-1"><input type="radio" checked={mode === "percent"} onChange={() => setMode("percent")} /> % of Employee Fund</label>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2">
          <select value={l.employee_id} onChange={(e) => setLines(lines.map((x, k) => k === i ? { ...x, employee_id: e.target.value } : x))} className="h-8 flex-1 rounded-sm border border-input bg-background px-2 text-[12px]">
            <option value="">— Employee —</option>
            {(d?.employees ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <Input type="number" value={l.value} placeholder={mode === "fixed" ? "৳" : "%"} onChange={(e) => setLines(lines.map((x, k) => k === i ? { ...x, value: e.target.value } : x))} className="h-8 w-28 font-mono text-[12px]" />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-7" onClick={() => setLines([...lines, { employee_id: "", value: "" }])}>Add employee</Button>
        <span className={`font-mono text-[11.5px] ${d && req > d.remaining + 0.005 ? "text-destructive" : "text-muted-foreground"}`}>Requested {bdt(req)}</span>
        <Button size="sm" className="h-7" disabled={m.isPending || !d || req <= 0 || req > d.remaining + 0.005} onClick={() => m.mutate()}>Create draft payments</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Limited to this allocation's Employee Fund share. To pay more from the accumulated Employee Fund balance, create a separate payment in Finance → Employee Payments.</p>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-bold" : ""}`}><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>;
}
