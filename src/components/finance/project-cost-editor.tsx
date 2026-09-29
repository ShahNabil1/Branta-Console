import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectCost = {
  name: string;
  amount: number;
  description: string;
  cost_type?: string;
  amount_mode?: "fixed" | "percent";
  value?: number;
  note?: string;
};

export const COST_TYPES = [
  { value: "broker", label: "External Broker" },
  { value: "freelancer", label: "External Freelancer" },
  { value: "transport", label: "Transport" },
  { value: "model", label: "Model" },
  { value: "location", label: "Location" },
  { value: "production", label: "Production" },
  { value: "printing", label: "Printing" },
  { value: "software_api", label: "External Software / API" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other Direct Project Cost" },
];
export const COST_PRESETS = COST_TYPES.map((t) => t.label);
export const costTypeLabel = (v?: string | null) => COST_TYPES.find((t) => t.value === v)?.label ?? "Other Direct Project Cost";

export function sumProjectCosts(costs: ProjectCost[]): number {
  return costs.reduce((a, c) => a + (Number(c.amount) || 0), 0);
}

/** Maps a saved cost row into editor state. */
export function toEditorCost(c: { name: string; amount: number; description: string | null; cost_type?: string | null; amount_mode?: string | null; value?: number | null; note?: string | null }): ProjectCost {
  const mode = c.amount_mode === "percent" ? "percent" : "fixed";
  return { name: c.name, amount: Number(c.amount), description: c.description ?? "", cost_type: c.cost_type ?? "other", amount_mode: mode, value: c.value != null ? Number(c.value) : Number(c.amount), note: c.note ?? "" };
}

/** Payload for the server. */
export function toCostPayload(costs: ProjectCost[]) {
  return costs
    .filter((c) => c.name.trim() || Number(c.amount) > 0)
    .map((c) => ({
      name: c.name.trim(), amount: Number(c.amount) || 0, description: c.description.trim() || null,
      cost_type: c.cost_type ?? "other", amount_mode: c.amount_mode ?? "fixed",
      value: c.value != null ? Number(c.value) : Number(c.amount) || 0, note: c.note?.trim() || null,
    }));
}

const calc = (mode: string | undefined, value: number, total: number) =>
  Math.round((mode === "percent" ? (total * value) / 100 : value) * 100) / 100;

export function ProjectCostEditor({
  costs, onChange, total, currency, compact = false,
}: {
  costs: ProjectCost[];
  onChange: (next: ProjectCost[]) => void;
  total: number;
  currency: string;
  compact?: boolean;
}) {
  // Keep percent-based amounts in sync with the invoice total.
  const synced = costs.map((c) => (c.amount_mode === "percent" ? { ...c, amount: calc("percent", Number(c.value) || 0, total) } : c));
  if (synced.some((c, i) => c.amount !== costs[i].amount)) queueMicrotask(() => onChange(synced));
  const costSum = sumProjectCosts(synced);
  const net = Math.max(total - costSum, 0);
  const over = costSum > total + 0.001;

  const patch = (idx: number, p: Partial<ProjectCost>) =>
    onChange(costs.map((c, k) => {
      if (k !== idx) return c;
      const n = { ...c, ...p };
      n.amount = calc(n.amount_mode, Number(n.value) || 0, total);
      return n;
    }));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className={cn("font-semibold", compact ? "text-[13px]" : "text-[13px]")}>Project cost / direct charges</h4>
        <span className={cn("font-mono text-[11.5px]", over ? "text-destructive" : "text-muted-foreground")}>
          {costSum.toFixed(2)} / {total.toFixed(2)}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        External costs (broker, freelancer, transport…) come off the invoice total before the Fund Ledger split. Internal sales team is paid from the Sales Fund, not here.
      </p>
      <div className="space-y-2">
        {synced.map((c, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 rounded-sm border border-border bg-background p-2">
            <Input value={c.name} onChange={(e) => patch(idx, { name: e.target.value })} placeholder="Name / description"
              className="col-span-12 h-8 rounded-sm text-[12.5px] sm:col-span-4" />
            <select value={c.cost_type ?? "other"} onChange={(e) => patch(idx, { cost_type: e.target.value })}
              className="col-span-6 h-8 rounded-sm border border-input bg-background px-2 text-[12px] sm:col-span-3">
              {COST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={c.amount_mode ?? "fixed"} onChange={(e) => patch(idx, { amount_mode: e.target.value as "fixed" | "percent" })}
              className="col-span-6 h-8 rounded-sm border border-input bg-background px-2 text-[12px] sm:col-span-2">
              <option value="fixed">Fixed</option>
              <option value="percent">% of total</option>
            </select>
            <Input type="number" value={c.value ?? c.amount} onChange={(e) => patch(idx, { value: Number(e.target.value) })}
              placeholder={c.amount_mode === "percent" ? "%" : "Amount"} className="col-span-5 h-8 rounded-sm font-mono text-[12.5px] sm:col-span-2" />
            <button type="button" onClick={() => onChange(costs.filter((_, k) => k !== idx))}
              className="col-span-1 grid place-items-center rounded-sm text-destructive hover:bg-destructive/10" aria-label="Remove cost">
              <Trash2 className="size-3.5" />
            </button>
            <Input value={c.note ?? ""} onChange={(e) => patch(idx, { note: e.target.value })} placeholder="Note (optional)"
              className="col-span-8 h-8 rounded-sm text-[12.5px] sm:col-span-9" />
            <div className="col-span-4 flex items-center justify-end font-mono text-[12px] sm:col-span-3">= {currency} {Number(c.amount).toFixed(2)}</div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm"
          onClick={() => onChange([...costs, { name: "", amount: 0, description: "", cost_type: "other", amount_mode: "fixed", value: 0, note: "" }])}
          className="h-7 rounded-sm text-[11.5px]">
          <Plus className="mr-1 size-3" /> Add cost
        </Button>
      </div>

      <div className="mt-3 space-y-1 rounded-sm border border-border bg-muted/40 p-2.5 text-[12px]">
        <Row label="Invoice total" value={`${currency} ${total.toFixed(2)}`} />
        <Row label="Project cost / direct charges" value={`− ${currency} ${costSum.toFixed(2)}`} />
        <Row label="Net fund distributable" value={`${currency} ${net.toFixed(2)}`} strong />
      </div>
      {over && <p className="mt-1.5 text-[11.5px] font-medium text-destructive">Project cost cannot exceed the invoice total.</p>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-muted-foreground", strong && "font-semibold text-foreground")}>{label}</span>
      <span className={cn("font-mono", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
