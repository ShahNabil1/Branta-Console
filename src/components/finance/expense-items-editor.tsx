import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

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

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase text-muted-foreground">
          Line items <span className="font-normal normal-case">(optional — quantity × unit price)</span>
        </label>
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {currency} {sumItems(items).toFixed(2)}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-1.5 rounded-sm border border-border bg-background p-2">
            <Input
              value={it.name}
              list="expense-item-presets"
              onChange={(e) => patch(idx, { name: e.target.value })}
              placeholder="Item (e.g. Domain renewal)"
              className="col-span-12 h-8 rounded-sm text-[12.5px] sm:col-span-4"
            />
            <Input
              type="number"
              value={it.quantity}
              onChange={(e) => patch(idx, { quantity: Number(e.target.value) })}
              placeholder="Qty"
              className="col-span-3 h-8 rounded-sm font-mono text-[12.5px] sm:col-span-2"
            />
            <Input
              value={it.unit}
              list="expense-unit-presets"
              onChange={(e) => patch(idx, { unit: e.target.value })}
              placeholder="Unit"
              className="col-span-4 h-8 rounded-sm text-[12.5px] sm:col-span-2"
            />
            <Input
              type="number"
              value={it.unit_price}
              onChange={(e) => patch(idx, { unit_price: Number(e.target.value) })}
              placeholder="Unit price"
              className="col-span-4 h-8 rounded-sm font-mono text-[12.5px] sm:col-span-2"
            />
            <div className="col-span-1 grid place-items-center font-mono text-[11.5px] text-muted-foreground sm:col-span-1">
              {itemTotal(it).toFixed(0)}
            </div>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, k) => k !== idx))}
              className="col-span-12 grid h-8 place-items-center rounded-sm text-rose-600 hover:bg-rose-50 sm:col-span-1"
              aria-label="Remove line"
            >
              <Trash2 className="size-3.5" />
            </button>
            <Input
              value={it.note}
              onChange={(e) => patch(idx, { note: e.target.value })}
              placeholder="Note (optional) — e.g. brantatech.com, 2026–2028"
              className="col-span-12 h-8 rounded-sm text-[12.5px]"
            />
          </div>
        ))}
        <datalist id="expense-item-presets">
          {ITEM_PRESETS.map((p) => <option key={p} value={p} />)}
        </datalist>
        <datalist id="expense-unit-presets">
          {UNIT_PRESETS.map((p) => <option key={p} value={p} />)}
        </datalist>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, emptyItem()])}
          className="h-7 rounded-sm text-[11.5px]"
        >
          <Plus className="mr-1 size-3" /> Add line item
        </Button>
      </div>
    </div>
  );
}
