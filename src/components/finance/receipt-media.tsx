import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Image as ImageIcon, ImageOff, FileText, Download, ChevronLeft, ChevronRight, Loader2, Paperclip } from "lucide-react";
import { TestLoader } from "@/components/ui/test-loader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ReceiptMedia = { path: string | null; file?: File; name: string; caption: string; isPdf: boolean };
export function storedReceipts(record: { attachments?: { path: string; caption: string | null; mime_type?: string | null; kind?: string }[]; receipt_url: string | null }): ReceiptMedia[] {
  const attachments = (record.attachments ?? []).filter(a => !a.kind || a.kind === "receipt");
  const paths = new Set(attachments.map(a => a.path));
  const all = record.receipt_url && !paths.has(record.receipt_url) ? [...attachments, { path: record.receipt_url, caption: "Receipt" }] : attachments;
  return all.map(a => ({ path: a.path, name: a.path.split("/").pop() || "Receipt", caption: a.caption || "Receipt", isPdf: /\.pdf$/i.test(a.path) || ("mime_type" in a && a.mime_type === "application/pdf") }));
}
function useReceiptUrl(receipt: ReceiptMedia | undefined) {
  const [state, setState] = useState<{ url: string; error: boolean; source: ReceiptMedia } | null>(null);
  useEffect(() => {
    if (!receipt) return;
    let active = true;
    if (receipt.file) { const url = URL.createObjectURL(receipt.file); setState({ url, error: false, source: receipt }); return () => URL.revokeObjectURL(url); }
    if (receipt.path) void supabase.storage.from("expense-receipts").createSignedUrl(receipt.path, 600).then(({ data, error }) => {
      if (active) setState({ url: data?.signedUrl ?? "", error: !!error, source: receipt });
    });
    return () => { active = false; };
  }, [receipt]);
  return state?.source === receipt ? state : null;
}
export function ReceiptThumb({ r, onOpen }: { r: ReceiptMedia; onOpen: () => void }) {
  const state = useReceiptUrl(r);
  const heic = /\.(heic|heif)$/i.test(r.name);
  return <Button type="button" variant="outline" onClick={onOpen} aria-label={`Preview ${r.name}`}
    className="group/thumb relative size-16 shrink-0 overflow-hidden rounded-lg border-border bg-muted/50 p-0 shadow-sm hover:border-brand/50 hover:bg-brand/5">
    {r.isPdf ? <span className="flex flex-col items-center gap-1 text-destructive"><FileText className="size-6" /><span className="font-mono text-[9px] font-bold">PDF</span></span>
      : heic ? <span className="flex flex-col items-center gap-1 text-brand"><ImageIcon className="size-5" /><span className="font-mono text-[9px] font-bold">HEIC</span></span>
      : state?.url ? <img src={state.url} alt="" className="size-full object-cover transition-transform duration-300 motion-safe:group-hover/thumb:scale-110" />
      : state?.error ? <ImageOff className="size-5 text-muted-foreground" /> : <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    <span className="absolute inset-0 grid place-items-center bg-foreground/45 opacity-0 transition-opacity group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100"><Eye className="size-5 text-background" /></span>
  </Button>;
}
export function ReceiptPreview({ receipts, index, onIndexChange, onClose, onDownload }: {
  receipts: ReceiptMedia[]; index: number | null; onIndexChange: (index: number) => void; onClose: () => void; onDownload?: (r: ReceiptMedia) => void;
}) {
  const r = index === null ? undefined : receipts[index];
  const state = useReceiptUrl(r);
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (!r || downloading || !state?.url) return;
    setDownloading(true);
    try {
      const response = await fetch(state.url);
      if (!response.ok) throw new Error("Receipt download failed");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a"); a.href = url; a.download = r.name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      onDownload?.(r);
    } catch { toast.error("Receipt could not be downloaded."); }
    finally { setDownloading(false); }
  };
  return <Dialog open={!!r} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex h-[min(88dvh,900px)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-lg border-border bg-card p-0 sm:p-0">
      <DialogHeader className="expense-drawer-header h-24 shrink-0 border-b border-border px-4 py-4 pr-12 text-left sm:px-5 sm:pr-12">
        <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-brand/20 bg-brand/10 text-brand"><Paperclip className="size-4" /></span><div className="min-w-0 flex-1"><DialogTitle className="truncate text-[13px] font-bold">Receipt · {r?.name}</DialogTitle>
        <DialogDescription className="mt-1 line-clamp-2 break-words text-[11.5px] [overflow-wrap:anywhere]">{r?.caption}</DialogDescription></div></div></DialogHeader>
      <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-muted/50">
        {!state ? <div className="grid h-40 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          : state.error ? <p role="alert" className="p-8 text-center text-destructive">Receipt preview could not be loaded.</p>
          : r?.isPdf ? <iframe title={r.name} src={state.url} className="absolute inset-0 h-full w-full border-0 bg-card" />
          : r && /\.(heic|heif)$/i.test(r.name) ? <div className="flex flex-col items-center gap-3 px-6 py-12 text-center"><ImageOff className="size-8 text-brand" /><div className="text-[13px] font-bold">HEIC preview isn't supported by browsers</div><p className="max-w-sm text-[12px] text-muted-foreground">The file is stored safely. Download it to view.</p></div>
          : <img key={state.url} src={state.url} alt={r?.name} className="absolute inset-0 h-full w-full object-contain p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200 sm:p-5" />}
      </div>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-3 sm:px-5">
        <div className="flex items-center gap-1"><Button size="icon" variant="outline" className="expense-action size-8 rounded-full hover:border-brand/30 hover:bg-brand/5 hover:text-brand" aria-label="Previous receipt" title="Previous receipt" disabled={downloading || index === null || index <= 0} onClick={() => index !== null && onIndexChange(index - 1)}><ChevronLeft className="size-4" /></Button><span className="min-w-12 text-center font-mono text-[11px] font-bold">{index === null ? 0 : index + 1} / {receipts.length}</span><Button size="icon" variant="outline" className="expense-action size-8 rounded-full hover:border-brand/30 hover:bg-brand/5 hover:text-brand" aria-label="Next receipt" title="Next receipt" disabled={downloading || index === null || index >= receipts.length - 1} onClick={() => index !== null && onIndexChange(index + 1)}><ChevronRight className="size-4" /></Button></div>
        <Button size="sm" className="expense-action h-9 w-32 gap-1.5 font-bold disabled:opacity-75" disabled={!state?.url || downloading} aria-busy={downloading} onClick={() => void download()}>{downloading ? <TestLoader tone="white" /> : <Download className="size-3.5" />}{downloading ? "Downloading" : "Download"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}