import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fundLoan, fundTransfer, listFundOptions, type FundOption } from "@/lib/fund-ops.functions";

export const bdt = (n: number) => "৳ " + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function useFundOptions(enabled = true) {
  const fn = useServerFn(listFundOptions);
  return useQuery({ queryKey: ["fund-options"], queryFn: () => fn(), enabled, staleTime: 10_000 });
}

export function FundSelect({ value, onChange, funds, placeholder = "— Select fund —", exclude }: {
  value: string; onChange: (v: string) => void; funds: FundOption[]; placeholder?: string; exclude?: string;
}) {
  return (
    <select className="h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {funds.filter((f) => f.id !== exclude).map((f) => (
        <option key={f.id} value={f.id}>{f.name} · available {bdt(f.available)}</option>
      ))}
    </select>
  );
}

/** Transfer or loan form. `mode` fixed or chosen. */
export function FundMoveForm({ mode, toFundId, defaultAmount, expenseId, onDone }: {
  mode: "transfer" | "loan"; toFundId?: string; defaultAmount?: number; expenseId?: string | null; onDone?: () => void;
}) {
  const qc = useQueryClient();
  const funds = useFundOptions();
  const t = useServerFn(fundTransfer);
  const l = useServerFn(fundLoan);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(toFundId ?? "");
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [reason, setReason] = useState("");
  useEffect(() => { if (toFundId) setTo(toFundId); }, [toFundId]);
  const m = useMutation({
    mutationFn: () => {
      const p = { data: { from, to, amount: Number(amount), reason, expenseId: expenseId ?? null } };
      return mode === "transfer" ? t(p) : l(p);
    },
    onSuccess: () => {
      toast.success(mode === "transfer" ? "Transfer completed" : "Loan created");
      setAmount(""); setReason(""); setFrom("");
      void qc.invalidateQueries();
      onDone?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const list = funds.data ?? [];
  const src = list.find((f) => f.id === from);
  const over = !!src && Number(amount) > src.available;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="text-[11px] font-semibold uppercase text-muted-foreground">From fund</label><FundSelect value={from} onChange={setFrom} funds={list} exclude={to} /></div>
        <div><label className="text-[11px] font-semibold uppercase text-muted-foreground">To fund</label><FundSelect value={to} onChange={setTo} funds={list} exclude={from} /></div>
        <div><label className="text-[11px] font-semibold uppercase text-muted-foreground">Amount (BDT)</label><Input type="number" className="h-9 font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label className="text-[11px] font-semibold uppercase text-muted-foreground">Reason</label><Input className="h-9" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Min 5 characters" /></div>
      </div>
      {over && <p className="text-[12px] font-medium text-destructive">Amount is above the source fund's available balance ({bdt(src!.available)}).</p>}
      <Button disabled={!from || !to || from === to || !(Number(amount) > 0) || reason.trim().length < 5 || over || m.isPending} onClick={() => m.mutate()}>
        {mode === "transfer" ? "Transfer permanently" : "Create loan"}
      </Button>
    </div>
  );
}

export function InsufficientFundDialog({ info, fundId, fundName, onClose }: {
  info: { required: number; available: number; shortfall: number } | null; fundId: string; fundName?: string; onClose: () => void;
}) {
  const [mode, setMode] = useState<"transfer" | "loan" | null>(null);
  useEffect(() => { if (!info) setMode(null); }, [info]);
  return (
    <Dialog open={!!info} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-4" /> Insufficient Fund Balance</DialogTitle></DialogHeader>
        {info && (
          <div className="space-y-3 text-[13px]">
            {fundName && <p className="text-muted-foreground">{fundName}</p>}
            <div className="space-y-1 rounded-sm border border-border bg-muted/40 p-3 font-mono">
              <div className="flex justify-between"><span>Required</span><span>{bdt(info.required)}</span></div>
              <div className="flex justify-between"><span>Available</span><span>{bdt(info.available)}</span></div>
              <div className="flex justify-between font-bold text-destructive"><span>Shortfall</span><span>{bdt(info.shortfall)}</span></div>
            </div>
            {!mode && (
              <div className="grid gap-2 sm:grid-cols-3">
                <Button variant="outline" onClick={() => setMode("transfer")}>Transfer from another fund</Button>
                <Button variant="outline" onClick={() => setMode("loan")}>Borrow from another fund</Button>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
              </div>
            )}
            {mode && (
              <>
                <FundMoveForm mode={mode} toFundId={fundId} defaultAmount={Math.ceil(info.shortfall)} onDone={() => { toast.message("Now save the expense again."); onClose(); }} />
                <Button variant="ghost" size="sm" onClick={() => setMode(null)}>Back</Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
