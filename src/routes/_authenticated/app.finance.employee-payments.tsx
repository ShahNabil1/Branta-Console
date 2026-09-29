import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  PAYMENT_TYPES, createEmployeePayment, findExistingCompensation, getEmployeePaymentContext, setEmployeePaymentStatus, updateEmployeePayment,
} from "@/lib/fund-ops.functions";
import { bdt, useFundOptions } from "@/components/finance/fund-move-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/app/finance/employee-payments")({
  head: () => ({
    meta: [
      { title: "Employee Payments · Branta Finance" },
      { name: "description", content: "Project, salary and bonus payments paid from the Employee Fund with commitments." },
      { property: "og:title", content: "Employee Payments · Branta Finance" },
      { property: "og:description", content: "Employee Fund payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeePaymentsPage,
});

const TYPE_LABEL: Record<string, string> = { project_payment: "Project Payment", salary: "Salary", bonus: "Bonus", incentive: "Incentive", commission: "Commission", overtime: "Overtime", adjustment: "Adjustment" };
const STATUS_CLS: Record<string, string> = { draft: "bg-muted text-muted-foreground", approved: "bg-sky-100 text-sky-800", committed: "bg-amber-100 text-amber-800", paid: "bg-emerald-100 text-emerald-800", cancelled: "bg-rose-100 text-rose-700" };
const sel = "h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]";
const empty = { employee_id: "", payment_type: "project_payment", amount: "", project_id: "", task_id: "", invoice_id: "", salary_slip_id: "", invoice_payout_id: "", description: "", payment_method: "", transaction_reference: "", notes: "" };

function EmployeePaymentsPage() {
  const qc = useQueryClient();
  const ctxFn = useServerFn(getEmployeePaymentContext);
  const q = useQuery({ queryKey: ["employee-payments"], queryFn: () => ctxFn() });
  const funds = useFundOptions();
  const empFund = funds.data?.find((f) => f.code === "employee");
  const [f, setF] = useState(empty);
  const findFn = useServerFn(findExistingCompensation);
  const existing = useQuery({
    queryKey: ["existing-comp", f.employee_id, f.invoice_id, f.project_id, f.amount, f.payment_type],
    queryFn: () => findFn({ data: { employeeId: f.employee_id, invoiceId: f.invoice_id || null, projectId: f.project_id || null, amount: Number(f.amount) || null, type: f.payment_type } }),
    enabled: !!f.employee_id,
  });
  const create = useServerFn(createEmployeePayment);
  const setStatus = useServerFn(setEmployeePaymentStatus);
  const updateFn = useServerFn(updateEmployeePayment);
  const [editing, setEditing] = useState<any | null>(null);
  const mUpdate = useMutation({
    mutationFn: (e: any) => updateFn({ data: {
      id: e.id, amount: Number(e.amount), project_id: e.project_id || null, task_id: e.task_id || null,
      description: e.description || null, payment_method: e.payment_method || null,
      transaction_reference: e.transaction_reference || null, notes: e.notes || null, reason: e.reason || null,
    } }),
    onSuccess: () => { toast.success("Payment updated"); setEditing(null); void qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mCreate = useMutation({
    mutationFn: (status: "draft" | "approved") => create({ data: {
      employee_id: f.employee_id, payment_type: f.payment_type as never, amount: Number(f.amount),
      project_id: f.project_id || null, task_id: f.task_id || null, invoice_id: f.invoice_id || null,
      salary_slip_id: f.payment_type === "salary" ? f.salary_slip_id || null : null,
      invoice_payout_id: f.invoice_payout_id || null,
      description: f.description || null, payment_method: f.payment_method || null,
      transaction_reference: f.transaction_reference || null, notes: f.notes || null, status,
    } }),
    onSuccess: () => { toast.success("Payment saved"); setF(empty); void qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mStatus = useMutation({
    mutationFn: (p: { id: string; status: "approved" | "committed" | "paid" | "cancelled"; reason?: string | null }) => setStatus({ data: p }),
    onSuccess: () => { toast.success("Updated"); void qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const d = q.data;
  const empName = useMemo(() => new Map<string, string>((d?.employees ?? []).map((e: any) => [e.user_id as string, String(e.full_name ?? e.employee_code ?? "")])), [d]);
  const projName = useMemo(() => new Map<string, string>((d?.projects ?? []).map((p: any) => [p.id as string, String(p.title ?? "")])), [d]);
  const pays = (d?.payments ?? []) as any[];
  const committed = pays.filter((p) => p.status === "committed").reduce((a, p) => a + Number(p.amount), 0);
  const paid = pays.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.amount), 0);
  const ex = existing.data;
  const selectedPayoutLinked = ex?.payouts.find((p: any) => p.id === f.invoice_payout_id)?.linked;
  const selectedSlipLinked = ex?.slips.find((s: any) => s.id === f.salary_slip_id)?.linked;
  const canSave = f.employee_id && Number(f.amount) > 0 && !selectedPayoutLinked && !selectedSlipLinked;

  if (q.isError) return <div className="p-10 text-center text-[13px] text-muted-foreground">{(q.error as Error).message}</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <h1 className="text-[20px] font-bold">Employee Payments</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["Ledger balance", empFund?.ledger_balance ?? 0], ["Committed", committed], ["Available", empFund?.available ?? 0], ["Total paid", paid]] as [string, number][]).map(([k, v]) => (
          <div key={k} className="rounded-md border border-border bg-card p-3"><div className="text-[11px] font-semibold uppercase text-muted-foreground">{k}</div><div className="mt-1 font-mono text-[16px] font-bold">{bdt(v)}</div></div>
        ))}
      </div>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-[14px] font-semibold">New Employee Fund payment</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <select className={sel} value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value, invoice_payout_id: "", salary_slip_id: "" })}>
            <option value="">— Employee —</option>
            {(d?.employees ?? []).map((e: any) => <option key={e.user_id} value={e.user_id}>{e.full_name} {e.employee_code ? `· ${e.employee_code}` : ""}</option>)}
          </select>
          <select className={sel} value={f.payment_type} onChange={(e) => setF({ ...f, payment_type: e.target.value })}>
            {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <Input className="h-9 font-mono" type="number" placeholder="Amount (BDT)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <select className={sel} value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value, task_id: "" })}>
            <option value="">— Project (optional) —</option>
            {(d?.projects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {f.project_id && (
            <select className={sel} value={f.task_id} onChange={(e) => setF({ ...f, task_id: e.target.value })}>
              <option value="">— Task (optional) —</option>
              {((d as any)?.tasks ?? []).filter((t: any) => t.project_id === f.project_id).map((t: any) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
          <select className={sel} value={f.invoice_id} onChange={(e) => setF({ ...f, invoice_id: e.target.value, invoice_payout_id: "" })}>
            <option value="">— Invoice (optional) —</option>
            {(d?.invoices ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.slug} · {i.title}</option>)}
          </select>
          <Input className="h-9" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <Input className="h-9" placeholder="Payment method" value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })} />
          <Input className="h-9" placeholder="Transaction reference" value={f.transaction_reference} onChange={(e) => setF({ ...f, transaction_reference: e.target.value })} />
          <Input className="h-9" placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>

        {f.employee_id && ex && (
          <div className="mt-3 space-y-2">
            {ex.payouts.length > 0 && (
              <div className="rounded-sm border border-amber-300 bg-amber-50 p-2.5 text-[12.5px]">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-900"><AlertTriangle className="size-3.5" /> Potential existing payout — link instead of paying twice</div>
                <select className={sel} value={f.invoice_payout_id} onChange={(e) => setF({ ...f, invoice_payout_id: e.target.value })}>
                  <option value="">— Do not link —</option>
                  {ex.payouts.map((p: any) => <option key={p.id} value={p.id} disabled={p.linked}>{p.role} · {p.currency} {Number(p.amount).toLocaleString()} · {p.status}{p.linked ? " · already linked" : ""}</option>)}
                </select>
              </div>
            )}
            {f.payment_type === "salary" && (
              <div className="rounded-sm border border-border bg-muted/40 p-2.5 text-[12.5px]">
                <div className="mb-1 font-semibold">Link existing salary slip</div>
                <select className={sel} value={f.salary_slip_id} onChange={(e) => setF({ ...f, salary_slip_id: e.target.value })}>
                  <option value="">— No salary slip —</option>
                  {ex.slips.map((s: any) => <option key={s.id} value={s.id} disabled={s.linked}>{s.slip_no} · {s.period_month} · ৳{Number(s.net_amount).toLocaleString()}{s.linked ? " · already linked" : ""}</option>)}
                </select>
              </div>
            )}
            {ex.suspicious.length > 0 && (
              <div className="rounded-sm border border-rose-300 bg-rose-50 p-2.5 text-[12.5px] text-rose-800">
                <b>Potential Duplicate Payment:</b> {ex.suspicious.length} similar {TYPE_LABEL[f.payment_type]} already exists for this employee ({ex.suspicious.map((s: any) => `${bdt(s.amount)} · ${s.status}`).join(", ")}).
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" disabled={!canSave || mCreate.isPending} onClick={() => mCreate.mutate("draft")}>Save draft</Button>
          <Button disabled={!canSave || mCreate.isPending} onClick={() => mCreate.mutate("approved")}>Save &amp; approve</Button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-[14px] font-semibold">Payments</h2>
        <div className="divide-y divide-border text-[12.5px]">
          {pays.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <div className="font-semibold">{empName.get(p.employee_id) ?? "—"} · {TYPE_LABEL[p.payment_type]} · <span className="font-mono">{bdt(p.amount)}</span></div>
                <div className="text-muted-foreground">
                  {p.project_id ? projName.get(p.project_id) : "No project"}{p.description ? ` · ${p.description}` : ""}
                  {p.invoice_payout_id ? " · linked payout" : ""}{p.salary_slip_id ? " · linked salary slip" : ""}
                  {p.cancel_reason ? ` · cancelled: ${p.cancel_reason}` : ""}
                </div>
              </div>
              {editing?.id === p.id && (
                <div className="grid w-full gap-2 rounded-sm border border-border bg-muted/40 p-2.5 sm:grid-cols-3">
                  <Input className="h-8 font-mono" type="number" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
                  <select className={sel} value={editing.project_id ?? ""} onChange={(e) => setEditing({ ...editing, project_id: e.target.value, task_id: "" })}>
                    <option value="">— Project —</option>
                    {(d?.projects ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.title}</option>)}
                  </select>
                  <select className={sel} value={editing.task_id ?? ""} onChange={(e) => setEditing({ ...editing, task_id: e.target.value })}>
                    <option value="">— Task —</option>
                    {((d as any)?.tasks ?? []).filter((t: any) => t.project_id === editing.project_id).map((t: any) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <Input className="h-8" placeholder="Description" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  <Input className="h-8" placeholder="Payment method" value={editing.payment_method ?? ""} onChange={(e) => setEditing({ ...editing, payment_method: e.target.value })} />
                  <Input className="h-8" placeholder="Reference" value={editing.transaction_reference ?? ""} onChange={(e) => setEditing({ ...editing, transaction_reference: e.target.value })} />
                  {p.status === "approved" && <Input className="h-8 sm:col-span-2" placeholder="Reason for editing an approved payment (required)" value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />}
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8" disabled={mUpdate.isPending || !(Number(editing.amount) > 0) || (p.status === "approved" && editing.reason.trim().length < 5)} onClick={() => mUpdate.mutate(editing)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Close</Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_CLS[p.status]}`}>{p.status}</span>
                {(p.status === "draft" || p.status === "approved") && <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing({ ...p, reason: "" })}>Edit</Button>}
                {p.status === "draft" && <Button size="sm" variant="ghost" className="h-7" onClick={() => mStatus.mutate({ id: p.id, status: "approved" })}>Approve</Button>}
                {(p.status === "draft" || p.status === "approved") && <Button size="sm" variant="ghost" className="h-7" onClick={() => mStatus.mutate({ id: p.id, status: "committed" })}>Commit</Button>}
                {(p.status === "approved" || p.status === "committed") && <Button size="sm" className="h-7" onClick={() => mStatus.mutate({ id: p.id, status: "paid" })}>Mark paid</Button>}
                {["draft", "approved", "committed"].includes(p.status) && (
                  <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => {
                    const r = window.prompt("Cancellation reason (min 5 chars)");
                    if (r && r.length >= 5) mStatus.mutate({ id: p.id, status: "cancelled", reason: r });
                  }}>Cancel</Button>
                )}
              </div>
            </div>
          ))}
          {!pays.length && <div className="px-4 py-4 text-muted-foreground">No employee fund payments yet.</div>}
        </div>
      </section>
    </div>
  );
}
