import { Fragment, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  getWalletV2, reverseWalletEntry,
  type WalletEntry, type WalletBalanceV2,
} from "@/lib/wallet-ledger.functions";
import { PeriodFilter, Stat, money, periodRange, inRange, type Period } from "@/components/finance/wallet-statement";
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

/** Wallet Ledger view (bank-style). View-only for employees: balance + statement. */
export function WalletLedgerView({ userId, own, admin }: { userId?: string; own?: boolean; admin?: boolean }) {
  const qc = useQueryClient();
  const fn = useServerFn(getWalletV2);
  const q = useQuery({ queryKey: ["wallet-v2", userId ?? "me"], queryFn: () => fn({ data: userId ? { userId } : {} }), staleTime: 15_000 });
  const [p, setP] = useState<Period>("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [tf, setTf] = useState("all");

  const bal = q.data?.balances.find((b) => b.currency === "BDT") ?? q.data?.balances[0];
  const range = periodRange(p, from, to);
  const types = TYPE_FILTERS.find((t) => t[0] === tf)?.[2] ?? [];
  const rows = useMemo(() => (q.data?.entries ?? [])
    .filter((r) => inRange(r.created_at, range) && (types.length === 0 || types.includes(r.transaction_type)))
    .slice().reverse(), [q.data, range, types]);

  if (q.isLoading) return <div className="p-6 text-[12px] text-muted-foreground"><Loader2 className="mr-2 inline size-3.5 animate-spin" />Loading wallet…</div>;
  if (q.error) return <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-[12px] text-destructive">{(q.error as Error).message}</div>;
  if (!bal) return <div className="rounded-md border border-border bg-card p-4 text-[12px] text-muted-foreground">No wallet activity yet.</div>;
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

    </div>
  );
}
