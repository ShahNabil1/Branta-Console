import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Waiting for payment",
  overdue: "Waiting for payment",
  partially_paid: "Partially Paid",
  paid: "Paid",
  void: "Void",
};
export const invoiceStatusLabel = (s: string) => INVOICE_STATUS_LABEL[s] ?? s.replace(/_/g, " ");

/** Qty × Unit price → Total, with a visible breakdown. Calls onTotal whenever qty/price change. */
export function QtyPriceFields({
  qty, unitPrice, currency, setQty, setUnitPrice, onTotal,
}: {
  qty: string; unitPrice: string; currency: string;
  setQty: (v: string) => void; setUnitPrice: (v: string) => void; onTotal: (v: string) => void;
}) {
  const q = Number(qty) || 0;
  const u = Number(unitPrice) || 0;
  const total = Number((q * u).toFixed(2));
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const upd = (nq: string, nu: string) => onTotal(String(Number(((Number(nq) || 0) * (Number(nu) || 0)).toFixed(2))));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity *</Label>
          <Input type="number" min="0" step="any" value={qty}
            onChange={(e) => { setQty(e.target.value); upd(e.target.value, unitPrice); }}
            className="mt-1 h-9 rounded-sm font-mono" />
        </div>
        <div>
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unit price *</Label>
          <Input type="number" min="0" step="any" value={unitPrice}
            onChange={(e) => { setUnitPrice(e.target.value); upd(qty, e.target.value); }}
            className="mt-1 h-9 rounded-sm font-mono" />
        </div>
      </div>
      <div className="rounded-sm border border-border bg-muted/40 px-3 py-2 text-[12.5px]">
        <div className="flex justify-between text-muted-foreground">
          <span>{fmt(q)} × {currency} {fmt(u)}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold">
          <span>Total amount</span>
          <span className="font-mono text-primary">{currency} {fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
