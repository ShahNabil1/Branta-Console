import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { listAllocationMismatches, reverseAllocation } from "@/lib/fund-ledger.functions";
import { Button } from "@/components/ui/button";
import { bdt } from "@/components/finance/fund-report-kit";

/** Finance review list: "Allocation / Installment Status Mismatch". Nothing is fixed silently. */
export function AllocationMismatchPanel() {
  const listFn = useServerFn(listAllocationMismatches);
  const revFn = useServerFn(reverseAllocation);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["allocation-mismatches"], queryFn: () => listFn() });
  const rev = useMutation({
    mutationFn: (v: { allocationId: string; reason: string }) => revFn({ data: v }),
    onSuccess: () => { toast.success("Fund split reversed — history kept"); void qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const rows = q.data ?? [];
  if (q.isLoading || rows.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-amber-900">
        <AlertTriangle className="size-4" /> Allocation / Installment Status Mismatch ({rows.length})
      </div>
      <p className="mb-3 text-[12px] text-amber-900/80">These payments are no longer marked Paid, but their money is still counted in the funds. Review each one and reverse the fund split (a reason is required; the original history is kept).</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-left text-muted-foreground"><tr>
            <th className="py-1 pr-3">Invoice</th><th className="pr-3">Installment</th><th className="pr-3">Installment status</th><th className="pr-3">Allocation</th>
            <th className="pr-3 text-right">Amount</th><th className="pr-3 text-right">Fund impact</th><th>Action</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.allocationId} className="border-t border-amber-200">
              <td className="py-1.5 pr-3"><Link to="/app/finance/invoices/$slug" params={{ slug: r.invoiceSlug }} className="font-mono underline">{r.invoiceSlug}</Link></td>
              <td className="pr-3">{r.installment}</td>
              <td className="pr-3 capitalize">{r.installmentStatus}</td>
              <td className="pr-3 capitalize">{r.allocationStatus}</td>
              <td className="pr-3 text-right font-mono">{bdt(r.amount)}</td>
              <td className="pr-3 text-right font-mono">{bdt(r.fundImpact)}</td>
              <td><Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={rev.isPending} onClick={() => {
                const reason = window.prompt(`Reverse the fund split for ${r.invoiceSlug} · ${r.installment}? Reason (min 5 characters):`);
                if (reason == null) return;
                if (reason.trim().length < 5) { toast.error("Reason must be at least 5 characters"); return; }
                rev.mutate({ allocationId: r.allocationId, reason: reason.trim() });
              }}>Reverse allocation</Button></td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
