import { Loader2 } from "lucide-react";
import { formatMoney, type ReportCurrency } from "@/lib/report-filters";
import type { ReportRow } from "@/lib/finance-reports.functions";
import { Button } from "@/components/ui/button";

export function ReportTable({
  rows,
  currency,
  loading,
  page,
  pageSize,
  total,
  onPage,
  hideType,
}: {
  rows: ReportRow[];
  currency: ReportCurrency;
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  hideType?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Date</th>
              {!hideType && <th className="px-3 py-2 font-semibold">Type</th>}
              <th className="px-3 py-2 font-semibold">Reference</th>
              <th className="px-3 py-2 font-semibold">Client / Vendor</th>
              <th className="px-3 py-2 font-semibold">Project</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold">Method</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-[12.5px] text-muted-foreground">
                  No transactions match the selected filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.type}-${r.id}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px]">{r.date}</td>
                  {!hideType && (
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${
                          r.type === "income"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {r.type}
                      </span>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px]">{r.reference}</td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={r.party}>{r.party}</td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={r.project}>{r.project}</td>
                  <td className="px-3 py-2 capitalize">{r.category}</td>
                  <td className="px-3 py-2">{r.method}</td>
                  <td className="px-3 py-2 capitalize">{r.status}</td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-mono font-semibold ${
                      r.type === "income" ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {r.type === "expense" ? "-" : ""}
                    {formatMoney(Math.abs(r.amount), currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11.5px] text-muted-foreground">
        <span>
          {total === 0 ? "0 records" : `Showing ${start}–${end} of ${total} records`}
          {total > pageSize ? " · export always includes every filtered record" : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 rounded-sm text-[11.5px]"
            disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <span className="px-1">Page {page} / {pages}</span>
          <Button variant="outline" size="sm" className="h-7 rounded-sm text-[11.5px]"
            disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
