import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getCompanyWallet,
  listCompanyWalletInvoices,
  listCompanyLedger,
  addCompanyLedgerEntry,
  deleteCompanyLedgerEntry,
  isFinanceAdminCheck,
  listManualEmployeePayouts,
  addManualEmployeePayout,
  deleteManualEmployeePayout,
  listEmployeesForFinance,
  type Currency,
  type CompanyWalletCurrency,
} from "@/lib/finance.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Building2, Wallet, Clock, Sigma, Users, TrendingUp, TrendingDown,
  PlusCircle, Trash2, Loader2, Banknote, Lock, HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/finance/wallet")({
  head: () => ({ meta: [{ title: "Company Wallet · Finance · Branta" }] }),
  component: CompanyWalletPage,
});

function fmt(n: number | null | undefined, cur: string) {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  const v = Number(n ?? 0);
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}${sym}${abs}`;
}

function CompanyWalletPage() {
  const check = useServerFn(isFinanceAdminCheck);
  const walletFn = useServerFn(getCompanyWallet);
  const invsFn = useServerFn(listCompanyWalletInvoices);
  const ledgerFn = useServerFn(listCompanyLedger);
  const addFn = useServerFn(addCompanyLedgerEntry);
  const delFn = useServerFn(deleteCompanyLedgerEntry);
  const manualListFn = useServerFn(listManualEmployeePayouts);
  const manualAddFn = useServerFn(addManualEmployeePayout);
  const manualDelFn = useServerFn(deleteManualEmployeePayout);
  const empsFn = useServerFn(listEmployeesForFinance);
  const confirm = useConfirm();

  const isAdmin = useQuery({ queryKey: ["is-finance-admin"], queryFn: () => check(), staleTime: 60_000 });
  const enabled = !!isAdmin.data?.isAdmin;

  const w = useQuery({ queryKey: ["company-wallet"], queryFn: () => walletFn(), enabled, staleTime: 10_000 });
  const invs = useQuery({ queryKey: ["company-wallet-invoices"], queryFn: () => invsFn(), enabled, staleTime: 10_000 });
  const ledger = useQuery({ queryKey: ["company-ledger"], queryFn: () => ledgerFn(), enabled, staleTime: 10_000 });
  const manuals = useQuery({ queryKey: ["manual-employee-payouts"], queryFn: () => manualListFn(), enabled, staleTime: 10_000 });
  const emps = useQuery({ queryKey: ["employees-for-finance"], queryFn: () => empsFn(), enabled, staleTime: 60_000 });

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase.channel("company-wallet")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => { void w.refetch(); void invs.refetch(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_installments" }, () => { void w.refetch(); void invs.refetch(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_payouts" }, () => { void w.refetch(); void manuals.refetch(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => void w.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "company_ledger" }, () => { void w.refetch(); void ledger.refetch(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [enabled, w, invs, ledger, manuals]);

  const [cur, setCur] = useState<Currency>("BDT");
  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const add = useMutation({
    mutationFn: addFn,
    onSuccess: () => { toast.success("Ledger entry added"); setAddOpen(false); void w.refetch(); void ledger.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const addManual = useMutation({
    mutationFn: manualAddFn,
    onSuccess: () => {
      toast.success("Payout credited to employee wallet");
      setPayOpen(false);
      void w.refetch(); void manuals.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = async (id: string) => {
    const ok = await confirm({
      title: "Delete ledger entry",
      description: "This permanently removes the entry from the company ledger.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await delFn({ data: { id } });
      toast.success("Deleted");
      void w.refetch(); void ledger.refetch();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (isAdmin.isLoading) return <div className="grid h-64 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (!enabled) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <Building2 className="mx-auto mb-3 size-8 text-muted-foreground" />
      <h1 className="text-[18px] font-semibold">Company Wallet is restricted</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">Only Finance / Super-admin roles can view the company wallet.</p>
    </div>;
  }

  const c: CompanyWalletCurrency | undefined = w.data?.[cur];
  const invsInCur = (invs.data ?? []).filter((i) => i.currency === cur);
  const ledgerInCur = (ledger.data ?? []).filter((l) => l.currency === cur);
  const manualsInCur = (manuals.data ?? []).filter((m) => m.currency === cur);

  const delManual = async (id: string) => {
    const ok = await confirm({
      title: "Remove manual payout",
      description: "This reverses the credit from the employee wallet. Only allowed while it is still 'available'.",
      tone: "danger",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await manualDelFn({ data: { id } });
      toast.success("Removed");
      void w.refetch(); void manuals.refetch();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold text-foreground">
            <Building2 className="size-5 text-brand" /> Company Wallet
          </h1>
          <p className="text-[12.5px] text-muted-foreground">Live view of the main company treasury across all invoices, ledger entries and expenses.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-sm border border-border">
            {(["BDT", "USD"] as Currency[]).map((x) => (
              <button key={x} onClick={() => setCur(x)}
                className={cn("px-3 py-1.5 text-[11.5px] font-semibold uppercase",
                  cur === x ? "bg-brand text-white" : "bg-background text-muted-foreground hover:text-foreground")}>
                {x}
              </button>
            ))}
          </div>
          <Button onClick={() => setAddOpen(true)} className="h-9 rounded-sm bg-primary hover:bg-brand-700">
            <PlusCircle className="mr-1.5 size-3.5" /> Add ledger entry
          </Button>
        </div>
      </div>

      {c && (
        <>
          {/* Three main balance cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <BalanceCard
              tone="emerald"
              icon={<Wallet className="size-4" />}
              label="Real Balance"
              hint="Cash actually received (paid installments + ledger − expenses)"
              value={fmt(c.real_balance, cur)}
            />
            <BalanceCard
              tone="amber"
              icon={<Clock className="size-4" />}
              label="Pending"
              hint="Unpaid installments across active invoices"
              value={fmt(c.pending, cur)}
            />
            <BalanceCard
              tone="slate"
              icon={<Sigma className="size-4" />}
              label="Estimated Total"
              hint="Full contract value of every active invoice"
              value={fmt(c.estimated_total, cur)}
            />
          </div>

          {/* Breakdown row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="Received" tone="emerald" icon={<TrendingUp className="size-3" />} value={fmt(c.received, cur)} />
            <MiniStat label="Ledger" tone="blue" icon={<PlusCircle className="size-3" />} value={fmt(c.ledger_total, cur)} />
            <MiniStat label="Expenses" tone="rose" icon={<TrendingDown className="size-3" />} value={fmt(c.expenses_total, cur)} />
            <MiniStat label="Employees owed" tone="purple" icon={<Users className="size-3" />} value={fmt(c.employees_owed, cur)} />
          </div>

          {/* Net card */}
          <div className={cn("rounded-md border p-5",
            c.company_net >= 0 ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Company Net Cash</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Real Balance − employee payouts already ready or requested for withdrawal
                </div>
              </div>
              <div className={cn("font-mono text-[26px] font-bold",
                c.company_net >= 0 ? "text-emerald-700" : "text-rose-700")}>
                {fmt(c.company_net, cur)}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-[11.5px]">
              <div><span className="text-muted-foreground">Locked (invoice not fully paid): </span><span className="font-mono font-semibold">{fmt(c.employees_locked, cur)}</span></div>
              <div><span className="text-muted-foreground">Ready for payout: </span><span className="font-mono font-semibold text-emerald-700">{fmt(c.employees_available, cur)}</span></div>
              <div><span className="text-muted-foreground">Withdrawal pending: </span><span className="font-mono font-semibold text-amber-700">{fmt(c.employees_requested, cur)}</span></div>
            </div>
          </div>
        </>
      )}

      {/* Invoice list */}
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Invoices ({cur})</h2>
        </div>
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Next due</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {invsInCur.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No invoices in {cur}.</td></tr>
            ) : invsInCur.map((r) => (
              <tr key={r.invoice_id} className="border-t border-border hover:bg-muted/40">
                <td className="px-3 py-2 font-mono text-brand">
                  <Link to="/app/finance/invoices/$slug" params={{ slug: r.slug }}>{r.slug}</Link>
                </td>
                <td className="px-3 py-2">{r.customer_name ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.total, cur)}</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-700">{fmt(r.paid, cur)}</td>
                <td className="px-3 py-2 text-right font-mono text-amber-700">{fmt(r.outstanding, cur)}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.next_due ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase",
                    r.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : r.status === "overdue" ? "border-rose-200 bg-rose-50 text-rose-700"
                    : r.status === "partially_paid" ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-slate-200 bg-slate-50 text-slate-700")}>
                    {r.status.replace("_"," ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Company ledger */}
      <section className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div>
            <h2 className="text-[13px] font-semibold">Company Ledger ({cur})</h2>
            <p className="text-[11px] text-muted-foreground">Manual entries — seed capital, other income, adjustments. Positive = credit, negative = debit.</p>
          </div>
        </div>
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">By</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {ledgerInCur.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No ledger entries in {cur} yet.</td></tr>
            ) : ledgerInCur.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{r.occurred_on}</td>
                <td className="px-3 py-2 capitalize">{r.kind.replace("_"," ")}</td>
                <td className={cn("px-3 py-2 text-right font-mono font-semibold",
                  Number(r.amount) >= 0 ? "text-emerald-700" : "text-rose-700")}>
                  {fmt(r.amount, cur)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.notes ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.created_by_name ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => del(r.id)}
                    className="h-7 rounded-sm text-[11px] text-rose-600 hover:bg-rose-50">
                    <Trash2 className="size-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-[11.5px] text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-foreground"><Banknote className="size-3.5" /> How the numbers connect</div>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          <li><strong>Real Balance</strong> = Received + Ledger − Expenses. Grows only when invoice installments are marked paid or a ledger entry is added; shrinks with expenses.</li>
          <li><strong>Pending</strong> = installments still owed by clients. Fully separate from Real Balance until marked paid.</li>
          <li><strong>Estimated Total</strong> ignores payment terms — the full contract value across every active invoice.</li>
          <li><strong>Employee payouts unlock only after the entire invoice is fully paid</strong>. Locked payouts sit under "Locked" until then.</li>
          <li><strong>Company Net Cash</strong> = Real Balance − amounts already earmarked for employees (ready + withdrawal pending). Can go negative if expenses exceed inflow.</li>
        </ul>
      </div>

      {addOpen && <AddLedgerModal cur={cur} onClose={() => setAddOpen(false)}
        submitting={add.isPending} onSubmit={(d) => add.mutate({ data: d })} />}
    </div>
  );
}

function BalanceCard({ label, value, hint, icon, tone }: {
  label: string; value: string; hint: string; icon: React.ReactNode;
  tone: "emerald" | "amber" | "slate";
}) {
  const bg = tone === "emerald" ? "from-emerald-50 to-transparent border-emerald-200"
    : tone === "amber" ? "from-amber-50 to-transparent border-amber-200"
    : "from-slate-50 to-transparent border-slate-200";
  const text = tone === "emerald" ? "text-emerald-700"
    : tone === "amber" ? "text-amber-700" : "text-slate-800";
  return (
    <div className={cn("rounded-md border bg-gradient-to-br p-5", bg)}>
      <div className={cn("flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider", text)}>
        {icon} {label}
      </div>
      <div className={cn("mt-1 font-mono text-[26px] font-bold", text)}>{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function MiniStat({ label, value, icon, tone }: {
  label: string; value: string; icon: React.ReactNode;
  tone: "emerald" | "blue" | "rose" | "purple";
}) {
  const c = tone === "emerald" ? "text-emerald-700"
    : tone === "blue" ? "text-blue-700"
    : tone === "rose" ? "text-rose-700" : "text-purple-700";
  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider", c)}>{icon} {label}</div>
      <div className="mt-1 font-mono text-[15px] font-semibold text-foreground">{value}</div>
    </div>
  );
}

function AddLedgerModal({ cur, onClose, onSubmit, submitting }: {
  cur: Currency;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (d: { kind: "seed" | "other_income" | "adjustment"; currency: Currency; amount: number; notes: string | null; occurred_on: string }) => void;
}) {
  const [kind, setKind] = useState<"seed" | "other_income" | "adjustment">("seed");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<Currency>(cur);

  const submit = () => {
    const n = Number(amount);
    if (!n || Number.isNaN(n)) return toast.error("Amount required (use negative for debit)");
    onSubmit({ kind, currency, amount: n, notes: notes.trim() || null, occurred_on: when });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <Lock className="size-4 text-brand" /> Add ledger entry
        </h3>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Use a positive amount for money in (seed, other income), negative for adjustments out.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
              className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
              <option value="seed">Seed capital</option>
              <option value="other_income">Other income</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
              className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
              <option value="BDT">BDT</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Amount</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="mt-1 h-9 rounded-sm font-mono" placeholder="e.g. 5000 or -300" />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Date</label>
            <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 h-9 rounded-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 h-9 rounded-sm"
              placeholder="Optional description" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="h-9 rounded-sm">Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="h-9 rounded-sm bg-primary hover:bg-brand-700">
            {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Add entry
          </Button>
        </div>
      </div>
    </div>
  );
}
