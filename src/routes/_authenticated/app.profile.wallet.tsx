import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getMyWallet,
  listMyPayouts,
  listMyWithdrawals,
  requestWithdrawal,
  type Currency,
  type WalletBalance,
} from "@/lib/finance.functions";
import { getMyProfile, type PaymentMethod } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Send, Lock, Unlock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/profile/wallet")({
  head: () => ({ meta: [{ title: "My Wallet · Profile · Branta" }] }),
  component: WalletPage,
});

function fmt(n: number | null | undefined, cur: string) {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  return sym + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function WalletPage() {
  const wallet = useServerFn(getMyWallet);
  const payouts = useServerFn(listMyPayouts);
  const withdrawals = useServerFn(listMyWithdrawals);
  const request = useServerFn(requestWithdrawal);
  const profile = useServerFn(getMyProfile);

  const w = useQuery({ queryKey: ["wallet"], queryFn: () => wallet(), staleTime: 15_000 });
  const p = useQuery({ queryKey: ["my-payouts"], queryFn: () => payouts(), staleTime: 15_000 });
  const wr = useQuery({ queryKey: ["my-withdrawals"], queryFn: () => withdrawals(), staleTime: 15_000 });
  const prof = useQuery({ queryKey: ["me", "profile"], queryFn: () => profile(), staleTime: 60_000 });

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      ch = supabase.channel(`wallet:${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "invoice_payouts", filter: `user_id=eq.${uid}` }, () => { void w.refetch(); void p.refetch(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests", filter: `user_id=eq.${uid}` }, () => void wr.refetch())
        // Invoice-level changes affect lock/unlock and totals; refetch on any invoice or installment change the user is a stakeholder on.
        .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => { void w.refetch(); void p.refetch(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "invoice_installments" }, () => { void w.refetch(); void p.refetch(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "invoice_stakeholders", filter: `user_id=eq.${uid}` }, () => { void w.refetch(); void p.refetch(); })
        .subscribe();
    });
    return () => { cancelled = true; if (ch) void supabase.removeChannel(ch); };
  }, [w, p, wr]);

  const [modal, setModal] = useState<{ cur: Currency; available: number } | null>(null);
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");

  const paymentMethods: PaymentMethod[] = prof.data?.profile.payment_methods ?? [];

  const doReq = useMutation({
    mutationFn: async () => {
      if (!modal) return;
      const pm = paymentMethods.find((m) => m.id === methodId);
      await request({ data: {
        amount: Number(amount),
        currency: modal.cur,
        payment_method_id: methodId || null,
        payment_method_snapshot: pm ? {
          kind: pm.kind,
          label: pm.kind === "bank" ? (pm.bank_name ?? "Bank") : (pm.mfs_provider ?? "MFS"),
          account: pm.kind === "bank" ? (pm.account_number ?? "") : (pm.mfs_number ?? ""),
        } : null,
      }});
    },
    onSuccess: () => { toast.success("Withdrawal requested"); setModal(null); setAmount(""); void wr.refetch(); void w.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const bdt: WalletBalance = useMemo(
    () => w.data?.find((x) => x.currency === "BDT") ?? { user_id: "", currency: "BDT", locked: 0, available: 0, requested: 0, paid_total: 0 },
    [w.data],
  );
  const usd = useMemo(
    () => w.data?.find((x) => x.currency === "USD") ?? null,
    [w.data],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      <div>
        <h1 className="text-[20px] font-semibold text-foreground flex items-center gap-2">
          <Wallet className="size-5 text-brand" /> My Wallet
        </h1>
        <p className="text-[12.5px] text-muted-foreground">Your locked and available payouts across all invoices.</p>
      </div>

      <BalanceCard cur="BDT" bal={bdt} onWithdraw={() => setModal({ cur: "BDT", available: bdt.available })} />
      {usd && <BalanceCard cur="USD" bal={usd} onWithdraw={() => setModal({ cur: "USD", available: usd.available })} />}

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">My payouts</h2>
        </div>
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Installment</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Due</th>
            </tr>
          </thead>
          <tbody>
            {p.data?.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No payouts yet.</td></tr>
            ) : p.data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-brand">
                  <Link to="/app/finance/invoices/$slug" params={{ slug: r.invoice_slug ?? "" }}>{r.invoice_slug}</Link>
                </td>
                <td className="px-3 py-2">{r.installment_label}</td>
                <td className="px-3 py-2 capitalize text-muted-foreground">{r.role.replace("_"," ")}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.amount, r.currency)}</td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase",
                    r.status === "available" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : r.status === "paid" ? "border-blue-200 bg-blue-50 text-blue-700"
                    : r.status === "requested" ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-slate-200 bg-slate-50 text-slate-600")}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.installment_due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Withdrawal history</h2>
        </div>
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Requested</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Ref</th>
            </tr>
          </thead>
          <tbody>
            {(wr.data ?? []).length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">No withdrawal requests yet.</td></tr>
            ) : wr.data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{new Date(r.requested_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.amount, r.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.payment_method_snapshot?.label ?? "—"} {r.payment_method_snapshot?.account && `· ${r.payment_method_snapshot.account}`}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase",
                    r.status === "paid" ? "border-blue-200 bg-blue-50 text-blue-700"
                    : r.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : r.status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-amber-200 bg-amber-50 text-amber-700")}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.transfer_ref ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg">
            <h3 className="text-[14px] font-semibold">Request withdrawal ({modal.cur})</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Available: <span className="font-mono font-semibold text-emerald-600">{fmt(modal.available, modal.cur)}</span>
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Amount</label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 h-9 rounded-sm font-mono" placeholder="0.00" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Payment method</label>
                {paymentMethods.length === 0 ? (
                  <div className="mt-1 rounded-sm border border-dashed border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
                    Add a bank / MFS account in your <Link to="/app/profile/finance" className="font-semibold text-brand">Profile → Finance</Link> first.
                  </div>
                ) : (
                  <select value={methodId} onChange={(e) => setMethodId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                    <option value="">— Choose —</option>
                    {paymentMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.kind === "bank" ? `${m.bank_name ?? "Bank"} · ${m.account_number ?? ""}` : `${m.mfs_provider ?? "MFS"} · ${m.mfs_number ?? ""}`}
                        {m.is_primary ? " ★" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setModal(null); setAmount(""); }} className="h-9 rounded-sm">Cancel</Button>
              <Button onClick={() => doReq.mutate()}
                disabled={doReq.isPending || !amount || !methodId || Number(amount) > modal.available}
                className="h-9 rounded-sm bg-primary hover:bg-brand-700">
                {doReq.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceCard({ cur, bal, onWithdraw }: { cur: Currency; bal: WalletBalance; onWithdraw: () => void }) {
  return (
    <div className="rounded-md border border-border bg-gradient-to-br from-brand/5 to-transparent">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{cur} balance</div>
          <div className="mt-0.5 font-mono text-[24px] font-semibold text-emerald-600">
            {cur === "BDT" ? "৳ " : "$ "}{Number(bal.available).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <Button onClick={onWithdraw} disabled={bal.available <= 0} className="h-9 rounded-sm bg-primary hover:bg-brand-700">
          <Send className="mr-1.5 size-3.5" /> Request withdrawal
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3 p-5">
        <MiniStat label="Locked" value={fmt(bal.locked, cur)} icon={<Lock className="size-3" />} tone="slate" />
        <MiniStat label="Requested" value={fmt(bal.requested, cur)} icon={<Send className="size-3" />} tone="amber" />
        <MiniStat label="Paid out" value={fmt(bal.paid_total, cur)} icon={<Unlock className="size-3" />} tone="blue" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "slate" | "amber" | "blue" }) {
  const c = tone === "slate" ? "text-slate-600" : tone === "amber" ? "text-amber-600" : "text-blue-600";
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider", c)}>{icon} {label}</div>
      <div className="mt-1 font-mono text-[14px] font-semibold text-foreground">{value}</div>
    </div>
  );
}
