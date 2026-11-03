import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownLeft, ArrowUpRight, Download, HandCoins, Info, Landmark, Loader2, Search, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCompanyFundConfig, getCompanyWallet, requestCompanyLoan } from "@/lib/company-wallet.functions";
import { cn } from "@/lib/utils";

const bdt = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;
const STATUS: Record<string, string> = {
  pending: "text-status-contacted", approved: "text-status-converted", rejected: "text-destructive", cancelled: "text-muted-foreground",
};

export function CompanyWallet({ companyId, companyName, accent }: { companyId: string; companyName: string; accent: string }) {
  const walletFn = useServerFn(getCompanyWallet);
  const cfgFn = useServerFn(getCompanyFundConfig);
  const w = useQuery({ queryKey: ["company-wallet", companyId], queryFn: () => walletFn({ data: { companyId, limit: 500 } }) });
  const cfg = useQuery({ queryKey: ["company-fund-config", companyId], queryFn: () => cfgFn({ data: { companyId } }) });
  const [q, setQ] = useState("");
  const [loanOpen, setLoanOpen] = useState(false);

  const labels = useMemo(() => {
    const m = new Map<string, { label: string; sort: number }>();
    for (const c of [...(cfg.data?.history ?? [])].reverse())
      for (const b of (c as any).company_fund_buckets ?? []) m.set(b.key, { label: b.label, sort: b.sort });
    return m;
  }, [cfg.data]);
  const name = (k: string) => labels.get(k)?.label ?? k.replace(/_/g, " ");

  const buckets = useMemo(() => {
    const bal = new Map<string, number>((w.data?.buckets ?? []).map((b: any) => [b.bucket_key as string, Number(b.balance)]));
    const active = ((cfg.data?.active as any)?.company_fund_buckets ?? []) as any[];
    const keys = new Set<string>([...active.map((b) => b.key), ...bal.keys()]);
    return [...keys]
      .map((k) => ({ key: k, label: name(k), balance: bal.get(k) ?? 0, sort: labels.get(k)?.sort ?? 999 }))
      .sort((a, b) => a.sort - b.sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.data, cfg.data, labels]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = (w.data?.statement ?? []) as any[];
    return s ? all.filter((r) => `${r.description} ${r.record_ref} ${name(r.bucket_key)}`.toLowerCase().includes(s)) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.data, q, labels]);

  const totals = useMemo(() => {
    let inn = 0, out = 0;
    for (const r of (w.data?.statement ?? []) as any[]) {
      if (r.entry_type === "movement") continue;
      if (r.direction === "credit") inn += Number(r.amount); else out += Number(r.amount);
    }
    return { inn, out };
  }, [w.data]);

  const exportCsv = () => {
    const head = ["Date", "Description", "Record", "Fund", "In", "Out", "Balance"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [...rows].reverse().map((r: any) => [
      new Date(r.occurred_at).toISOString().slice(0, 10), r.description, r.record_ref, name(r.bucket_key),
      r.direction === "credit" ? r.amount : "", r.direction === "debit" ? r.amount : "", r.running_balance,
    ].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${companyName.replace(/\s+/g, "-").toLowerCase()}-wallet-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (w.isLoading) return <div className="grid h-48 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (w.error) return <div className="rounded border border-destructive/30 bg-destructive/5 p-4 text-[13px] text-destructive">{(w.error as Error).message}</div>;
  const total = w.data?.total ?? 0;
  const pending = (w.data?.loans ?? []).filter((l: any) => l.status === "pending").length;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-md border border-border bg-card p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Wallet className="size-3.5" style={{ color: accent }} /> Total wallet balance
            </div>
            <div className="mt-1.5 font-mono text-[32px] font-semibold tabular-nums tracking-tight">{bdt(total)}</div>
            <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ArrowDownLeft className="size-3.5 text-status-converted" /> In <b className="font-mono text-foreground">{bdt(totals.inn)}</b></span>
              <span className="inline-flex items-center gap-1"><ArrowUpRight className="size-3.5 text-destructive" /> Out <b className="font-mono text-foreground">{bdt(totals.out)}</b></span>
              {pending > 0 && <span className="inline-flex items-center gap-1"><HandCoins className="size-3.5" /> {pending} loan request pending</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="size-3.5" /> Export statement</Button>
            <Button size="sm" onClick={() => setLoanOpen(true)}><HandCoins className="size-3.5" /> Request loan</Button>
          </div>
        </div>
      </section>

      {buckets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card p-6 text-center text-[13px] text-muted-foreground">
          No funds configured yet. Set up Fund Allocation in Settings to start receiving paid installments here.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {buckets.map((b) => {
            const pct = total > 0 ? Math.max(0, (b.balance / total) * 100) : 0;
            return (
              <div key={b.key} className="group rounded-md border border-border bg-card p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm">
                <div className="truncate text-[12px] font-medium text-muted-foreground">{b.label}</div>
                <div className={cn("mt-1 font-mono text-[17px] font-semibold tabular-nums", b.balance < 0 && "text-destructive")}>{bdt(b.balance)}</div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: accent }} />
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">{pct.toFixed(1)}% of wallet</div>
              </div>
            );
          })}
        </div>
      )}

      <section className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="text-[13px] font-semibold">Statement <span className="ml-1 font-mono text-[11px] font-normal text-muted-foreground">{rows.length}</span></div>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, record…" className="h-8 pl-7 text-[12px]" />
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted-foreground">No wallet entries yet. Paid installments and expenses will appear here.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  {["Date", "Description", "Record", "Fund", "In", "Out", "Balance"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2 font-medium", i >= 4 ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className={cn("border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40", r.reverses_id && "text-muted-foreground")}>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[11.5px]">{new Date(r.occurred_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-2">{r.description}{r.reverses_id && <span className="ml-1.5 rounded border border-border px-1 text-[10px]">reversal</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[11.5px]">{r.record_ref ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2">{name(r.bucket_key)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-status-converted">{r.direction === "credit" ? bdt(Number(r.amount)) : ""}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-destructive">{r.direction === "debit" ? bdt(Number(r.amount)) : ""}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium tabular-nums">{bdt(Number(r.running_balance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(w.data?.loans ?? []).length > 0 && (
        <section className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">Loan requests</div>
          <div className="divide-y divide-border/60">
            {(w.data?.loans ?? []).map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[12.5px]">
                <div className="min-w-0">
                  <div className="truncate">{l.purpose}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(l.created_at).toLocaleDateString("en-GB")}{l.tenure_months ? ` · ${l.tenure_months} months` : ""}{l.decision_note ? ` · ${l.decision_note}` : ""}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold">{bdt(Number(l.amount))}</span>
                  <span className={cn("text-[11px] font-semibold capitalize", STATUS[l.status])}>{l.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3.5 py-2.5 text-[12px] text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        This view shows only the company wallet — not real account (bank, bKash) balances. All real accounts are held by Branta Tech.
      </div>

      <LoanDialog open={loanOpen} onClose={() => setLoanOpen(false)} companyId={companyId} companyName={companyName} />
    </div>
  );
}

function LoanDialog({ open, onClose, companyId, companyName }: { open: boolean; onClose: () => void; companyId: string; companyName: string }) {
  const fn = useServerFn(requestCompanyLoan);
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [tenure, setTenure] = useState("");
  const [busy, setBusy] = useState(false);
  const amt = Number(amount);
  const valid = amt > 0 && purpose.trim().length >= 3;

  const submit = async () => {
    setBusy(true);
    try {
      await fn({ data: { companyId, amount: amt, purpose: purpose.trim(), tenureMonths: tenure ? Number(tenure) : null } });
      toast.success("Loan request sent to Branta Tech Finance");
      qc.invalidateQueries({ queryKey: ["company-wallet", companyId] });
      setAmount(""); setPurpose(""); setTenure(""); onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Landmark className="size-4" /> Request loan</DialogTitle>
          <DialogDescription>{companyName} asks Branta Tech for funds. The wallet is credited only after Finance approves.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[12px] font-medium text-muted-foreground">Amount (BDT)</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="50000" className="mt-1 font-mono" />
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-muted-foreground">Purpose</span>
            <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} maxLength={500}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="What the funds are for" />
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-muted-foreground">Repayment period (months, optional)</span>
            <Input inputMode="numeric" value={tenure} onChange={(e) => setTenure(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="6" className="mt-1 font-mono" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy || (!!tenure && (Number(tenure) < 1 || Number(tenure) > 60))}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
