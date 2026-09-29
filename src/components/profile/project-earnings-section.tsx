import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getProjectEarnings } from "@/lib/project-earnings.functions";

const fmt = (n: number, c: string) => `${c} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const LABEL: Record<string, string> = { available: "Available", requested: "Requested", paid: "Withdrawn", locked: "Pending", cancelled: "Cancelled" };

/** Project Earnings summary + history (from Employee Fund, via the existing wallet). */
export function ProjectEarningsSection({ userId }: { userId?: string }) {
  const fn = useServerFn(getProjectEarnings);
  const q = useQuery({ queryKey: ["project-earnings", userId ?? "me"], queryFn: () => fn({ data: { userId } }) });
  const rows = q.data ?? [];
  const sum = (s?: string[]) => rows.filter((r) => !s || s.includes(r.status)).reduce((a, r) => a + r.amount, 0);
  const cur = rows[0]?.currency ?? "BDT";
  return (
    <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Project earnings</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">Only money the client has actually paid appears here, after Finance marks the payment as paid.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Total project earnings", sum(["available", "requested", "paid"])], ["Available", sum(["available"])], ["Requested", sum(["requested"])], ["Withdrawn", sum(["paid"])]].map(([k, v]) => (
          <div key={k as string} className="rounded-sm border border-border p-2.5">
            <div className="text-[11px] text-muted-foreground">{k}</div>
            <div className="font-mono text-[13px] font-semibold">{fmt(v as number, cur)}</div>
          </div>
        ))}
      </div>
      {q.isLoading ? <p className="mt-3 text-[12px] text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">No project earnings yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-border rounded-sm border border-border">
          {rows.map((r) => (
            <div key={r.payout_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-2.5 text-[12px]">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.client ?? "—"}{r.project ? ` · ${r.project}` : ""}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(r.earned_at).toLocaleDateString()} ·{" "}
                  {r.invoice_slug ? <Link to="/app/finance/invoices/$slug" params={{ slug: r.invoice_slug }} className="text-brand hover:underline">Invoice {r.invoice_slug}</Link> : "Invoice"}
                  {r.installment ? ` · ${r.installment}` : ""}{r.task ? ` · Task: ${r.task}` : ""}
                </div>
              </div>
              <div className="font-mono font-semibold">{fmt(r.amount, r.currency)}</div>
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]">{LABEL[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
