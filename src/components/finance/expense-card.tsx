import type { ReactNode } from "react";
import { Eye, History, Pencil, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExpenseDownloadButton } from "./expense-download-button";
import { cn } from "@/lib/utils";

export interface ExpenseCardRecord {
  id: string;
  voucher_no: string | null;
  vendor: string | null;
  request_purpose?: string | null;
  notes: string | null;
  spent_on: string;
  payment_method?: string | null;
  requested_by_name?: string | null;
  department?: string | null;
  txn_id?: string | null;
  signed_voucher_url: string | null;
}

export function ExpenseCard({ record: r, category, amount, receiptCount, requestedByAvatar, highlighted, downloading = false, menu, onActivity, onView, onDownload, onEdit }: {
  record: ExpenseCardRecord;
  category: string;
  amount: string;
  receiptCount: number;
  requestedByAvatar?: string | null;
  highlighted?: boolean;
  downloading?: boolean;
  menu: ReactNode;
  onActivity: () => void;
  onView: () => void;
  onDownload: () => Promise<void>;
  onEdit: () => void;
}) {
  return (
    <article id={`exp-m-${r.id}`} data-exp-id={r.id} className={cn(
      "expense-reactive-card group flex min-w-0 flex-col rounded-lg border border-border bg-card p-3.5 shadow-sm sm:p-4",
      highlighted && "ring-2 ring-brand",
    )}>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/50 text-foreground transition-all duration-200 group-hover:border-brand/25 group-hover:bg-brand/10 group-hover:text-brand"><Receipt className="size-4 transition-transform duration-200 group-hover:-rotate-12" /></span>
          <div className="min-w-0">
            <div className="truncate font-mono text-[11.5px] font-bold">{r.voucher_no ?? "—"}</div>
            <div className="truncate text-[10px] font-semibold text-muted-foreground">{category}{r.signed_voucher_url ? " · Signed" : ""}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button type="button" variant="outline" size="sm" className="expense-action h-8 gap-1.5 border-foreground/15 bg-foreground px-2 font-semibold text-background hover:bg-foreground/90 hover:text-background" onClick={onActivity} aria-label="Activity log" title="Activity log">
            <History className="size-3.5" /><span className="hidden min-[360px]:inline">Activity</span>
          </Button>
          {menu}
        </div>
      </header>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <h3 className="min-w-0 break-words text-[13px] font-bold leading-5 [overflow-wrap:anywhere]">{r.vendor || category}</h3>
        <span className="min-w-0 max-w-[12rem] break-words text-right font-mono text-[16px] font-bold leading-6 text-destructive [overflow-wrap:anywhere]">{amount}</span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-5 text-muted-foreground" title={r.request_purpose || r.notes || undefined}>{r.request_purpose || r.notes || "No purpose noted"}</p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-2.5 text-[11.5px]">
        {[
          ["Date", new Date(r.spent_on).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
          ["Method", r.payment_method],
          ["Requested by", r.requested_by_name],
          ["Department", r.department],
        ].map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
          <dd className="flex h-6 min-w-0 items-center gap-1.5 font-semibold" title={value ?? undefined}>
            {label === "Requested by" && value && <Avatar className="size-5 border border-border">
              <AvatarImage src={requestedByAvatar || undefined} alt={value} className="object-cover" />
              <AvatarFallback className="text-[8px] font-bold text-muted-foreground">{value.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</AvatarFallback>
            </Avatar>}
            <span className="min-w-0 truncate">{value || "—"}</span>
          </dd>
        </div>)}
      </dl>
      <div className="mt-2.5 truncate font-mono text-[10px] text-muted-foreground" title={r.txn_id ?? undefined}>
        {r.txn_id ? `TrxID ${r.txn_id}` : "No TrxID"} · {receiptCount} receipt{receiptCount === 1 ? "" : "s"}
      </div>
      <footer className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-3">
        <Button type="button" size="sm" variant="outline" className="expense-action hidden h-9 min-w-0 gap-1.5 border-status-new/20 bg-status-new/5 px-2 font-bold text-status-new hover:border-status-new/40 hover:bg-status-new/10 hover:text-status-new sm:inline-flex" disabled={!r.voucher_no} onClick={onView}><Eye className="size-3.5" />View</Button>
        <ExpenseDownloadButton disabled={!r.voucher_no} downloading={downloading} onDownload={onDownload} />
        <Button type="button" size="sm" className="expense-action h-9 min-w-0 gap-1.5 px-2 font-bold" onClick={onEdit}><Pencil className="size-3.5" />Edit</Button>
      </footer>
    </article>
  );
}