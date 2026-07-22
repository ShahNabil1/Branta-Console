import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listWithdrawals,
  decideWithdrawal,
  isFinanceAdminCheck,
} from "@/lib/finance.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle, Banknote, Copy, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type MethodSnap = {
  kind?: string;
  label?: string;
  account?: string;
  bank_name?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  branch?: string | null;
  mfs_provider?: string | null;
  mfs_number?: string | null;
} | null;

function MethodDetailsDialog({ snap, onClose }: { snap: MethodSnap; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, val: string) => {
    try { await navigator.clipboard.writeText(val); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200); }
    catch { toast.error("Copy failed"); }
  };
  if (!snap) return null;
  const isBank = snap.kind === "bank";
  const rows: Array<{ k: string; label: string; value: string | null | undefined }> = isBank
    ? [
        { k: "bank_name", label: "Bank", value: snap.bank_name ?? snap.label },
        { k: "account_holder", label: "Account holder", value: snap.account_holder },
        { k: "account_number", label: "Account number", value: snap.account_number ?? snap.account },
        { k: "branch", label: "Branch", value: snap.branch },
      ]
    : [
        { k: "mfs_provider", label: "Provider", value: snap.mfs_provider ?? snap.label },
        { k: "mfs_number", label: "Number", value: snap.mfs_number ?? snap.account },
        { k: "account_holder", label: "Account holder", value: snap.account_holder },
      ];
  const filled = rows.filter((r) => r.value && String(r.value).trim().length > 0);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">Payment method details</h3>
          <button onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="mt-3 space-y-2">
          {filled.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No details available.</p>
          ) : filled.map((r) => (
            <div key={r.k} className="rounded-sm border border-border bg-muted/30 px-3 py-2">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{r.label}</div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[12.5px] text-foreground">{r.value}</span>
                <button onClick={() => copy(r.k, String(r.value))} className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted">
                  {copied === r.k ? <><Check className="size-3 text-emerald-600" /> Copied</> : <><Copy className="size-3" /> Copy</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/app/finance/withdrawals")({
  head: () => ({ meta: [{ title: "Withdrawals · Finance · Branta" }] }),
  component: WithdrawalsPage,
});

function fmt(n: number, cur: string) {
  return (cur === "BDT" ? "৳ " : "$ ") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function WithdrawalsPage() {
  const listFn = useServerFn(listWithdrawals);
  const decide = useServerFn(decideWithdrawal);
  const check = useServerFn(isFinanceAdminCheck);
  const isAdmin = useQuery({ queryKey: ["is-finance-admin"], queryFn: () => check(), staleTime: 60_000 });

  const q = useQuery({
    queryKey: ["withdrawals-all"],
    queryFn: () => listFn(),
    enabled: !!isAdmin.data?.isAdmin,
    staleTime: 15_000,
  });

  useEffect(() => {
    const ch = supabase.channel("withdrawals").on("postgres_changes",
      { event: "*", schema: "public", table: "withdrawal_requests" },
      () => void q.refetch()).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [q]);

  const [dialog, setDialog] = useState<{ id: string; action: "approve" | "reject" | "paid" } | null>(null);
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");

  const doDecide = useMutation({
    mutationFn: async () => {
      if (!dialog) return;
      await decide({ data: { id: dialog.id, action: dialog.action, note: note || null, transfer_ref: ref || null } });
    },
    onSuccess: () => { toast.success("Updated"); setDialog(null); setNote(""); setRef(""); void q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isAdmin.isLoading) return <div className="grid h-64 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (!isAdmin.data?.isAdmin) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <Banknote className="mx-auto mb-3 size-8 text-muted-foreground" />
      <h1 className="text-[18px] font-semibold">Finance-only page</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">You need the Finance or Super-admin role to review withdrawal requests.</p>
    </div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <div>
        <h1 className="text-[20px] font-semibold text-foreground">Withdrawal Requests</h1>
        <p className="text-[12.5px] text-muted-foreground">Approve → transfer → mark paid. Real-time.</p>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-[12.5px]">
          <thead className="border-b border-border bg-muted/30 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Requested</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center"><Loader2 className="mx-auto size-4 animate-spin" /></td></tr>
            ) : (q.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-16 text-center text-muted-foreground">No withdrawal requests.</td></tr>
            ) : q.data?.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-3 py-2 font-medium">{r.user_name ?? r.user_id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.amount, r.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.payment_method_snapshot?.label ?? "—"}
                  {r.payment_method_snapshot?.account && <> · <span className="font-mono">{r.payment_method_snapshot.account}</span></>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(r.requested_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase",
                    r.status === "paid" ? "border-blue-200 bg-blue-50 text-blue-700"
                    : r.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : r.status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-amber-200 bg-amber-50 text-amber-700")}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {r.status === "pending" && (
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ id: r.id, action: "approve" })}
                        className="h-7 rounded-sm text-[11px] text-emerald-700 hover:bg-emerald-50">
                        <CheckCircle2 className="mr-1 size-3" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDialog({ id: r.id, action: "reject" })}
                        className="h-7 rounded-sm text-[11px] text-rose-700 hover:bg-rose-50">
                        <XCircle className="mr-1 size-3" /> Reject
                      </Button>
                    </div>
                  )}
                  {r.status === "approved" && (
                    <Button size="sm" onClick={() => setDialog({ id: r.id, action: "paid" })}
                      className="h-7 rounded-sm bg-blue-600 text-[11px] text-white hover:bg-blue-700">
                      <Banknote className="mr-1 size-3" /> Mark paid
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg">
            <h3 className="text-[14px] font-semibold capitalize">{dialog.action} withdrawal</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Note</label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-9 rounded-sm"
                  placeholder={dialog.action === "reject" ? "Reason for rejection" : "Optional note"} />
              </div>
              {dialog.action === "paid" && (
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Transfer ref</label>
                  <Input value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1 h-9 rounded-sm font-mono" placeholder="Transaction ID / cheque no." />
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialog(null)} className="h-9 rounded-sm">Cancel</Button>
              <Button onClick={() => doDecide.mutate()} disabled={doDecide.isPending}
                className={cn("h-9 rounded-sm text-white",
                  dialog.action === "approve" ? "bg-emerald-600 hover:bg-emerald-700"
                  : dialog.action === "reject" ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-blue-600 hover:bg-blue-700")}>
                {doDecide.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
