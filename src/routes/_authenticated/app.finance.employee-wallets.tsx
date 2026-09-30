import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  getWalletsOverview, getMigrationPreview, migrateWallet, getWalletReconciliation, listAllWalletWithdrawals,
  setWalletWithdrawalStatus, postWalletEntry, legacyPendingAction, type MigrationPreviewRow,
} from "@/lib/wallet-ledger.functions";
import { WalletLedgerView, WalletEntriesTable, TYPE_LABEL } from "@/components/finance/wallet-ledger-view";
import { PeriodFilter, Stat, money, periodRange, inRange, type Period } from "@/components/finance/wallet-statement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/finance/employee-wallets")({
  head: () => ({
    meta: [
      { title: "Employee Wallets · Branta Console" },
      { name: "description", content: "Unified employee wallet ledger: balances, statements, withdrawals, migration and reconciliation." },
      { property: "og:title", content: "Employee Wallets · Branta Console" },
      { property: "og:description", content: "Unified employee wallet ledger: balances, statements, withdrawals, migration and reconciliation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "wallets" | "withdrawals" | "migration" | "reconciliation" | "entry";
const TABS: [Tab, string][] = [["wallets", "Wallets"], ["withdrawals", "Withdrawals"], ["migration", "Migration"], ["reconciliation", "Reconciliation"], ["entry", "Post entry"]];

function Page() {
  const [tab, setTab] = useState<Tab>("wallets");
  const fn = useServerFn(getWalletsOverview);
  const q = useQuery({ queryKey: ["wallets-overview"], queryFn: () => fn(), staleTime: 20_000 });
  const emps = q.data?.employees ?? [];
  const nameOf = (id: string) => emps.find((e) => e.user_id === id)?.name ?? "Unknown";
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-[16px] font-semibold">Employee Wallets</h1>
        <p className="text-[12px] text-muted-foreground">One wallet per employee. Balances are always calculated from wallet entries.</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-3 py-2 text-[12.5px]", tab === k ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {q.error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[12px] text-destructive">{(q.error as Error).message}</div>}
      {tab === "wallets" && <WalletsTab data={q.data} loading={q.isLoading} nameOf={nameOf} />}
      {tab === "withdrawals" && <WithdrawalsTab nameOf={nameOf} />}
      {tab === "migration" && <MigrationTab />}
      {tab === "reconciliation" && <ReconTab nameOf={nameOf} committed={q.data?.employeeFundCommitted ?? 0} />}
      {tab === "entry" && <EntryTab emps={emps.filter((e) => q.data?.balances.some((b) => b.employee_id === e.user_id && b.migrated))} />}
    </div>
  );
}

function WalletsTab({ data, loading, nameOf }: { data: any; loading: boolean; nameOf: (id: string) => string }) {
  const [sel, setSel] = useState<string | null>(null);
  const [p, setP] = useState<Period>("all"); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [emp, setEmp] = useState(""); const [proj, setProj] = useState(""); const [client, setClient] = useState(""); const [type, setType] = useState("");
  if (loading) return <Loader2 className="size-4 animate-spin" />;
  if (sel) return (
    <div className="space-y-3">
      <Button variant="ghost" className="h-8 rounded-sm text-[12px]" onClick={() => setSel(null)}><ArrowLeft className="mr-1 size-3.5" /> All wallets · {nameOf(sel)}</Button>
      <WalletLedgerView userId={sel} admin />
    </div>
  );
  const balances = (data?.balances ?? []) as any[];
  const entries = (data?.entries ?? []) as any[];
  const migrated = balances.filter((b) => b.migrated);
  const sum = (k: string) => migrated.reduce((a, b) => a + Number(b[k]), 0);
  const range = periodRange(p, from, to);
  const filtered = entries.filter((e) => inRange(e.created_at, range) && (!emp || e.employee_id === emp) && (!proj || e.project === proj) && (!client || e.client === client) && (!type || e.transaction_type === type)).slice().reverse();
  const projects = Array.from(new Set(entries.map((e) => e.project).filter(Boolean))) as string[];
  const clients = Array.from(new Set(entries.map((e) => e.client).filter(Boolean))) as string[];
  const sel_ = "h-7 rounded-sm border border-input bg-background px-1.5 text-[11.5px]";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Wallet liability" value={money(sum("ledger_balance"))} tone="brand" />
        <Stat label="Total available" value={money(sum("available"))} />
        <Stat label="Total pending" value={money(sum("pending_committed"))} tone="muted" />
        <Stat label="Total earned" value={money(sum("total_earned"))} />
        <Stat label="Total withdrawn" value={money(sum("total_withdrawn"))} />
        <Stat label="Employee Fund committed" value={money(data?.employeeFundCommitted ?? 0)} tone="muted" />
      </div>
      <section className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[900px] text-[12px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Wallet</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Today</th><th className="px-3 py-2 text-right">This week</th><th className="px-3 py-2 text-right">This month</th><th className="px-3 py-2 text-right">Total earned</th><th className="px-3 py-2 text-right">Withdrawn</th></tr>
          </thead>
          <tbody>
            {balances.sort((a, b) => Number(b.migrated) - Number(a.migrated) || nameOf(a.employee_id).localeCompare(nameOf(b.employee_id))).map((b) => (
              <tr key={b.employee_id + b.currency} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setSel(b.employee_id)}>
                <td className="px-3 py-2 font-medium">{nameOf(b.employee_id)}</td>
                <td className="px-3 py-2">{b.migrated ? <span className="text-emerald-700">New ledger</span> : <span className="text-amber-700">Legacy</span>}</td>
                <td className="px-3 py-2 text-right font-mono">{money(b.available, b.currency)}</td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{money(b.pending_committed + b.legacy_pending, b.currency)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(b.today_earned, b.currency)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(b.week_earned, b.currency)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(b.month_earned, b.currency)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(b.total_earned, b.currency)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(b.total_withdrawn, b.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <h3 className="mr-auto text-[13px] font-semibold">All wallet transactions</h3>
          <PeriodFilter p={p} setP={setP} from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <select className={sel_} value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">All employees</option>{migrated.map((b) => <option key={b.employee_id} value={b.employee_id}>{nameOf(b.employee_id)}</option>)}</select>
          <select className={sel_} value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{clients.map((c) => <option key={c}>{c}</option>)}</select>
          <select className={sel_} value={proj} onChange={(e) => setProj(e.target.value)}><option value="">All projects</option>{projects.map((c) => <option key={c}>{c}</option>)}</select>
          <select className={sel_} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <WalletEntriesTable rows={filtered} showEmployee nameOf={nameOf} canReverse />
      </section>
    </div>
  );
}

function WithdrawalsTab({ nameOf }: { nameOf: (id: string) => string }) {
  const qc = useQueryClient();
  const fn = useServerFn(listAllWalletWithdrawals);
  const q = useQuery({ queryKey: ["wallet-v2", "withdrawals"], queryFn: () => fn() });
  const set = useServerFn(setWalletWithdrawalStatus);
  const m = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "paid" }) => {
      let note: string | undefined, ref: string | undefined;
      if (status === "rejected") { note = window.prompt("Reason for rejection (at least 5 characters)")?.trim(); if (!note) throw new Error("Cancelled"); }
      if (status === "paid") { ref = window.prompt("Transfer reference (optional)")?.trim() || undefined; }
      await set({ data: { id, status, note, ref } });
    },
    onSuccess: () => { toast.success("Updated"); void qc.invalidateQueries({ queryKey: ["wallet-v2"] }); void qc.invalidateQueries({ queryKey: ["wallets-overview"] }); },
    onError: (e) => { if ((e as Error).message !== "Cancelled") toast.error((e as Error).message); },
  });
  return (
    <section className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full min-w-[800px] text-[12px]">
        <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-3 py-2">Requested</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2 text-right">Actions</th></tr>
        </thead>
        <tbody>
          {(q.data ?? []).length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No withdrawals on the new wallet yet. Legacy requests stay under Finance → Withdrawals.</td></tr>
          : q.data!.map((w) => (
            <tr key={w.id} className="border-t border-border">
              <td className="px-3 py-2 text-muted-foreground">{new Date(w.requested_at).toLocaleString()}</td>
              <td className="px-3 py-2">{nameOf(w.employee_id)}</td>
              <td className="px-3 py-2 text-right font-mono">{money(w.amount, w.currency)}</td>
              <td className="px-3 py-2 text-muted-foreground">{w.payment_method_snapshot?.label ?? "—"} {w.payment_method_snapshot?.account ?? ""}</td>
              <td className="px-3 py-2 capitalize">{w.status}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{w.transfer_ref ?? "—"}</td>
              <td className="space-x-1 px-3 py-2 text-right">
                {w.status === "requested" && <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px]" onClick={() => m.mutate({ id: w.id, status: "approved" })}>Approve</Button>}
                {["requested", "approved"].includes(w.status) && <>
                  <Button size="sm" className="h-7 rounded-sm text-[11px]" onClick={() => m.mutate({ id: w.id, status: "paid" })}>Mark paid</Button>
                  <Button size="sm" variant="ghost" className="h-7 rounded-sm text-[11px] text-destructive" onClick={() => m.mutate({ id: w.id, status: "rejected" })}>Reject</Button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MigrationTab() {
  const qc = useQueryClient();
  const fn = useServerFn(getMigrationPreview);
  const q = useQuery({ queryKey: ["wallet-v2", "migration"], queryFn: () => fn() });
  const [row, setRow] = useState<MigrationPreviewRow | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">Each employee is moved one at a time. Their legacy closing balance becomes one Opening Balance entry. Old records are never changed. A migration cannot be repeated.</p>
      <section className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[1000px] text-[12px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Old balance</th><th className="px-3 py-2 text-right">Recalculated</th><th className="px-3 py-2 text-right">Difference</th><th className="px-3 py-2 text-right">Legacy locked</th><th className="px-3 py-2 text-right">Payouts</th><th className="px-3 py-2 text-right">Withdrawals</th><th className="px-3 py-2">State</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.employee_id + r.currency} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right font-mono">{money(r.old_available, r.currency)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(r.recalculated, r.currency)}</td>
                <td className={cn("px-3 py-2 text-right font-mono", r.difference !== 0 && "font-semibold text-destructive")}>{money(r.difference, r.currency)}</td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{money(r.old_locked, r.currency)}</td>
                <td className="px-3 py-2 text-right">{r.payout_count}</td>
                <td className="px-3 py-2 text-right">{r.withdrawal_count}</td>
                <td className="px-3 py-2">{r.migrated ? <span className="text-emerald-700">Migrated · {money(r.opening_balance ?? 0, r.currency)}</span> : r.difference !== 0 ? <span className="text-destructive">Mismatch</span> : <span className="text-muted-foreground">Ready</span>}</td>
                <td className="px-3 py-2 text-right">{!r.migrated && <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px]" onClick={() => setRow(r)}>Review & migrate</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {row && <MigrateDialog r={row} onClose={() => setRow(null)} onDone={() => { setRow(null); void qc.invalidateQueries({ queryKey: ["wallet-v2"] }); void qc.invalidateQueries({ queryKey: ["wallets-overview"] }); }} />}
    </div>
  );
}

function MigrateDialog({ r, onClose, onDone }: { r: MigrationPreviewRow; onClose: () => void; onDone: () => void }) {
  const [basis, setBasis] = useState<"legacy_balance" | "recalculated">("legacy_balance");
  const [reason, setReason] = useState(""); const [resolution, setResolution] = useState(""); const [ok, setOk] = useState(false);
  const fn = useServerFn(migrateWallet);
  const m = useMutation({
    mutationFn: () => fn({ data: { userId: r.employee_id, currency: r.currency, basis, reason, resolution: resolution || undefined } }),
    onSuccess: () => { toast.success(`${r.name} moved to the new wallet`); onDone(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const opening = basis === "legacy_balance" ? r.old_available : r.recalculated;
  const mismatch = r.difference !== 0;
  const line = (l: string, v: number) => <div className="flex justify-between"><span className="text-muted-foreground">{l}</span><span className="font-mono">{money(v, r.currency)}</span></div>;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[14px] font-semibold">Migrate {r.name}</h3>
        <div className="mt-3 space-y-1 rounded-sm border border-border p-3 text-[12px]">
          {line("Old wallet available", r.old_available)}{line("Old locked (stays Legacy Pending)", r.old_locked)}
          {line("Old requested", r.old_requested)}{line("Old paid-out (payouts)", r.old_paid)}
          {line("Payouts credited total", r.payouts_credited)}{line("Paid withdrawals total", r.paid_withdrawals)}
          {line("Open legacy withdrawals", r.open_withdrawals)}{line("Recalculated from history", r.recalculated)}
          <div className={cn("flex justify-between font-semibold", mismatch && "text-destructive")}><span>Difference</span><span className="font-mono">{money(r.difference, r.currency)}</span></div>
        </div>
        {mismatch && <p className="mt-2 text-[11.5px] text-destructive">The numbers don't match. Choose which figure to use and explain why.</p>}
        <div className="mt-3 space-y-2 text-[12px]">
          <label className="flex items-center gap-2"><input type="radio" checked={basis === "legacy_balance"} onChange={() => setBasis("legacy_balance")} /> Use verified legacy wallet balance ({money(r.old_available, r.currency)})</label>
          <label className="flex items-center gap-2"><input type="radio" checked={basis === "recalculated"} onChange={() => setBasis("recalculated")} /> Use balance recalculated from history ({money(r.recalculated, r.currency)})</label>
          <Input placeholder="Migration reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-sm" />
          {mismatch && <textarea placeholder="How was the mismatch resolved? (required, at least 10 characters)" value={resolution} onChange={(e) => setResolution(e.target.value)} className="min-h-20 w-full rounded-sm border border-input bg-background p-2" />}
          <label className="flex items-center gap-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I confirm: opening balance {money(opening, r.currency)}. This cannot be repeated.</label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="h-9 rounded-sm" onClick={onClose}>Cancel</Button>
          <Button className="h-9 rounded-sm" disabled={!ok || reason.trim().length < 5 || (mismatch && resolution.trim().length < 10) || m.isPending || opening < 0} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}Migrate
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReconTab({ nameOf, committed }: { nameOf: (id: string) => string; committed: number }) {
  const qc = useQueryClient();
  const fn = useServerFn(getWalletReconciliation);
  const q = useQuery({ queryKey: ["wallet-v2", "recon"], queryFn: () => fn() });
  const act = useServerFn(legacyPendingAction);
  const m = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "convert" | "cancel" | "keep" }) => {
      const reason = window.prompt(`Reason to ${action} this legacy pending item (at least 5 characters)`)?.trim();
      if (!reason) throw new Error("Cancelled");
      await act({ data: { payoutId: id, action, reason } });
    },
    onSuccess: () => { toast.success("Saved"); void qc.invalidateQueries({ queryKey: ["wallet-v2"] }); void qc.invalidateQueries({ queryKey: ["wallets-overview"] }); },
    onError: (e) => { if ((e as Error).message !== "Cancelled") toast.error((e as Error).message); },
  });
  const rows = q.data?.rows ?? [];
  const t = (k: string) => rows.reduce((a: number, r: any) => a + r[k], 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Wallet liability" value={money(t("ledger_balance"))} tone="brand" />
        <Stat label="Employee Fund committed" value={money(committed)} tone="muted" />
        <Stat label="Pending withdrawals" value={money(t("pending_withdrawals"))} />
        <Stat label="Total withdrawn" value={money(t("total_withdrawn"))} />
        <Stat label="Total difference" value={money(t("difference"))} />
      </div>
      <section className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[1000px] text-[12px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>{["Employee","Opening","Credits","Debits","Ledger balance","Expected","Difference","Pending payments","Pending withdrawals","Earned","Withdrawn"].map((h, i) => <th key={h} className={cn("px-3 py-2", i > 0 && "text-right")}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No migrated wallets yet.</td></tr> : rows.map((r: any) => (
              <tr key={r.employee_id + r.currency} className="border-t border-border">
                <td className="px-3 py-2">{nameOf(r.employee_id)}</td>
                {["opening","credits","debits","ledger_balance","expected"].map((k) => <td key={k} className="px-3 py-2 text-right font-mono">{money(r[k], r.currency)}</td>)}
                <td className={cn("px-3 py-2 text-right font-mono", r.difference !== 0 ? "font-semibold text-destructive" : "text-emerald-700")}>{money(r.difference, r.currency)}</td>
                {["pending_payments","pending_withdrawals","total_earned","total_withdrawn"].map((k) => <td key={k} className="px-3 py-2 text-right font-mono">{money(r[k], r.currency)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="overflow-x-auto rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5"><h3 className="text-[13px] font-semibold">Legacy Pending</h3><p className="text-[11.5px] text-muted-foreground">Old locked payouts. They never become available on their own.</p></div>
        <table className="w-full min-w-[800px] text-[12px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Installment</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Decision</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody>
            {(q.data?.legacyPending ?? []).map((p: any) => (
              <tr key={p.payout_id} className="border-t border-border">
                <td className="px-3 py-2">{nameOf(p.employee_id)}</td><td className="px-3 py-2 font-mono">{p.invoice_slug ?? "—"}</td>
                <td className="px-3 py-2">{p.installment ?? "—"}</td><td className="px-3 py-2 text-right font-mono">{money(p.amount, p.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.action ? `${p.action} — ${p.reason}` : "Pending review"}</td>
                <td className="space-x-1 px-3 py-2 text-right">
                  {(!p.action || p.action === "keep") && <>
                    <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px]" onClick={() => m.mutate({ id: p.payout_id, action: "convert" })}>Convert to credit</Button>
                    <Button size="sm" variant="ghost" className="h-7 rounded-sm text-[11px]" onClick={() => m.mutate({ id: p.payout_id, action: "cancel" })}>Cancel</Button>
                    <Button size="sm" variant="ghost" className="h-7 rounded-sm text-[11px]" onClick={() => m.mutate({ id: p.payout_id, action: "keep" })}>Keep pending</Button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function EntryTab({ emps }: { emps: { user_id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState(""); const [type, setType] = useState("bonus"); const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(""); const [reference, setReference] = useState("");
  const idem = useMemo(() => crypto.randomUUID(), [userId, type, amount, reason]);
  const fn = useServerFn(postWalletEntry);
  const m = useMutation({
    mutationFn: () => fn({ data: { userId, type: type as any, amount: Number(amount), currency: "BDT", reason, reference: reference || undefined, idem } }),
    onSuccess: () => { toast.success("Entry posted"); setAmount(""); setReason(""); setReference(""); void qc.invalidateQueries({ queryKey: ["wallet-v2"] }); void qc.invalidateQueries({ queryKey: ["wallets-overview"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const c = "h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]";
  return (
    <div className="max-w-md space-y-3 rounded-md border border-border bg-card p-4">
      <p className="text-[12px] text-muted-foreground">Salary, bonus, incentive, commission, overtime or an adjustment. Every entry needs a reason and can only be fixed with a reversal.</p>
      <select className={c} value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">— Employee (migrated only) —</option>{emps.map((e) => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}</select>
      <select className={c} value={type} onChange={(e) => setType(e.target.value)}>
        {["salary","bonus","incentive","commission","overtime","adjustment_credit","adjustment_debit","correction"].map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
      </select>
      <Input type="number" placeholder="Amount (BDT)" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 rounded-sm font-mono" />
      <Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-sm" />
      <Input placeholder="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 rounded-sm" />
      <Button className="h-9 rounded-sm" disabled={!userId || Number(amount) <= 0 || reason.trim().length < 5 || m.isPending} onClick={() => m.mutate()}>
        {m.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}Post entry
      </Button>
    </div>
  );
}
