import { Fragment, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";
import {
  getWalletV2, requestWalletWithdrawal, setWalletWithdrawalStatus, reverseWalletEntry,
  type WalletEntry, type WalletBalanceV2,
} from "@/lib/wallet-ledger.functions";
import { getMyProfile, type PaymentMethod } from "@/lib/profile.functions";
import { PeriodFilter, Stat, money, periodRange, inRange, WalletStatement, type Period } from "@/components/finance/wallet-statement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const TYPE_LABEL: Record<string, string> = {
  project_earning: "Project Earning", salary: "Salary", bonus: "Bonus", incentive: "Incentive", commission: "Commission",
  overtime: "Overtime", adjustment_credit: "Adjustment (+)", adjustment_debit: "Adjustment (−)", withdrawal: "Withdrawal",
  refund: "Refund", migration_opening_balance: "Opening Balance", correction: "Correction", reversal: "Reversal",
};
const TYPE_FILTERS: [string, string, string[]][] = [
  ["all", "All types", []], ["project_earning", "Project Earning", ["project_earning"]], ["salary", "Salary", ["salary"]],
  ["bonus", "Bonus", ["bonus", "incentive", "overtime"]], ["commission", "Commission", ["commission"]], ["withdrawal", "Withdrawal", ["withdrawal"]],
  ["adjustment", "Adjustment", ["adjustment_credit", "adjustment_debit", "correction", "reversal"]], ["other", "Other", ["refund", "migration_opening_balance"]],
];

