import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { getInvoiceFundPreviewContext } from "@/lib/fund-ledger.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/finance/searchable-select";

export type EmployeePlan = { employee_id: string; mode: "percent" | "fixed"; value: number; task_id: string; note: string };

export const EXCEEDS_MSG = "Employee allocation exceeds available Employee Fund amount.";
const r2 = (n: number) => Math.round(n * 100) / 100;
export const planAmount = (p: EmployeePlan, pool: number) => r2(p.mode === "percent" ? (pool * (Number(p.value) || 0)) / 100 : Number(p.value) || 0);

export function toPlanPayload(plans: EmployeePlan[]) {
  return plans.filter((p) => p.employee_id && Number(p.value) > 0)
    .map((p) => ({ employee_id: p.employee_id, mode: p.mode, value: Number(p.value), task_id: p.task_id || null, note: p.note.trim() || null }));
}

/** Live 9-fund preview + planned Employee Fund distribution. Calls onExceeded so the form can block saving. */
export function EmployeeFundPlanner({
  net, currency, projectId, plans, onChange, onPoolChange,
}: {
  net: number; currency: string; projectId?: string | null;
  plans: EmployeePlan[]; onChange: (p: EmployeePlan[]) => void; onPoolChange?: (pool: number) => void;
}) {
  const fetchCtx = useServerFn(getInvoiceFundPreviewContext);
  const q = useQuery({ queryKey: ["invoice-fund-preview", projectId ?? null], queryFn: () => fetchCtx({ data: { projectId: projectId || null } }) });
  const d = q.data;
  if (!d?.allowed) return null;
  const empPct = d.funds.find((f) => f.code === "employee")?.percent ?? 0;
  const pool = r2((Math.max(net, 0) * empPct) / 100);
  if (onPoolChange) queueMicrotask(() => onPoolChange(pool));
  const assigned = r2(plans.reduce((a, p) => a + planAmount(p, pool), 0));
  const over = assigned > pool + 0.005;
  const set = (i: number, patch: Partial<EmployeePlan>) => onChange(plans.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold">Fund Allocation preview</h3>
        <p className="text-[11px] text-muted-foreground">Net fund distributable {currency} {net.toFixed(2)} split by {d.versionName ?? "the active version"}. Money reaches the funds only when installments are paid.</p>
        <div className="mt-2 grid gap-x-6 gap-y-1 rounded-sm border border-border bg-muted/40 p-2.5 text-[12px] sm:grid-cols-2">
          {d.funds.map((f) => (
            <div key={f.code} className={cn("flex justify-between", f.code === "employee" && "font-semibold")}>
              <span className="text-muted-foreground">{f.name} · {f.percent}%</span>
              <span className="font-mono">{currency} {r2((net * f.percent) / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[13px] font-semibold">Employee Fund Distribution</h3>
        <p className="text-[11px] text-muted-foreground">Planned split of the Employee Fund only. Partial assignment is fine — the rest stays in the global Employee Fund. Draft payments are created only after money is received.</p>
        <div className="mt-2 space-y-2">
          {plans.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded-sm border border-border bg-background p-2">
              <div className="col-span-12 sm:col-span-4">
                <SearchableSelect
                  value={p.employee_id}
                  onChange={(v) => set(i, { employee_id: v })}
                  placeholder="— Team member —"
                  emptyText="No active team members found"
                  className="h-8 text-[12px]"
                  items={d.employees.map((e) => ({ value: e.id, label: e.name, hint: [e.code, e.role].filter(Boolean).join(" · ") || null, keywords: [e.code, e.role] }))}
                />
              </div>
              <select value={p.mode} onChange={(e) => set(i, { mode: e.target.value as EmployeePlan["mode"] })} className="col-span-6 h-8 rounded-sm border border-input bg-background px-2 text-[12px] sm:col-span-3">
                <option value="percent">% of Employee Fund</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <Input type="number" value={p.value || ""} placeholder={p.mode === "percent" ? "%" : currency} onChange={(e) => set(i, { value: Number(e.target.value) })} className="col-span-5 h-8 rounded-sm font-mono text-[12px] sm:col-span-2" />
              <div className="col-span-1 flex items-center justify-end sm:col-span-3 sm:justify-between">
                <span className="hidden font-mono text-[12px] sm:inline">= {currency} {planAmount(p, pool).toFixed(2)}</span>
                <button type="button" onClick={() => onChange(plans.filter((_, k) => k !== i))} className="grid size-7 place-items-center rounded-sm text-destructive hover:bg-destructive/10" aria-label="Remove"><Trash2 className="size-3.5" /></button>
              </div>
              <select value={p.task_id} onChange={(e) => set(i, { task_id: e.target.value })} disabled={!d.tasks.length} className="col-span-12 h-8 rounded-sm border border-input bg-background px-2 text-[12px] sm:col-span-4">
                <option value="">{d.tasks.length ? "— Project task (optional) —" : "No project tasks"}</option>
                {d.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <Input value={p.note} placeholder="Note (optional)" onChange={(e) => set(i, { note: e.target.value })} className="col-span-12 h-8 rounded-sm text-[12px] sm:col-span-8" />
              {(() => {
                const e = d.employees.find((x) => x.id === p.employee_id);
                if (!e) return null;
                const task = d.tasks.find((t) => t.id === p.task_id);
                return (
                  <div className="col-span-12 flex flex-wrap items-center gap-3 rounded-sm bg-muted/40 px-2 py-1.5 text-[11.5px]">
                    {e.avatar ? <img src={e.avatar} alt="" className="size-8 rounded-full object-cover" /> : <div className="grid size-8 place-items-center rounded-full bg-muted font-semibold">{e.name.slice(0, 1)}</div>}
                    <div className="min-w-0">
                      <div className="font-medium">{e.name} {e.code && <span className="font-mono text-muted-foreground">· {e.code}</span>}</div>
                      <div className="text-muted-foreground">{e.role || "No designation"}{task ? ` · Task: ${task.title}` : ""}</div>
                    </div>
                    <div className="ml-auto flex gap-4 font-mono">
                      <span><span className="font-sans text-muted-foreground">Wallet </span>BDT {e.walletAvailable.toFixed(2)}</span>
                      <span className="font-semibold"><span className="font-sans font-normal text-muted-foreground">Project earning </span>{currency} {planAmount(p, pool).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="h-7 rounded-sm text-[11.5px]" onClick={() => onChange([...plans, { employee_id: "", mode: "percent", value: 0, task_id: "", note: "" }])}>
            <Plus className="mr-1 size-3" /> Add team member
          </Button>
        </div>
        <div className="mt-3 space-y-1 rounded-sm border border-border bg-muted/40 p-2.5 text-[12px]">
          <Line k="Employee Fund allocation" v={`${currency} ${pool.toFixed(2)}`} />
          <Line k="Assigned" v={`${currency} ${assigned.toFixed(2)}`} />
          <Line k="Remaining" v={`${currency} ${r2(pool - assigned).toFixed(2)}`} strong />
        </div>
        {over && <p className="mt-1.5 text-[11.5px] font-medium text-destructive">{EXCEEDS_MSG}</p>}
      </div>
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={cn("flex justify-between", strong && "font-semibold")}><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>;
}
