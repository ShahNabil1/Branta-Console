import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listTransfersAndLoans, ownerWithdraw } from "@/lib/fund-ops.functions";
import { FundMoveForm, bdt, useFundOptions } from "@/components/finance/fund-move-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/app/finance/fund-transfers")({
  head: () => ({
    meta: [
      { title: "Fund Transfers · Branta Finance" },
      { name: "description", content: "Permanent inter-fund transfers and owner withdrawals from the Profit Fund." },
      { property: "og:title", content: "Fund Transfers · Branta Finance" },
      { property: "og:description", content: "Inter-fund transfers and owner withdrawals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransfersPage,
});

function TransfersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTransfersAndLoans);
  const q = useQuery({ queryKey: ["fund-moves"], queryFn: () => listFn() });
  const funds = useFundOptions();
  const name = (id: string) => funds.data?.find((f) => f.id === id)?.name ?? "—";
  const profit = funds.data?.find((f) => f.code === "profit");

  const w = useServerFn(ownerWithdraw);
  const [wf, setWf] = useState({ amount: "", name: "", method: "", ref: "", date: new Date().toISOString().slice(0, 10), reason: "", notes: "" });
  const mw = useMutation({
    mutationFn: () => w({ data: { amount: Number(wf.amount), name: wf.name, method: wf.method || null, ref: wf.ref || null, date: wf.date, reason: wf.reason, notes: wf.notes || null } }),
    onSuccess: () => { toast.success("Owner withdrawal recorded"); setWf({ ...wf, amount: "", reason: "", notes: "", ref: "" }); void qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isError) return <div className="p-10 text-center text-[13px] text-muted-foreground">{(q.error as Error).message}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <h1 className="text-[20px] font-bold">Fund Transfers</h1>
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-1 text-[14px] font-semibold">New permanent transfer</h2>
        <p className="mb-3 text-[12px] text-muted-foreground">Money moves for good. Use Fund Loans for temporary borrowing.</p>
        <FundMoveForm mode="transfer" />
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-1 text-[14px] font-semibold">Owner / Director withdrawal</h2>
        <p className="mb-3 text-[12px] text-muted-foreground">Only from Company Profit Fund · available {bdt(profit?.available ?? 0)}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input className="h-9 font-mono" type="number" placeholder="Amount" value={wf.amount} onChange={(e) => setWf({ ...wf, amount: e.target.value })} />
          <Input className="h-9" placeholder="Owner / Director name" value={wf.name} onChange={(e) => setWf({ ...wf, name: e.target.value })} />
          <Input className="h-9" type="date" value={wf.date} onChange={(e) => setWf({ ...wf, date: e.target.value })} />
          <Input className="h-9" placeholder="Payment method" value={wf.method} onChange={(e) => setWf({ ...wf, method: e.target.value })} />
          <Input className="h-9" placeholder="Transaction reference" value={wf.ref} onChange={(e) => setWf({ ...wf, ref: e.target.value })} />
          <Input className="h-9" placeholder="Reason (min 5)" value={wf.reason} onChange={(e) => setWf({ ...wf, reason: e.target.value })} />
        </div>
        <Button className="mt-3" disabled={!(Number(wf.amount) > 0) || wf.name.length < 2 || wf.reason.length < 5 || Number(wf.amount) > (profit?.available ?? 0) || mw.isPending} onClick={() => mw.mutate()}>Record withdrawal</Button>
      </section>

      <section className="rounded-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-[14px] font-semibold">Transfer history</h2>
        <div className="divide-y divide-border text-[12.5px]">
          {(q.data?.transfers ?? []).map((t: any) => (
            <div key={t.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span><b>{name(t.from_fund_id)}</b> → <b>{name(t.to_fund_id)}</b> · {t.reason}</span>
              <span className="font-mono">{bdt(t.amount)} · {new Date(t.created_at).toLocaleDateString()}</span>
            </div>
          ))}
          {!q.data?.transfers.length && <div className="px-4 py-4 text-muted-foreground">No transfers yet.</div>}
        </div>
      </section>

      <section className="rounded-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-[14px] font-semibold">Owner withdrawals</h2>
        <div className="divide-y divide-border text-[12.5px]">
          {(q.data?.withdrawals ?? []).map((t: any) => (
            <div key={t.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span><b>{t.recipient_name}</b> · {t.reason}</span>
              <span className="font-mono">{bdt(t.amount)} · {t.withdrawn_on}</span>
            </div>
          ))}
          {!q.data?.withdrawals.length && <div className="px-4 py-4 text-muted-foreground">No withdrawals yet.</div>}
        </div>
      </section>
    </div>
  );
}
