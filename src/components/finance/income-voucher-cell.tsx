import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ReceiptText, Eye, Printer, Download, Stamp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createIncomeVoucher,
  getSignedIncomeVoucherUrl,
  getIncomeVoucherFileUrl,
  setIncomeVoucherSigned,
  type IncomeVoucherRow,
} from "@/lib/income-vouchers.functions";
import type { ReportRow } from "@/lib/finance-reports.functions";

const BUCKET = "expense-receipts";
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const MAX_MB = 15;

async function uploadSealed(file: File) {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id ?? "anon";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `income-signed/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Money receipt (income voucher) actions for one income row: generate the
 * numbered receipt, view / print it, and upload the signed & sealed copy back.
 */
export function IncomeVoucherCell({
  row,
  voucher,
  onChanged,
}: {
  row: ReportRow;
  voucher: IncomeVoucherRow | undefined;
  onChanged: () => void;
}) {
  const create = useServerFn(createIncomeVoucher);
  const signedUrl = useServerFn(getSignedIncomeVoucherUrl);
  const fileUrl = useServerFn(getIncomeVoucherFileUrl);
  const setSigned = useServerFn(setIncomeVoucherSigned);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const generate = () =>
    guard(async () => {
      const v = await create({
        data: {
          source: row.source === "ledger" ? "ledger" : "installment",
          source_id: row.id,
          invoice_id: row.invoiceId,
          customer_id: row.clientId,
          party: row.party,
          project: row.project,
          category: row.category || "Invoice payment",
          currency: row.currency,
          amount: Math.abs(row.amount),
          received_on: row.date,
          payment_method: row.method === "—" ? null : row.method,
          txn_id: null,
          notes: row.notes || null,
        },
      });
      toast.success(`Money receipt ${v.voucher_no ?? ""} ready`);
      onChanged();
    });

  const open = (mode: "digital" | "print") =>
    guard(async () => {
      if (!voucher) return;
      const res = await signedUrl({ data: { id: voucher.id, mode } });
      window.open(res.url, "_blank", "noopener");
    });

  const openSealed = (download: boolean) =>
    guard(async () => {
      if (!voucher) return;
      const res = await fileUrl({ data: { id: voucher.id, download } });
      window.open(res.url, "_blank", "noopener");
    });

  const pick = (file: File | undefined) =>
    guard(async () => {
      if (!file || !voucher) return;
      if (file.size > MAX_MB * 1024 * 1024) throw new Error(`File must be under ${MAX_MB} MB`);
      const path = await uploadSealed(file);
      await setSigned({ data: { id: voucher.id, path } });
      toast.success("Signed & sealed copy uploaded — Accounts notified");
      onChanged();
    });

  if (row.type !== "income") return <span className="text-muted-foreground">—</span>;

  if (!voucher) {
    return (
      <Button
        variant="outline" size="sm" className="h-7 rounded-sm text-[11px]"
        disabled={busy} onClick={generate}
      >
        {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : <ReceiptText className="mr-1 size-3" />}
        Receipt
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={fileRef} type="file" accept={ACCEPT} className="hidden"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 rounded-sm font-mono text-[11px]" disabled={busy}>
            {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : <ReceiptText className="mr-1 size-3" />}
            {voucher.voucher_no ?? "Receipt"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void open("digital"); }}>
            <Eye className="mr-2 size-3.5" /> View receipt PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void open("print"); }}>
            <Printer className="mr-2 size-3.5" /> Print on letterhead
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); fileRef.current?.click(); }}>
            <Stamp className="mr-2 size-3.5" /> Upload signed &amp; sealed copy
          </DropdownMenuItem>
          {voucher.signed_voucher_url && (
            <>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void openSealed(false); }}>
                <Eye className="mr-2 size-3.5" /> View sealed copy
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void openSealed(true); }}>
                <Download className="mr-2 size-3.5" /> Download sealed copy
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {voucher.signed_voucher_url && (
        <span title="Signed copy on file" className="rounded-[3px] bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
          sealed
        </span>
      )}
    </div>
  );
}
