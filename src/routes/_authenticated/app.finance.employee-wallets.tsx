import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  getWalletsOverview, getWalletReconciliation, postWalletEntry, legacyPendingAction,
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
      { name: "description", content: "Unified employee wallet ledger: balances, statements and reconciliation." },
      { property: "og:title", content: "Employee Wallets · Branta Console" },
      { property: "og:description", content: "Unified employee wallet ledger: balances, statements and reconciliation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "wallets" | "reconciliation" | "entry";
const TABS: [Tab, string][] = [["wallets", "Wallets"], ["reconciliation", "Reconciliation"], ["entry", "Post entry"]];

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
      {tab === "reconciliation" && <ReconTab nameOf={nameOf} committed={q.data?.employeeFundCommitted ?? 0} />}
      {tab === "entry" && <EntryTab emps={emps} />}
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
  const sum = (k: string) => balances.reduce((a, b) => a + Number(b[k]), 0);
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
            <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Today</th><th className="px-3 py-2 text-right">This week</th><th className="px-3 py-2 text-right">This month</th><th className="px-3 py-2 text-right">Total earned</th><th className="px-3 py-2 text-right">Withdrawn</th></tr>
          </thead>
          <tbody>
            {balances.sort((a, b) => nameOf(a.employee_id).localeCompare(nameOf(b.employee_id))).map((b) => (
              <tr key={b.employee_id + b.currency} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setSel(b.employee_id)}>
                <td className="px-3 py-2 font-medium">{nameOf(b.employee_id)}</td>
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
          <select className={sel_} value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">All employees</option>{balances.map((b) => <option key={b.employee_id} value={b.employee_id}>{nameOf(b.employee_id)}</option>)}</select>
          <select className={sel_} value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{clients.map((c) => <option key={c}>{c}</option>)}</select>
          <select className={sel_} value={proj} onChange={(e) => setProj(e.target.value)}><option value="">All projects</option>{projects.map((c) => <option key={c}>{c}</option>)}</select>
          <select className={sel_} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <WalletEntriesTable rows={filtered} showEmployee nameOf={nameOf} canReverse />
      </section>
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
            {rows.length === 0 ? <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No wallet activity yet.</td></tr> : rows.map((r: any) => (
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
      <select className={c} value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">— Employee —</option>{emps.map((e) => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}</select>
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
