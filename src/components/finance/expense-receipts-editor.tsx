import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, Image as ImageIcon } from "lucide-react";
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
export const RECEIPT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

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
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_RECEIPTS - receipts.length;
    if (room <= 0) {
      toast.error(`Maximum ${MAX_RECEIPTS} receipts per expense`);
      return;
    }
    const picked: ReceiptDraft[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (f.size > MAX_RECEIPT_MB * 1024 * 1024) {
        toast.error(`${f.name} is larger than ${MAX_RECEIPT_MB} MB`);
        continue;
      }
      picked.push({
        path: null,
        file: f,
        caption: "",
        name: f.name,
        isPdf: f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      });
    }
    if (picked.length) onChange([...receipts, ...picked]);
  };

  return (
    <div>
      <label className="text-[11px] font-semibold uppercase text-muted-foreground">
        Receipts / proof{" "}
        <span className="font-normal normal-case text-muted-foreground/70">
          (up to {MAX_RECEIPTS} files, image or PDF, ≤ {MAX_RECEIPT_MB} MB each)
        </span>
      </label>

      <div className="mt-1 space-y-1.5">
        {receipts.map((r, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-sm border border-input bg-background px-2 py-1.5">
            {r.isPdf ? <FileText className="size-3.5 shrink-0" /> : <ImageIcon className="size-3.5 shrink-0" />}
            <span className="w-32 shrink-0 truncate text-[11.5px] text-muted-foreground sm:w-44">{r.name}</span>
            <Input
              value={r.caption}
              onChange={(e) =>
                onChange(receipts.map((x, k) => (k === idx ? { ...x, caption: e.target.value } : x)))
              }
              placeholder="Caption — what is this proof?"
              className="h-7 rounded-sm text-[12px]"
            />
            <Button
              size="sm" variant="ghost" className="h-7 shrink-0 rounded-sm px-1.5 text-rose-600 hover:bg-rose-50"
              onClick={() => onChange(receipts.filter((_, k) => k !== idx))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}

        {receipts.length < MAX_RECEIPTS && (
          <label className="flex h-16 cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-input bg-background text-[12px] text-muted-foreground hover:border-primary hover:text-primary">
            <Upload className="size-3.5" />
            <span>Click to add receipts ({receipts.length}/{MAX_RECEIPTS})</span>
            <input
              type="file" accept={RECEIPT_ACCEPT} multiple className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
