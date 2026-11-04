import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { X, FileText, Image as ImageIcon, ImageOff, Paperclip, UploadCloud, Eye, ExternalLink, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ReceiptDraft = {
  /** Already-stored attachment path, or null for a file picked just now. */
  path: string | null;
  file?: File;
  caption: string;
  name: string;
  isPdf: boolean;
};

export const MAX_RECEIPTS = 20;
export const MAX_RECEIPT_MB = 15;
export const RECEIPT_ACCEPT = ".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,image/heif,application/pdf";
const RECEIPT_EXT = /\.(jpe?g|png|heic|heif|pdf)$/i;
const RECEIPT_MIME = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"]);
const isAllowedReceipt = (f: File) => RECEIPT_EXT.test(f.name) && (!f.type || RECEIPT_MIME.has(f.type));

/**
 * Up to 20 proofs per expense, each with its own caption so the voucher and
 * the public share page can explain what every attachment is.
 */
export function ExpenseReceiptsEditor({
  receipts,
  onChange,
}: {
  receipts: ReceiptDraft[];
  onChange: (next: ReceiptDraft[]) => void;
}) {
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_RECEIPTS - receipts.length;
    if (room <= 0) {
      toast.error(`Maximum ${MAX_RECEIPTS} receipts per expense`);
      return;
    }
    const picked: ReceiptDraft[] = [];
    const all = Array.from(files);
    const rejected = all.filter((f) => !isAllowedReceipt(f));
    if (rejected.length) toast.error(`Only JPG, JPEG, PNG, HEIC or PDF files are allowed — ${rejected.length} file(s) skipped`);
    for (const f of all.filter(isAllowedReceipt).slice(0, room)) {
      if (f.size > MAX_RECEIPT_MB * 1024 * 1024) {
        toast.error(`${f.name} is larger than ${MAX_RECEIPT_MB} MB`);
        continue;
      }
      picked.push({
        path: null,
        file: f,
        caption: "Receipt",
        name: f.name,
        isPdf: f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      });
    }
    if (picked.length) onChange([...receipts, ...picked]);
  };

  const removeAt = async (idx: number) => {
    const r = receipts[idx];
    const ok = await confirmAction({
      title: "Remove this receipt?",
      description: `“${r.name}” will be removed from this expense.`,
      tone: "danger",
      confirmLabel: "Yes, remove",
    });
    if (ok) onChange(receipts.filter((_, k) => k !== idx));
  };
  const setCaption = (idx: number, type: string, note: string) =>
    onChange(receipts.map((x, k) => (k === idx ? { ...x, caption: joinCaption(type, note) } : x)));

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-inset ring-brand/20"><Paperclip className="size-3.5" /></span>
          <div>
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Receipts / proof</div>
            <div className="text-[11px] font-medium text-muted-foreground">Image or PDF · up to {MAX_RECEIPTS} files · ≤ {MAX_RECEIPT_MB} MB each</div>
          </div>
        </div>
        <span className="rounded-full bg-foreground px-2.5 py-1 font-mono text-[11px] font-bold text-background tabular-nums">{receipts.length}/{MAX_RECEIPTS}</span>
      </div>

      <div className="space-y-2">
        {receipts.map((r, idx) => {
          const { type, note } = splitCaption(r.caption);
          return (
            <div key={(r.path ?? r.name) + idx} className="flex items-start gap-3 rounded-lg border border-border bg-card p-2.5 shadow-sm transition-all animate-in fade-in slide-in-from-top-1 duration-200 hover:border-foreground/20">
              <ReceiptThumb r={r} onOpen={(url) => setPreview({ url, name: r.name })} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-bold" title={r.name}>{r.name}</span>
                  <button type="button" onClick={() => void removeAt(idx)} aria-label="Remove receipt"
                    className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border border-border text-muted-foreground transition-all hover:rotate-90 hover:border-rose-600 hover:bg-rose-600 hover:text-white active:scale-90">
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <SearchableSelect searchable={false} items={PROOF_TYPES.map((t) => ({ value: t, label: t }))}
                    value={type} onChange={(v) => setCaption(idx, v || "Receipt", note)} className="h-9" />
                  <Input value={note} onChange={(e) => setCaption(idx, type, e.target.value)}
                    placeholder="Details — e.g. bKash TrxID screenshot"
                    className="h-9 rounded-lg bg-card text-[12.5px] font-semibold shadow-sm transition-all hover:border-foreground/25 focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]" />
                </div>
              </div>
            </div>
          );
        })}

        {receipts.length < MAX_RECEIPTS && (
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            className={`group flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-all duration-200 ${
              drag ? "scale-[1.01] border-brand bg-brand/5" : "border-border bg-card hover:border-brand/50 hover:bg-brand/[0.03]"
            }`}>
            <span className={`grid size-10 place-items-center rounded-full transition-all duration-300 group-hover:-translate-y-0.5 group-hover:scale-110 ${drag ? "bg-brand text-white" : "bg-brand/10 text-brand"}`}>
              <UploadCloud className="size-5" />
            </span>
            <span className="text-[13px] font-bold">{drag ? "Drop to attach" : <>Drop files here or <span className="text-brand underline-offset-2 group-hover:underline">browse</span></>}</span>
            <span className="text-[11px] font-medium text-muted-foreground">JPG, JPEG, PNG, HEIC or PDF</span>
            <input type="file" accept={RECEIPT_ACCEPT} multiple className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl overflow-hidden p-0 sm:w-full">
          <DialogHeader className="border-b border-border px-4 py-2.5">
            <DialogTitle className="truncate pr-8 text-[13px] font-semibold">Receipt · {preview?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid place-items-center bg-muted/40 p-4">
            {preview && /\.(heic|heif)$/i.test(preview.name) ? (
              <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
                <span className="grid size-14 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-inset ring-brand/20">
                  <ImageOff className="size-6" />
                </span>
                <div className="text-[13.5px] font-bold">HEIC preview isn't supported by browsers</div>
                <p className="max-w-sm text-[12px] font-medium leading-relaxed text-muted-foreground">
                  iPhone photos (.heic) can't be shown here — the file is stored safely. Download it to view, or convert it to JPG first.
                </p>
              </div>
            ) : preview && <img src={preview.url} alt="" className="max-h-[70vh] max-w-full rounded-sm object-contain animate-in zoom-in-95 fade-in duration-200" />}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border p-3">
            <a href={preview?.url} target="_blank" rel="noreferrer noopener"
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-[12px] font-medium hover:bg-muted">
              <ExternalLink className="size-3.5" /> Open
            </a>
            <a href={preview?.url} download={preview?.name}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-700">
              <Download className="size-3.5" /> Download
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PROOF_TYPES = ["Receipt", "Invoice", "Bank slip", "Payment screenshot", "Bill", "Quotation", "Delivery note", "Other"];

function splitCaption(c: string) {
  const t = c.replace(/^\s+/, "");
  const hit = PROOF_TYPES.find((p) => t === p || t.startsWith(`${p} — `));
  if (hit) return { type: hit, note: t.slice(hit.length).replace(/^ — /, "") };
  return { type: t ? "Other" : "Receipt", note: t };
}
function joinCaption(type: string, note: string) {
  return note.trim() ? `${type} — ${note}` : type;
}

function ReceiptThumb({ r, onOpen }: { r: ReceiptDraft; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (r.isPdf) return;
    if (r.file) {
      const u = URL.createObjectURL(r.file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    if (r.path) {
      let live = true;
      void supabase.storage.from("expense-receipts").createSignedUrl(r.path, 600).then(({ data }) => {
        if (live && data?.signedUrl) setUrl(data.signedUrl);
      });
      return () => { live = false; };
    }
  }, [r.file, r.path, r.isPdf]);

  const heic = !r.isPdf && /\.(heic|heif)$/i.test(r.name);
  if (heic) {
    return (
      <button type="button" disabled={!url} onClick={() => url && onOpen(url)} aria-label={`Preview ${r.name}`}
        className="group/thumb relative grid size-16 shrink-0 cursor-pointer place-items-center rounded-lg border border-brand/25 bg-brand/[0.06] shadow-sm transition-colors hover:border-brand/50">
        <span className="flex flex-col items-center gap-1 text-brand">
          <ImageIcon className="size-5" />
          <span className="rounded bg-brand px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-widest text-white">HEIC</span>
        </span>
        {url && (
          <span className="absolute inset-0 grid place-items-center bg-foreground/45 opacity-0 transition-opacity duration-200 group-hover/thumb:opacity-100">
            <Eye className="size-5 text-white" />
          </span>
        )}
      </button>
    );
  }
  if (r.isPdf || !url) {
    return (
      <span className="grid size-16 shrink-0 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
        {r.isPdf ? <FileText className="size-6 text-rose-600" /> : <ImageIcon className="size-6" />}
      </span>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(url)} aria-label={`Preview ${r.name}`}
      className="group/thumb relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border bg-muted shadow-sm">
      <img src={url} alt="" className="size-full object-cover transition-transform duration-300 group-hover/thumb:scale-110" />
      <span className="absolute inset-0 grid place-items-center bg-foreground/45 opacity-0 transition-opacity duration-200 group-hover/thumb:opacity-100">
        <Eye className="size-5 text-white" />
      </span>
    </button>
  );
}
