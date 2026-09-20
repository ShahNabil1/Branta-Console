import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listExpenseLogs,
  ACTION_LABEL,
  type ExpenseLogRow,
} from "@/lib/expense-logs.functions";
import { Button } from "@/components/ui/button";
import { Loader2, X, History, ArrowRight } from "lucide-react";

/** Dhaka time (GMT+6) — the whole team reads timestamps in local time. */
function fmtWhen(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " (GMT+6)"
  );
}

const TONE: Record<string, string> = {
  created: "bg-emerald-50 text-emerald-700",
  updated: "bg-amber-50 text-amber-700",
  deleted: "bg-rose-50 text-rose-700",
  restored: "bg-emerald-50 text-emerald-700",
  purged: "bg-rose-50 text-rose-700",
};

function Counts({ logs }: { logs: ExpenseLogRow[] }) {
  const tally = new Map<string, number>();
  logs.forEach((l) => tally.set(l.action, (tally.get(l.action) ?? 0) + 1));
  const show = [
    "voucher_viewed",
    "voucher_downloaded",
    "voucher_printed",
    "receipt_viewed",
    "receipt_downloaded",
  ].filter((a) => tally.get(a));
  if (!show.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/30 px-4 py-2.5">
      {show.map((a) => (
        <span
          key={a}
          className="rounded-sm border border-border bg-card px-2 py-0.5 text-[11.5px] font-medium"
        >
          {ACTION_LABEL[a]} · <span className="font-mono font-semibold">{tally.get(a)}</span>
        </span>
      ))}
    </div>
  );
}

export function ExpenseLogsDialog({
  expenseId,
  voucherNo,
  onClose,
}: {
  expenseId: string;
  voucherNo: string | null;
  onClose: () => void;
}) {
  const listFn = useServerFn(listExpenseLogs);
  const q = useQuery({
    queryKey: ["expense-logs", expenseId],
    queryFn: () => listFn({ data: { expenseId } }),
  });
  const logs = q.data ?? [];

  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-background/80 p-2 sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <History className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="truncate text-[14px] font-semibold">Activity log</h3>
              <p className="truncate font-mono text-[11.5px] text-muted-foreground">
                {voucherNo ?? expenseId.slice(0, 8)}
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="h-8 rounded-sm px-2" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {logs.length > 0 && <Counts logs={logs} />}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {q.isLoading ? (
            <div className="grid h-40 place-items-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
              No activity recorded yet.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {logs.map((l) => (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${
                        TONE[l.action] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {ACTION_LABEL[l.action] ?? l.action}
                    </span>
                    <span className="text-[12.5px] font-semibold">
                      {l.actor_name || (l.actor_id ? l.actor_id.slice(0, 8) : "System")}
                    </span>
                    <span className="font-mono text-[11.5px] text-muted-foreground">
                      {fmtWhen(l.created_at)}
                    </span>
                  </div>
                  {l.reason && (
                    <p className="mt-1.5 rounded-sm border-l-2 border-primary bg-muted/40 px-2 py-1.5 text-[12.5px] font-medium leading-snug">
                      Reason: {l.reason}
                    </p>
                  )}
                  {Array.isArray(l.changes) && l.changes.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {l.changes.map((c, i) => (
                        <li
                          key={i}
                          className="flex flex-wrap items-center gap-1.5 text-[12px] leading-snug"
                        >
                          <span className="font-semibold">{c.field}:</span>
                          <span className="rounded-sm bg-rose-50 px-1.5 py-0.5 text-rose-700 line-through">
                            {c.before ?? "—"}
                          </span>
                          <ArrowRight className="size-3 text-muted-foreground" />
                          <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                            {c.after ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
