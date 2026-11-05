import { DiscardCancelButton } from "@/components/company/danger-confirm";
import { useCompanyPath } from "@/components/company/use-company-path";
import { useActiveCompany } from "@/components/company/company-switcher";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { QtyPriceFields } from "@/components/finance/qty-price-fields";
import { toast } from "sonner";
import {
  createInvoice,
  listEmployeesForFinance,
  type Currency,
  type StakeholderRole,
} from "@/lib/finance.functions";
import { listCustomersForPicker } from "@/lib/customers.functions";
import { listProjectsForPicker } from "@/lib/client-projects.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableSelect, type SearchableItem } from "@/components/finance/searchable-select";
import { QuickCustomerDialog } from "@/components/finance/quick-customer-dialog";
import { ProjectCostEditor, sumProjectCosts, toCostPayload, type ProjectCost } from "@/components/finance/project-cost-editor";
import { CompanyFundPreview, useCustomerFundContext } from "@/components/finance/company-fund-preview";
import { EmployeeFundPlanner, planAmount, toPlanPayload, EXCEEDS_MSG, type EmployeePlan } from "@/components/finance/employee-fund-planner";

type Installment = { label: string; amount: number; due_date: string };
type Stakeholder = { user_id: string; role: StakeholderRole; percent: number };


