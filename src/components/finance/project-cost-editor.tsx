import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectCost = { name: string; amount: number; description: string };

export const COST_PRESETS = [
  "Broker",
  "Freelancer",
  "Transportation",
  "Production Cost",
  "Third-party Cost",
];

export function sumProjectCosts(costs: ProjectCost[]): number {
  return costs.reduce((a, c) => a + (Number(c.amount) || 0), 0);
}

export function ProjectCostEditor({
  costs,
  onChange,
  total,
  currency,
  compact = false,
}: {
  costs: ProjectCost[];
  onChange: (next: ProjectCost[]) => void;
  total: number;
  currency: string;
  compact?: boolean;
}) {
  const costSum = sumProjectCosts(costs);
  const net = Math.max(total - costSum, 0);
  const over = costSum > total + 0.001;

  const patch = (idx: number, p: Partial<ProjectCost>) =>
    onChange(costs.map((c, k) => (k === idx ? { ...c, ...p } : c)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className={cn("font-semibold", compact ? "text-[13px]" : "text-[13px]")}>Project cost</h4>
        <span className={cn("font-mono text-[11.5px]", over ? "text-rose-600" : "text-muted-foreground")}>
          {costSum.toFixed(2)} / {total.toFixed(2)}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        External costs (broker, freelancer, transport…). Deducted from the invoice total before the
        stakeholder split. Not a stakeholder.
      </p>
      <div className="space-y-2">
        {costs.map((c, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 rounded-sm border border-border bg-background p-2">
            <div className="col-span-4">
              <Input
                value={c.name}
                list="project-cost-presets"
                onChange={(e) => patch(idx, { name: e.target.value })}
                placeholder="Cost name"
                className="h-8 rounded-sm text-[12.5px]"
              />
            </div>
            <Input
              type="number"
              value={c.amount}
              onChange={(e) => patch(idx, { amount: Number(e.target.value) })}
              placeholder="Amount"
              className="col-span-3 h-8 rounded-sm font-mono text-[12.5px]"
            />
            <Input
              value={c.description}
              onChange={(e) => patch(idx, { description: e.target.value })}
              placeholder="Description (optional)"
              className="col-span-4 h-8 rounded-sm text-[12.5px]"
            />
            <button
              type="button"
              onClick={() => onChange(costs.filter((_, k) => k !== idx))}
              className="col-span-1 grid place-items-center rounded-sm text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <datalist id="project-cost-presets">
          {COST_PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...costs, { name: "", amount: 0, description: "" }])}
          className="h-7 rounded-sm text-[11.5px]"
        >
          <Plus className="mr-1 size-3" /> Add cost
        </Button>
      </div>

      <div className="mt-3 space-y-1 rounded-sm border border-border bg-muted/40 p-2.5 text-[12px]">
        <Row label="Invoice total" value={`${currency} ${total.toFixed(2)}`} />
        <Row label="Total project cost" value={`− ${currency} ${costSum.toFixed(2)}`} />
        <Row label="Net distributable" value={`${currency} ${net.toFixed(2)}`} strong />
      </div>
      {over && (
        <p className="mt-1.5 text-[11.5px] font-medium text-rose-600">
          Project cost cannot exceed the invoice total.
        </p>
      )}
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
