import { ProjectEarningsSection } from "@/components/profile/project-earnings-section";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getMyWallet,
  listMyPayouts,
  listMyWithdrawals,
  requestWithdrawal,
  cancelMyWithdrawal,
  type Currency,
  type WalletBalance,
  type WithdrawalRow,
} from "@/lib/finance.functions";
import { getMyProfile, type PaymentMethod } from "@/lib/profile.functions";
import { listMySalarySlips, getSignedSalarySlipUrl, getSalarySealedFileUrl } from "@/lib/salary.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Send, Lock, Unlock, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(n: number | null | undefined, cur: string) {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  return sym + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MyWalletPanel() {
  const wallet = useServerFn(getMyWallet);
  const payouts = useServerFn(listMyPayouts);
  const withdrawals = useServerFn(listMyWithdrawals);
  const request = useServerFn(requestWithdrawal);
  const cancelReq = useServerFn(cancelMyWithdrawal);
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
        .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests", filter: `user_id=eq.${uid}` }, () => { void wr.refetch(); void w.refetch(); })
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
          bank_name: pm.bank_name ?? null,
          account_holder: pm.account_holder ?? null,
          account_number: pm.account_number ?? null,
          branch: pm.branch ?? null,
          mfs_provider: pm.mfs_provider ?? null,
          mfs_number: pm.mfs_number ?? null,
        } : null,
      }});
    },
    onSuccess: () => { toast.success("Withdrawal requested"); setModal(null); setAmount(""); void wr.refetch(); void w.refetch(); void p.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const doCancel = useMutation({
    mutationFn: async (id: string) => { await cancelReq({ data: { id } }); },
    onSuccess: () => { toast.success("Request cancelled"); void wr.refetch(); void w.refetch(); void p.refetch(); },
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
    <div className="space-y-4">
      <div>
        <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
          <Wallet className="size-4 text-brand" /> My Wallet
        </h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Your locked and available payouts across all invoices.</p>
      </div>

      <BalanceCard cur="BDT" bal={bdt} onWithdraw={() => setModal({ cur: "BDT", available: bdt.available })} />
      {usd && <BalanceCard cur="USD" bal={usd} onWithdraw={() => setModal({ cur: "USD", available: usd.available })} />}
      <ProjectEarningsSection />

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="text-[13px] font-semibold">My payouts</h3>
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
          <h3 className="text-[13px] font-semibold">Withdrawal history</h3>
        </div>
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Requested</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Ref</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(wr.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No withdrawal requests yet.</td></tr>
            ) : (wr.data as WithdrawalRow[]).map((r) => (
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
                <td className="px-3 py-2 text-right">
                  {r.status === "pending" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={doCancel.isPending}
                      onClick={() => doCancel.mutate(r.id)}
                      className="h-7 rounded-sm text-[11px] text-rose-700 hover:bg-rose-50"
                    >
                      <X className="mr-1 size-3" /> Cancel
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </td>
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
                    Add a bank / MFS account below first.
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

      <MySalarySlips />
    </div>
  );
}

function MySalarySlips() {
  const listFn = useServerFn(listMySalarySlips);
  const urlFn = useServerFn(getSignedSalarySlipUrl);
  const sealedFn = useServerFn(getSalarySealedFileUrl);
  const q = useQuery({ queryKey: ["my-salary-slips"], queryFn: () => listFn(), staleTime: 30_000 });

  const open = async (id: string) => {
    try {
      const r = await urlFn({ data: { id } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openSealed = async (id: string, download?: boolean) => {
    try {
      const r = await sealedFn({ data: { id, ...(download ? { download: true } : {}) } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!q.data || q.data.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Salary slips
      </div>
      <div className="divide-y divide-border">
        {q.data.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div>
              <div className="text-[13px] font-medium">
                {new Date(`${String(s.period_month).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
                {s.status === "void" && <span className="ml-2 text-[11px] text-destructive">Void</span>}
              </div>
              <div className="font-mono text-[11.5px] text-muted-foreground">{s.slip_no ?? "—"}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[13px] font-semibold">{fmt(s.net_amount, s.currency)}</span>
              <Button variant="outline" className="h-8 rounded-sm text-[12px]" onClick={() => open(s.id)}>
                View slip
              </Button>
              {s.signed_slip_url && (
                <>
                  <Button variant="outline" className="h-8 rounded-sm text-[12px]" onClick={() => openSealed(s.id)}>
                    Signed copy
                  </Button>
                  <Button variant="ghost" className="h-8 rounded-sm text-[12px]" onClick={() => openSealed(s.id, true)}>
                    Download
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
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
