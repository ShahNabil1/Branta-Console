import { useState } from "react";
import { Input } from "@/components/ui/input";
import { X, Paperclip, UploadCloud } from "lucide-react";
import { ReceiptThumb, ReceiptPreview } from "./receipt-media";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { confirmAction } from "@/components/ui/confirm-dialog";
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
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
              <ReceiptThumb r={r} onOpen={() => setPreviewIndex(idx)} />
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

      <ReceiptPreview receipts={receipts} index={previewIndex} onIndexChange={setPreviewIndex} onClose={() => setPreviewIndex(null)} />
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