export function WalletEntriesTable({ rows, showEmployee, nameOf, canReverse }: {
  rows: WalletEntry[]; showEmployee?: boolean; nameOf?: (id: string) => string; canReverse?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const qc = useQueryClient();
  const rev = useServerFn(reverseWalletEntry);
  const doRev = useMutation({
    mutationFn: async (id: string) => {
      const reason = window.prompt("Reason for reversal (at least 5 characters)")?.trim();
      if (!reason) throw new Error("Cancelled");
      await rev({ data: { id, reason } });
    },
    onSuccess: () => { toast.success("Reversal posted"); void qc.invalidateQueries({ queryKey: ["wallet-v2"] }); void qc.invalidateQueries({ queryKey: ["wallets-overview"] }); },
    onError: (e) => { if ((e as Error).message !== "Cancelled") toast.error((e as Error).message); },
  });
  const reversed = new Set(rows.filter((r) => r.reverses_id).map((r) => r.reverses_id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-[12px]">
        <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Date</th>{showEmployee && <th className="px-3 py-2">Employee</th>}
            <th className="px-3 py-2">Description</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Project</th>
            <th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Installment</th><th className="px-3 py-2">Task</th><th className="px-3 py-2">Type</th>
            <th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Balance</th>
            <th className="px-3 py-2">Status</th><th className="px-3 py-2">Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={14} className="px-3 py-10 text-center text-muted-foreground">No wallet transactions for this filter.</td></tr>
          ) : rows.map((r) => (
            <Fragment key={r.id}>
              <tr className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}</td>
                {showEmployee && <td className="px-3 py-2">{nameOf?.(r.employee_id)}</td>}
                <td className="px-3 py-2">{r.description ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.client ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.project ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-brand">{r.invoice_slug ? <Link to="/app/finance/invoices/$slug" params={{ slug: r.invoice_slug }} onClick={(e) => e.stopPropagation()}>{r.invoice_slug}</Link> : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.installment ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.task ?? "—"}</td>
                <td className="px-3 py-2">{TYPE_LABEL[r.transaction_type] ?? r.transaction_type}</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-700">{r.credit ? money(r.credit, r.currency) : ""}</td>
                <td className="px-3 py-2 text-right font-mono text-rose-700">{r.debit ? money(r.debit, r.currency) : ""}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{money(r.balance, r.currency)}</td>
                <td className="px-3 py-2 capitalize">{reversed.has(r.id) ? "reversed" : r.status}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.reference ?? "—"}</td>
              </tr>
              {open === r.id && (
                <tr className="bg-muted/30"><td colSpan={14} className="px-4 py-3 text-[11.5px]">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span>Source: <b>{r.source_type.replace(/_/g, " ")}</b></span>
                    <span className="font-mono">ID: {r.source_id}</span>
                    <span className="font-mono">Entry: {r.id}</span>
                    {r.reverses_id && <span className="font-mono">Reverses: {r.reverses_id}</span>}
                    {canReverse && !reversed.has(r.id) && !["reversal", "withdrawal"].includes(r.transaction_type) && (
                      <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px]" disabled={doRev.isPending}
                        onClick={(e) => { e.stopPropagation(); doRev.mutate(r.id); }}>Post reversal</Button>
                    )}
                  </div>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** New Wallet Ledger view (bank-style). `own` enables withdrawal requests. */
export function WalletLedgerView({ userId, own, admin }: { userId?: string; own?: boolean; admin?: boolean }) {
  const qc = useQueryClient();
  const fn = useServerFn(getWalletV2);
  const q = useQuery({ queryKey: ["wallet-v2", userId ?? "me"], queryFn: () => fn({ data: userId ? { userId } : {} }), staleTime: 15_000 });
  const [p, setP] = useState<Period>("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [tf, setTf] = useState("all");
  const [modal, setModal] = useState<WalletBalanceV2 | null>(null);

  const bal = q.data?.balances.find((b) => b.currency === "BDT") ?? q.data?.balances[0];
  const range = periodRange(p, from, to);
  const types = TYPE_FILTERS.find((t) => t[0] === tf)?.[2] ?? [];
  const rows = useMemo(() => (q.data?.entries ?? [])
    .filter((r) => inRange(r.created_at, range) && (types.length === 0 || types.includes(r.transaction_type)))
    .slice().reverse(), [q.data, range, types]);

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["wallet-v2"] }); void qc.invalidateQueries({ queryKey: ["wallets-overview"] }); };
  const setStatus = useServerFn(setWalletWithdrawalStatus);
  const cancel = useMutation({
    mutationFn: (id: string) => setStatus({ data: { id, status: "cancelled" } }),
    onSuccess: () => { toast.success("Withdrawal cancelled"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return <div className="p-6 text-[12px] text-muted-foreground"><Loader2 className="mr-2 inline size-3.5 animate-spin" />Loading wallet…</div>;
  if (q.error) return <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-[12px] text-destructive">{(q.error as Error).message}</div>;
  if (!bal?.migrated) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          This wallet has not been moved to the new Wallet Ledger yet. Figures below come from the legacy wallet.
        </div>
        <WalletStatement userId={userId} />
      </div>
    );
  }
  const cur = bal.currency;
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Available balance</div>
            <div className="mt-0.5 font-mono text-[24px] font-semibold text-emerald-600">{money(bal.available, cur)}</div>
            {bal.holds > 0 && <div className="text-[11px] text-muted-foreground">Ledger {money(bal.ledger_balance, cur)} · on hold for withdrawals {money(bal.holds, cur)}</div>}
          </div>
          {own && (
            <Button onClick={() => setModal(bal)} disabled={bal.available <= 0} className="h-9 rounded-sm">
              <Send className="mr-1.5 size-3.5" /> Request withdrawal
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Pending / Committed" value={money(bal.pending_committed, cur)} tone="muted" />
          <Stat label="Today earned" value={money(bal.today_earned, cur)} />
          <Stat label="This week" value={money(bal.week_earned, cur)} />
          <Stat label="This month" value={money(bal.month_earned, cur)} />
          <Stat label="Total earned" value={money(bal.total_earned, cur)} tone="brand" />
          <Stat label="Total withdrawn" value={money(bal.total_withdrawn, cur)} />
        </div>
        {bal.legacy_pending > 0 && (
          <div className="border-t border-border px-5 py-2 text-[11.5px] text-muted-foreground">
            Legacy Pending (not available): <span className="font-mono">{money(bal.legacy_pending, cur)}</span> — Finance will review these items.
          </div>
        )}
      </div>

      <section className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h3 className="text-[13px] font-semibold">Wallet statement</h3>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter p={p} setP={setP} from={from} to={to} setFrom={setFrom} setTo={setTo} />
            <select value={tf} onChange={(e) => setTf(e.target.value)} className="h-7 rounded-sm border border-input bg-background px-1.5 text-[11.5px]">
              {TYPE_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <WalletEntriesTable rows={rows} canReverse={admin} />
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5"><h3 className="text-[13px] font-semibold">Withdrawals</h3></div>
        <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Requested</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2 text-right" /></tr>
          </thead>
          <tbody>
            {(q.data?.withdrawals ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No withdrawals yet.</td></tr>
            ) : q.data!.withdrawals.map((w) => (
              <tr key={w.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{new Date(w.requested_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">{money(w.amount, w.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground">{w.payment_method_snapshot?.label ?? "—"} {w.payment_method_snapshot?.account ? `· ${w.payment_method_snapshot.account}` : ""}</td>
                <td className="px-3 py-2 capitalize">{w.status}{w.admin_note && w.status === "rejected" ? ` — ${w.admin_note}` : ""}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{w.transfer_ref ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {own && w.status === "requested" && (
                    <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px]" disabled={cancel.isPending} onClick={() => cancel.mutate(w.id)}>
                      <X className="mr-1 size-3" /> Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <details className="rounded-md border border-border bg-card">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold">Legacy Wallet History <span className="ml-1 rounded-sm border border-border px-1 text-[10px] uppercase text-muted-foreground">Legacy · read-only</span></summary>
        <div className="border-t border-border p-3">
          <p className="mb-2 text-[11.5px] text-muted-foreground">Old payouts and withdrawals before the move. Their closing balance is already included in the Opening Balance entry above.</p>
          <WalletStatement userId={userId} />
        </div>
      </details>

      {modal && <WithdrawModal bal={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); invalidate(); }} />}
    </div>
  );
}

function WithdrawModal({ bal, onClose, onDone }: { bal: WalletBalanceV2; onClose: () => void; onDone: () => void }) {
  const profile = useServerFn(getMyProfile);
  const prof = useQuery({ queryKey: ["me", "profile"], queryFn: () => profile(), staleTime: 60_000 });
  const methods: PaymentMethod[] = prof.data?.profile.payment_methods ?? [];
  const [amount, setAmount] = useState(""); const [methodId, setMethodId] = useState("");
  const req = useServerFn(requestWalletWithdrawal);
  const m = useMutation({
    mutationFn: async () => {
      const pm = methods.find((x) => x.id === methodId);
      await req({ data: {
        amount: Number(amount), currency: bal.currency, payment_method_id: methodId || null,
        payment_method_snapshot: pm ? {
          kind: pm.kind, label: pm.kind === "bank" ? (pm.bank_name ?? "Bank") : (pm.mfs_provider ?? "MFS"),
          account: pm.kind === "bank" ? (pm.account_number ?? "") : (pm.mfs_number ?? ""),
          bank_name: pm.bank_name ?? null, account_holder: pm.account_holder ?? null, account_number: pm.account_number ?? null,
          branch: pm.branch ?? null, mfs_provider: pm.mfs_provider ?? null, mfs_number: pm.mfs_number ?? null,
        } : null,
      } });
    },
    onSuccess: () => { toast.success("Withdrawal requested"); onDone(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const over = Number(amount) > bal.available;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[14px] font-semibold">Request withdrawal ({bal.currency})</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">Available: <span className="font-mono font-semibold text-emerald-600">{money(bal.available, bal.currency)}</span></p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Amount</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn("mt-1 h-9 rounded-sm font-mono", over && "border-destructive")} placeholder="0.00" />
            {over && <p className="mt-1 text-[11px] text-destructive">Above your available balance.</p>}
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Payment method</label>
            {methods.length === 0 ? (
              <div className="mt-1 rounded-sm border border-dashed border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">Add a bank / MFS account in your profile first.</div>
            ) : (
              <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                <option value="">— Choose —</option>
                {methods.map((x) => <option key={x.id} value={x.id}>{x.kind === "bank" ? `${x.bank_name ?? "Bank"} · ${x.account_number ?? ""}` : `${x.mfs_provider ?? "MFS"} · ${x.mfs_number ?? ""}`}{x.is_primary ? " ★" : ""}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="h-9 rounded-sm">Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !amount || !methodId || over || Number(amount) <= 0} className="h-9 rounded-sm">
            {m.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}Request
          </Button>
        </div>
      </div>
    </div>
  );
}
