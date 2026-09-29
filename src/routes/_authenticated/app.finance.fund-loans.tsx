import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelLoan, listTransfersAndLoans, repayLoan } from "@/lib/fund-ops.functions";
import { FundMoveForm, bdt, useFundOptions } from "@/components/finance/fund-move-dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/finance/fund-loans")({
  head: () => ({
    meta: [
      { title: "Fund Loans · Branta Finance" },
      { name: "description", content: "Temporary inter-fund borrowing with partial and full repayments." },
      { property: "og:title", content: "Fund Loans · Branta Finance" },
      { property: "og:description", content: "Inter-fund loans and repayments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoansPage,
});

const STATUS_CLS: Record<string, string> = { open: "bg-amber-100 text-amber-800", partially_repaid: "bg-sky-100 text-sky-800", repaid: "bg-emerald-100 text-emerald-800", cancelled: "bg-muted text-muted-foreground" };

function LoansPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTransfersAndLoans);
  const q = useQuery({ queryKey: ["fund-moves"], queryFn: () => listFn() });
  const funds = useFundOptions();
  const name = (id: string) => funds.data?.find((f) => f.id === id)?.name ?? "—";
  const repay = useServerFn(repayLoan);
  const cancel = useServerFn(cancelLoan);
  const done = { onSuccess: () => { toast.success("Saved"); void qc.invalidateQueries(); }, onError: (e: unknown) => toast.error((e as Error).message) };
  const mRepay = useMutation({ mutationFn: (p: { loanId: string; amount: number; notes: string | null }) => repay({ data: p }), ...done });
  const mCancel = useMutation({ mutationFn: (p: { loanId: string; reason: string }) => cancel({ data: p }), ...done });

  if (q.isError) return <div className="p-10 text-center text-[13px] text-muted-foreground">{(q.error as Error).message}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <h1 className="text-[20px] font-bold">Fund Loans</h1>
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-1 text-[14px] font-semibold">New loan</h2>
        <p className="mb-3 text-[12px] text-muted-foreground">Temporary borrowing; must be repaid later. Nothing is repaid automatically.</p>
        <FundMoveForm mode="loan" />
      </section>
      <section className="rounded-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-[14px] font-semibold">Loans</h2>
        <div className="divide-y divide-border text-[12.5px]">
          {(q.data?.loans ?? []).map((l: any) => {
            const outst = Number(l.principal_amount) - Number(l.repaid_amount);
            const reps = (q.data?.repayments ?? []).filter((r: any) => r.loan_id === l.id);
            const active = l.status === "open" || l.status === "partially_repaid";
            return (
              <div key={l.id} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{name(l.to_fund_id)}</b> borrowed from <b>{name(l.from_fund_id)}</b> · {l.reason}</span>
                  <span className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_CLS[l.status]}`}>{l.status.replace("_", " ")}</span>
                </div>
                <div className="flex flex-wrap gap-4 font-mono text-[12px]">
                  <span>Principal {bdt(l.principal_amount)}</span><span>Repaid {bdt(l.repaid_amount)}</span><span className="font-bold">Outstanding {bdt(outst)}</span>
                </div>
                {reps.length > 0 && <div className="text-[11.5px] text-muted-foreground">{reps.map((r: any) => <div key={r.id}>Repaid {bdt(r.amount)} on {new Date(r.created_at).toLocaleDateString()}{r.notes ? ` · ${r.notes}` : ""}</div>)}</div>}
                {active && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => {
                      const v = window.prompt(`Repayment amount (max ${outst})`, String(outst));
                      const n = Number(v);
                      if (n > 0) mRepay.mutate({ loanId: l.id, amount: n, notes: null });
                    }}>Repay</Button>
                    {l.status === "open" && Number(l.repaid_amount) === 0 && (
                      <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => {
                        const r = window.prompt("Cancellation reason (min 5 chars)");
                        if (r && r.length >= 5) mCancel.mutate({ loanId: l.id, reason: r });
                      }}>Cancel loan</Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!q.data?.loans.length && <div className="px-4 py-4 text-muted-foreground">No loans yet.</div>}
        </div>
      </section>
    </div>
  );
}
