import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getInvoiceEmployeeEarnings } from "@/lib/fund-ledger.functions";

const fmt = (n: number, c: string) => `${c} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Employee Fund Distribution: planned vs earned from paid installments vs pending, with wallet status. */
export function InvoiceEmployeeEarnings({ invoiceId, currency }: { invoiceId: string; currency: string }) {
  const fn = useServerFn(getInvoiceEmployeeEarnings);
  const q = useQuery({ queryKey: ["invoice-employee-earnings", invoiceId], queryFn: () => fn({ data: { invoiceId } }) });
  if (!q.data?.allowed || !q.data.rows.length) return null;
  return (
    <section className="rounded-sm border border-border bg-card p-4">
      <h3 className="text-[13px] font-semibold">Employee Fund Distribution</h3>
      <p className="text-[11px] text-muted-foreground">Earnings come only from installments the client has actually paid. Money reaches the wallet only after the employee payment is marked Paid.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[620px] text-[12px]">
          <thead className="text-left text-[11px] text-muted-foreground">
            <tr><th className="py-1.5">Employee</th><th className="text-right">Planned share</th><th className="text-right">Earned from paid</th><th className="text-right">Pending from unpaid</th><th className="pl-3">Wallet status</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.data.rows.map((r) => (
              <tr key={r.employeeId}>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    {r.avatar ? <img src={r.avatar} alt="" className="size-6 rounded-full object-cover" /> : <div className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-semibold">{r.name.slice(0, 1)}</div>}
                    <div><div className="font-medium">{r.name}</div>{r.code && <div className="font-mono text-[10.5px] text-muted-foreground">{r.code}</div>}</div>
                  </div>
                </td>
                <td className="text-right font-mono">{fmt(r.planned, currency)}</td>
                <td className="text-right font-mono">{fmt(r.earned, currency)}</td>
                <td className="text-right font-mono text-muted-foreground">{fmt(r.pending, currency)}</td>
                <td className="pl-3">{r.walletStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