export function NewInvoicePage() {
  const cp = useCompanyPath();
  const activeCo = useActiveCompany().active;
  const workspace = activeCo?.slug ?? null;
  const sisterCompanyId = activeCo && !activeCo.is_holding ? activeCo.id : null;
  const navigate = useNavigate();
  const create = useServerFn(createInvoice);
  const listCust = useServerFn(listCustomersForPicker);
  const listEmp = useServerFn(listEmployeesForFinance);

  const custs = useQuery({ queryKey: ["customers", "picker", workspace], queryFn: () => listCust({ data: { workspace } }), staleTime: 30_000 });
  const emps = useQuery({ queryKey: ["finance-employees"], queryFn: () => listEmp(), staleTime: 30_000 });

  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const listProj = useServerFn(listProjectsForPicker);
  const projQ = useQuery({ queryKey: ["client-projects-picker", customerId], queryFn: () => listProj({ data: { customerId } }), enabled: !!customerId });
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState<"one_time" | "monthly_retainer">("one_time");
  const [currency, setCurrency] = useState<Currency>("BDT");
  const [total, setTotal] = useState<string>("0");
  const [qty, setQty] = useState<string>("1");
  const [unitPrice, setUnitPrice] = useState<string>("0");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [installments, setInstallments] = useState<Installment[]>([
    { label: "Advance", amount: 0, due_date: new Date().toISOString().slice(0, 10) },
  ]);
  const [projectCosts, setProjectCosts] = useState<ProjectCost[]>([]);
  const [plans, setPlans] = useState<EmployeePlan[]>([]);
  const [empPool, setEmpPool] = useState(0);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([
    { user_id: "", role: "company", percent: 100 },
  ]);

  const customerItems: SearchableItem[] = useMemo(
    () => (custs.data ?? []).map((c: { id: string; customer_code: string; name: string; company: string | null; email: string | null; phone: string | null }) => ({
      value: c.id,
      label: `${c.customer_code} · ${c.name}`,
      hint: c.company ?? c.email ?? c.phone ?? undefined,
      keywords: [c.name, c.customer_code, c.email, c.phone, c.company],
    })),
    [custs.data],
  );


  const employeeItems: SearchableItem[] = useMemo(
    () => (emps.data ?? []).map((e) => ({
      value: e.user_id,
      label: e.full_name ?? e.user_id.slice(0, 8),
      hint: e.employee_code ?? undefined,
      keywords: [e.full_name, e.employee_code, e.job_role, (e as { email?: string | null }).email],
    })),
    [emps.data],
  );

  const totalNum = Number(total) || 0;
  const instSum = useMemo(() => installments.reduce((a, i) => a + Number(i.amount || 0), 0), [installments]);
  const costSum = useMemo(() => sumProjectCosts(projectCosts), [projectCosts]);
  const netAmount = Math.max(totalNum - costSum, 0);
  const fundCtx = useCustomerFundContext(customerId || null, sisterCompanyId);
  const sisterCtx = fundCtx.data?.sister ? fundCtx.data : null;
  const pctSum = useMemo(() => stakeholders.reduce((a, s) => a + Number(s.percent || 0), 0), [stakeholders]);

  const submit = useMutation({
    mutationFn: async () => {
      return await create({ data: {
        customer_id: customerId,
        project_id: projectId || null,
        title: title.trim(),
        description: description.trim() || null,
        project_type: projectType,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        currency,
        total_amount: totalNum,
        quantity: Number(qty) || 1,
        unit_price: Number(unitPrice) || 0,
        notes: notes.trim() || null,
        installments: installments.map((i) => ({ label: i.label.trim(), amount: Number(i.amount), due_date: i.due_date })),
        stakeholders: [],
        project_costs: toCostPayload(projectCosts),
        employee_plans: toPlanPayload(plans),
      }});
    },
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv.slug} created`);
      navigate({ to: "/app/finance/invoices/$slug", params: { slug: inv.slug } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const issues = useMemo(() => {
    const out: string[] = [];
    if (!customerId) out.push("Select a customer");
    if (!title.trim()) out.push("Enter a title");
    if (!(totalNum > 0)) out.push("Total amount must be greater than 0");
    if (totalNum > 0 && Math.abs(instSum - totalNum) >= 0.01)
      out.push(`Installments must sum to ${totalNum.toFixed(2)} (currently ${instSum.toFixed(2)}, difference ${(totalNum - instSum).toFixed(2)})`);
    if (installments.some((i) => !i.label.trim())) out.push("Every installment needs a label");
    if (installments.some((i) => !i.due_date)) out.push("Every installment needs a due date");
    if (installments.some((i) => !(Number(i.amount) > 0))) out.push("Every installment amount must be greater than 0");
    if (projectCosts.some((c) => !c.name.trim())) out.push("Every project cost needs a name");
    if (costSum > totalNum + 0.01) out.push("Total project cost cannot exceed the invoice total");
    if (plans.reduce((a, p) => a + planAmount(p, empPool), 0) > empPool + 0.005) out.push(EXCEEDS_MSG);
    return out;
  }, [customerId, title, totalNum, instSum, installments, projectCosts, costSum, plans, empPool]);

  const canSubmit = issues.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={cp("/app/finance/invoices") as "/app/finance/invoices"} className="grid size-8 place-items-center rounded-sm border border-border text-muted-foreground hover:bg-muted">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-[20px] font-semibold text-foreground">New Invoice</h1>
            <p className="text-[12.5px] text-muted-foreground">{"\n"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <DiscardCancelButton
            dirty={!!(customerId || projectId || title.trim() || description.trim() || notes.trim() || totalNum > 0 || startsOn || endsOn || projectCosts.length || plans.length || installments.length !== 1 || installments[0]?.label !== "Advance" || Number(installments[0]?.amount) > 0)}
            onCancel={() => navigate({ to: cp("/app/finance/invoices") as "/app/finance/invoices" })} className="h-9 rounded-sm" disabled={submit.isPending} />
          <Button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending}
            className="h-9 rounded-sm bg-primary hover:bg-brand-700">
            {submit.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Create invoice
          </Button>
        </div>
      </div>

      <section className="rounded-md border border-border bg-card p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer *</Label>
              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                className="text-[11.5px] font-medium text-primary hover:underline"
              >
                + Quick add
              </button>
            </div>
            <div className="mt-1">
              <SearchableSelect
                items={customerItems}
                value={customerId}
                onChange={(v) => { setCustomerId(v); setProjectId(""); }}
                placeholder="— Choose customer —"
                emptyText="No customer matches. Try Quick add."
                addLabel="Quick add customer"
                onAdd={() => setQuickAddOpen(true)}
              />
            </div>
          </div>
          {customerId && (
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project (optional)</Label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                <option value="">— No project —</option>
                {(projQ.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title}{p.service ? ` · ${p.service}` : ""}</option>
                ))}
              </select>
            </div>
          )}
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
          <QtyPriceFields qty={qty} unitPrice={unitPrice} currency={currency}
            setQty={setQty} setUnitPrice={setUnitPrice} onTotal={setTotal} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-5">
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
                className="col-span-4 h-8 rounded-sm text-[12.5px]" placeholder="Label (Advance, Mid, Final…)" />
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setInstallments([...installments, { label: "", amount: 0, due_date: new Date().toISOString().slice(0, 10) }])}
              className="h-7 rounded-sm text-[11.5px]">
              <Plus className="mr-1 size-3" /> Add installment
            </Button>
            <Button variant="ghost" size="sm" onClick={() => {
              if (installments.length === 0 || totalNum <= 0) return;
              const each = Number((totalNum / installments.length).toFixed(2));
              setInstallments(installments.map((i, k) => ({ ...i, amount: k === installments.length - 1 ? Number((totalNum - each * (installments.length - 1)).toFixed(2)) : each })));
            }} className="h-7 rounded-sm text-[11.5px] text-muted-foreground">
              Split total equally
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-5">
        <ProjectCostEditor costs={projectCosts} onChange={setProjectCosts} total={totalNum} currency={currency} />
      </section>

      <section className="rounded-md border border-border bg-card p-5">
        {sisterCtx ? <CompanyFundPreview ctx={sisterCtx} amount={totalNum} currency={currency} />
          : sisterCompanyId ? <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading {activeCo?.name} fund allocation…</div>
          : <EmployeeFundPlanner net={netAmount} currency={currency} projectId={projectId || null} plans={plans} onChange={setPlans} onPoolChange={(p) => p !== empPool && setEmpPool(p)} />}
      </section>

      <section className="rounded-md border border-border bg-card p-5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes (visible on invoice)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 rounded-sm text-[13px]" />
      </section>

      <div className="rounded-md border border-border bg-card px-5 py-3">
        {!canSubmit && (
          <div className="mb-3 rounded-sm border border-rose-200 bg-rose-50 p-3">
            <div className="text-[12px] font-semibold text-rose-700">
              {issues.length} item{issues.length > 1 ? "s" : ""} need attention before you can create this invoice
            </div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11.5px] text-rose-700">
              {issues.map((m) => <li key={m}>{m}</li>)}
            </ul>
            {totalNum > 0 && Math.abs(instSum - totalNum) >= 0.01 && (
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  const diff = Number((totalNum - instSum).toFixed(2));
                  setInstallments(installments.map((x, k) =>
                    k === installments.length - 1
                      ? { ...x, amount: Number((Number(x.amount || 0) + diff).toFixed(2)) }
                      : x));
                }}
                className="mt-2 h-7 rounded-sm text-[11.5px]"
              >
                Adjust last installment to match total
              </Button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-[11.5px] text-muted-foreground">
            {canSubmit ? "Ready to create" : "Resolve the items above"}
          </div>
          <div className="flex gap-2">
            <DiscardCancelButton
            dirty={!!(customerId || projectId || title.trim() || description.trim() || notes.trim() || totalNum > 0 || startsOn || endsOn || projectCosts.length || plans.length || installments.length !== 1 || installments[0]?.label !== "Advance" || Number(installments[0]?.amount) > 0)}
            onCancel={() => navigate({ to: cp("/app/finance/invoices") as "/app/finance/invoices" })} className="h-9 rounded-sm" disabled={submit.isPending} />
            <Button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending}
              className="h-9 rounded-sm bg-primary hover:bg-brand-700">
              {submit.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Create invoice
            </Button>
          </div>
        </div>
      </div>


      <QuickCustomerDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        defaultCurrency={currency}
        onCreated={(c) => setCustomerId(c.id)}
      />
    </div>
  );
}
