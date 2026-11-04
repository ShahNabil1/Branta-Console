import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Eye, Paperclip } from "lucide-react";
import { ReceiptPreview, ReceiptThumb, type ReceiptMedia } from "./receipt-media";

export function ExpenseReceiptsGallery({ receipts, voucherNo, onClose, onView, onDownload }: {
  receipts: ReceiptMedia[]; voucherNo: string | null; onClose: () => void; onView: (r: ReceiptMedia) => void; onDownload: (r: ReceiptMedia) => void;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const preview = (i: number) => { setIndex(i); const receipt = receipts[i]; if (receipt) onView(receipt); };
  return <>
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:p-0">
      <DialogHeader className="expense-drawer-header border-b border-border px-5 py-4 pr-12 text-left"><DialogTitle className="flex items-center gap-2 text-[15px] font-bold"><Paperclip className="size-4 text-brand" />Receipts / proof</DialogTitle><DialogDescription className="font-mono text-[11px]">{voucherNo ?? "Expense"} · {receipts.length} files</DialogDescription></DialogHeader>
      <div className="max-h-[70dvh] space-y-2 overflow-y-auto p-4">
        {receipts.map((r, i) => <article key={`${r.path}-${i}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-brand/30">
          <ReceiptThumb r={r} onOpen={() => preview(i)} />
          <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-bold" title={r.name}>{r.name}</div><p className="mt-1 break-words text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">{r.caption}</p>
            <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="expense-action h-8 gap-1 font-bold" onClick={() => preview(i)}><Eye className="size-3.5" />View</Button><Button size="sm" variant="outline" className="expense-action h-8 gap-1 border-status-converted/25 text-status-converted hover:bg-status-converted/5 hover:text-status-converted" onClick={() => onDownload(r)}><Download className="size-3.5" />Download</Button></div>
          </div>
        </article>)}
      </div>
    </DialogContent></Dialog>
    <ReceiptPreview receipts={receipts} index={index} onIndexChange={preview} onClose={() => setIndex(null)} onDownload={onDownload} />
  </>;
}