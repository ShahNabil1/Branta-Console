import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListChecks, Plus, Trash2 } from "lucide-react";

export type ExpenseItem = {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  note: string;
};

/** Common recurring client-project costs, offered as type-ahead suggestions. */
export const ITEM_PRESETS = [
  "Domain renewal",
  "Hosting plan",
  "Lovable credits",
  "Magnifik subscription",
  "Third-party API credits",
  "SSL certificate",
  "Cloud storage",
  "Stock assets / license",
  "Ad spend",
  "Freelancer payment",
];

export const UNIT_PRESETS = ["year", "month", "credit", "piece", "user", "GB", "hour"];

export function emptyItem(): ExpenseItem {
  return { name: "", quantity: 1, unit: "", unit_price: 0, note: "" };
}

export function itemTotal(i: ExpenseItem) {
  return (Number(i.quantity) || 0) * (Number(i.unit_price) || 0);
}

export function sumItems(items: ExpenseItem[]) {
  return items.reduce((a, i) => a + itemTotal(i), 0);
}

/**
 * Quantity-aware breakdown for one expense (1 year domain, 500 credits, …).
 * The parent keeps the grand total in sync with the sum of these lines.
 */
export function ExpenseItemsEditor({
  items,
  onChange,
  currency,
}: {
  items: ExpenseItem[];
  onChange: (next: ExpenseItem[]) => void;
  currency: string;
}) {
  const patch = (idx: number, p: Partial<ExpenseItem>) =>
    onChange(items.map((it, k) => (k === idx ? { ...it, ...p } : it)));

  const total = sumItems(items);
  const fc = "h-9 rounded-lg bg-card text-[12.5px] font-semibold shadow-sm transition-all hover:border-foreground/25 focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]";
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-inset ring-brand/20"><ListChecks className="size-3.5" /></span>
          <div>
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Line items</div>
            <div className="text-[11px] font-medium text-muted-foreground">Optional · quantity × unit price</div>
          </div>
        </div>
        <span className="rounded-full bg-foreground px-2.5 py-1 font-mono text-[11.5px] font-bold text-background tabular-nums transition-all">
          {currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="space-y-2">
        {items.length === 0 && (
          <button type="button" onClick={() => onChange([emptyItem()])}
            className="group flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-card px-4 py-5 text-center transition-all hover:border-brand/50 hover:bg-brand/[0.03]">
            <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground transition-all group-hover:scale-110 group-hover:bg-brand group-hover:text-white"><Plus className="size-4" /></span>
            <span className="text-[12.5px] font-bold">Break this expense into items</span>
            <span className="text-[11px] font-medium text-muted-foreground">e.g. 1 year domain, 500 credits — totals fill the amount</span>
          </button>
        )}
        {items.map((it, idx) => (
          <div key={idx} className="group/row relative rounded-lg border border-border bg-card p-2.5 shadow-sm transition-all animate-in fade-in slide-in-from-top-1 duration-200 hover:border-foreground/20">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-bold text-muted-foreground">#{String(idx + 1).padStart(2, "0")}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[12.5px] font-bold tabular-nums">{currency} {itemTotal(it).toLocaleString()}</span>
                <button type="button" onClick={() => onChange(items.filter((_, k) => k !== idx))}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-all hover:bg-rose-50 hover:text-rose-600 active:scale-90"
                  aria-label="Remove line"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <Input value={it.name} list="expense-item-presets" onChange={(e) => patch(idx, { name: e.target.value })}
                placeholder="Item (e.g. Domain renewal)" className={`col-span-12 sm:col-span-5 ${fc}`} />
              <Input type="number" value={it.quantity} onChange={(e) => patch(idx, { quantity: Number(e.target.value) })}
                placeholder="Qty" aria-label="Quantity" className={`col-span-3 sm:col-span-2 font-mono ${fc}`} />
              <Input value={it.unit} list="expense-unit-presets" onChange={(e) => patch(idx, { unit: e.target.value })}
                placeholder="Unit" aria-label="Unit" className={`col-span-4 sm:col-span-2 ${fc}`} />
              <Input type="number" value={it.unit_price} onChange={(e) => patch(idx, { unit_price: Number(e.target.value) })}
                placeholder="Unit price" aria-label="Unit price" className={`col-span-5 sm:col-span-3 font-mono ${fc}`} />
              <Input value={it.note} onChange={(e) => patch(idx, { note: e.target.value })}
                placeholder="Note (optional) — e.g. brantatech.com, 2026–2028" className={`col-span-12 font-medium ${fc}`} />
            </div>
          </div>
        ))}
        <datalist id="expense-item-presets">
          {ITEM_PRESETS.map((p) => <option key={p} value={p} />)}
        </datalist>
        <datalist id="expense-unit-presets">
          {UNIT_PRESETS.map((p) => <option key={p} value={p} />)}
        </datalist>
        {items.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, emptyItem()])}
            className="h-8 w-full gap-1.5 rounded-lg border-dashed text-[12px] font-bold transition-all hover:border-brand/50 hover:text-brand active:scale-[0.99]">
            <Plus className="size-3.5" /> Add line item
          </Button>
        )}
      </div>
    </div>
  );
}
