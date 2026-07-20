import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  createInvoice,
  listEmployeesForFinance,
  type Currency,
  type StakeholderRole,
} from "@/lib/finance.functions";
import { listCustomers } from "@/lib/customers.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Installment = { label: string; amount: number; due_date: string };
type Stakeholder = { user_id: string; role: StakeholderRole; percent: number; note?: string };

export function NewInvoiceModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  const create = useServerFn(createInvoice);
  const listCust = useServerFn(listCustomers);
  const listEmp = useServerFn(listEmployeesForFinance);

  const custs = useQuery({ queryKey: ["customers"], queryFn: () => listCust(), enabled: open, staleTime: 30_000 });
  const emps = useQuery({ queryKey: ["finance-employees"], queryFn: () => listEmp(), enabled: open, staleTime: 30_000 });

  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState<"one_time" | "monthly_retainer">("one_time");
  const [currency, setCurrency] = useState<Currency>("BDT");
  const [total, setTotal] = useState<string>("0");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [installments, setInstallments] = useState<Installment[]>([
    { label: "Advance", amount: 0, due_date: new Date().toISOString().slice(0, 10) },
  ]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([
    { user_id: "", role: "company", percent: 100 },
  ]);

  useEffect(() => {
    if (!open) return;
    setCustomerId(""); setTitle(""); setDescription(""); setProjectType("one_time");
    setCurrency("BDT"); setTotal("0"); setStartsOn(""); setEndsOn(""); setNotes("");
    setInstallments([{ label: "Advance", amount: 0, due_date: new Date().toISOString().slice(0, 10) }]);
    setStakeholders([{ user_id: "", role: "company", percent: 100 }]);
  }, [open]);

  const totalNum = Number(total) || 0;
  const instSum = useMemo(() => installments.reduce((a, i) => a + Number(i.amount || 0), 0), [installments]);
  const pctSum = useMemo(() => stakeholders.reduce((a, s) => a + Number(s.percent || 0), 0), [stakeholders]);

  const submit = useMutation({
    mutationFn: async () => {
      const inv = await create({ data: {
        customer_id: customerId,
        title: title.trim(),
        description: description.trim() || null,
        project_type: projectType,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        currency,
        total_amount: totalNum,
        notes: notes.trim() || null,
        installments: installments.map((i) => ({
          label: i.label.trim(),
          amount: Number(i.amount),
          due_date: i.due_date,
        })),
        stakeholders: stakeholders.map((s) => ({
          user_id: s.user_id,
          role: s.role,
          percent: Number(s.percent),
        })),
      }});
      return inv;
    },
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv.slug} created`);
      onOpenChange(false);
      onCreated?.();
      navigate({ to: "/app/finance/invoices/$slug", params: { slug: inv.slug } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canSubmit =
    !!customerId && !!title.trim() && totalNum > 0 &&
    Math.abs(instSum - totalNum) < 0.01 && Math.abs(pctSum - 100) < 0.01 &&
    installments.every((i) => i.label && i.due_date && i.amount > 0) &&
    stakeholders.every((s) => s.user_id && s.percent > 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-md border border-border bg-card shadow-xl flex flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-[14px] font-semibold">New Invoice</h2>
            <p className="text-[11.5px] text-muted-foreground">Slug is auto-generated (BT-01, BT-02, …)</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-sm p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Basics */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer *</Label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                <option value="">— Choose customer —</option>
                {custs.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.customer_code} · {c.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-9 rounded-sm" placeholder="e.g. Website redesign project" />
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project type</Label>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value as "one_time" | "monthly_retainer")}
                className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                <option value="one_time">One-time</option>
                <option value="monthly_retainer">Monthly retainer</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Currency</Label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
                className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                <option value="BDT">BDT (৳)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total amount *</Label>
              <Input type="number" value={total} onChange={(e) => setTotal(e.target.value)} className="mt-1 h-9 rounded-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Starts</Label>
                <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="mt-1 h-9 rounded-sm" />
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ends</Label>
                <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="mt-1 h-9 rounded-sm" />
              </div>
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 rounded-sm text-[13px]" />
            </div>
          </section>

          {/* Installments */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">Installments</h3>
              <div className="text-[11.5px] text-muted-foreground">
                Sum: <span className={cn("font-mono font-semibold", Math.abs(instSum - totalNum) < 0.01 ? "text-emerald-600" : "text-rose-600")}>
                  {instSum.toFixed(2)}
                </span> / {totalNum.toFixed(2)}
              </div>
            </div>
            <div className="space-y-2">
              {installments.map((i, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 rounded-sm border border-border bg-background p-2">
                  <div className="col-span-1 grid place-items-center font-mono text-[11.5px] text-muted-foreground">#{idx + 1}</div>
                  <Input value={i.label} onChange={(e) => setInstallments(installments.map((x, k) => k === idx ? { ...x, label: e.target.value } : x))}
                    className="col-span-4 h-8 rounded-sm text-[12.5px]" placeholder="Label (e.g. Advance, Mid, Final)" />
                  <Input type="date" value={i.due_date} onChange={(e) => setInstallments(installments.map((x, k) => k === idx ? { ...x, due_date: e.target.value } : x))}
                    className="col-span-3 h-8 rounded-sm text-[12.5px]" />
                  <Input type="number" value={i.amount} onChange={(e) => setInstallments(installments.map((x, k) => k === idx ? { ...x, amount: Number(e.target.value) } : x))}
                    className="col-span-3 h-8 rounded-sm font-mono text-[12.5px]" placeholder="Amount" />
                  <button onClick={() => setInstallments(installments.filter((_, k) => k !== idx))}
                    className="col-span-1 grid place-items-center rounded-sm text-rose-600 hover:bg-rose-50" disabled={installments.length === 1}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setInstallments([...installments, { label: "", amount: 0, due_date: new Date().toISOString().slice(0, 10) }])}
                className="h-7 rounded-sm text-[11.5px]">
                <Plus className="mr-1 size-3" /> Add installment
              </Button>
              <Button variant="ghost" size="sm" onClick={() => {
                if (installments.length === 0 || totalNum <= 0) return;
                const each = Number((totalNum / installments.length).toFixed(2));
                const adjusted = installments.map((i, k) => ({ ...i, amount: k === installments.length - 1 ? Number((totalNum - each * (installments.length - 1)).toFixed(2)) : each }));
                setInstallments(adjusted);
              }} className="h-7 rounded-sm text-[11.5px] text-muted-foreground">
                Split total equally
              </Button>
            </div>
          </section>

          {/* Stakeholders */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">Stakeholders (revenue split)</h3>
              <div className="text-[11.5px] text-muted-foreground">
                Total: <span className={cn("font-mono font-semibold", Math.abs(pctSum - 100) < 0.01 ? "text-emerald-600" : "text-rose-600")}>
                  {pctSum.toFixed(2)}%
                </span>
              </div>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Roles: <b>outreach</b> = brought the lead · <b>lead_closer</b> = confirmed the deal · <b>worker</b> = actually does the work · <b>company</b> = Branta cut. Percentages must sum to 100.
            </p>
            <div className="space-y-2">
              {stakeholders.map((s, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 rounded-sm border border-border bg-background p-2">
                  <select value={s.user_id} onChange={(e) => setStakeholders(stakeholders.map((x, k) => k === idx ? { ...x, user_id: e.target.value } : x))}
                    className="col-span-5 h-8 rounded-sm border border-input bg-background px-2 text-[12.5px]">
                    <option value="">— Employee —</option>
                    {emps.data?.map((e) => (
                      <option key={e.user_id} value={e.user_id}>{e.full_name ?? e.user_id.slice(0, 8)} {e.employee_code ? `(${e.employee_code})` : ""}</option>
                    ))}
                  </select>
                  <select value={s.role} onChange={(e) => setStakeholders(stakeholders.map((x, k) => k === idx ? { ...x, role: e.target.value as StakeholderRole } : x))}
                    className="col-span-4 h-8 rounded-sm border border-input bg-background px-2 text-[12.5px] capitalize">
                    <option value="outreach">Outreach</option>
                    <option value="lead_closer">Lead closer</option>
                    <option value="worker">Worker</option>
                    <option value="company">Company</option>
                  </select>
                  <Input type="number" value={s.percent} onChange={(e) => setStakeholders(stakeholders.map((x, k) => k === idx ? { ...x, percent: Number(e.target.value) } : x))}
                    className="col-span-2 h-8 rounded-sm font-mono text-[12.5px]" placeholder="%" />
                  <button onClick={() => setStakeholders(stakeholders.filter((_, k) => k !== idx))}
                    className="col-span-1 grid place-items-center rounded-sm text-rose-600 hover:bg-rose-50" disabled={stakeholders.length === 1}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setStakeholders([...stakeholders, { user_id: "", role: "worker", percent: 0 }])}
                className="h-7 rounded-sm text-[11.5px]">
                <Plus className="mr-1 size-3" /> Add stakeholder
              </Button>
            </div>
          </section>

          <section>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes (visible on invoice)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 rounded-sm text-[13px]" />
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-border px-5 py-3">
          <div className="text-[11.5px] text-muted-foreground">
            {canSubmit ? "Ready to create" : "Fix validation errors above"}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-9 rounded-sm">Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending}
              className="h-9 rounded-sm bg-primary hover:bg-brand-700">
              {submit.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Create invoice
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
