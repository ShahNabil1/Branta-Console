import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listExpenseLogs,
  ACTION_LABEL,
  type ExpenseLogRow,
} from "@/lib/expense-logs.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, History, ArrowRight } from "lucide-react";

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
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-full min-w-0 flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border bg-muted/30 px-5 py-5 pr-14 text-left sm:px-6 sm:pr-14">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary"><History className="size-5" /></span>
            <div className="min-w-0">
              <SheetTitle className="text-[16px] font-bold">Activity log</SheetTitle>
              <SheetDescription className="mt-1 break-words font-mono text-[11.5px] [overflow-wrap:anywhere]">
                {voucherNo ?? expenseId.slice(0, 8)}
                {q.data ? ` · ${logs.length} event${logs.length === 1 ? "" : "s"}` : ""}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {logs.length > 0 && <Counts logs={logs} />}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 sm:px-6">
          {q.isLoading ? (
            <div className="grid h-40 place-items-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : q.isError ? (
            <p role="alert" className="py-10 text-center text-[12.5px] text-destructive">Activity could not be loaded.</p>
          ) : logs.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
              No activity recorded yet.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {logs.map((l) => (
                <li key={l.id} className="relative min-w-0 py-4 pl-5 before:absolute before:left-0 before:top-5 before:size-1.5 before:rounded-full before:bg-primary">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
                    <span
                      className="min-w-0 break-words text-[12px] font-bold text-foreground [overflow-wrap:anywhere]"
                    >
                      {ACTION_LABEL[l.action] ?? l.action}
                    </span>
                    <span className="min-w-0 break-words text-right text-[11.5px] font-semibold [overflow-wrap:anywhere]">
                      {l.actor_name || (l.actor_id ? l.actor_id.slice(0, 8) : "System")}
                    </span>
                    <span className="col-span-2 font-mono text-[10.5px] text-muted-foreground">
                      {fmtWhen(l.created_at)}
                    </span>
                  </div>
                  {l.reason && (
                    <p className="mt-2 break-words rounded-sm border-l-2 border-primary bg-muted/40 px-3 py-2 text-[12px] font-medium leading-relaxed [overflow-wrap:anywhere]">
                      Reason: {l.reason}
                    </p>
                  )}
                  {Array.isArray(l.changes) && l.changes.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {l.changes.map((c, i) => (
                        <li
                          key={i}
                          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5 text-[12px] leading-snug"
                        >
                          <span className="col-span-3 break-words font-semibold [overflow-wrap:anywhere]">{c.field}:</span>
                          <span className="min-w-0 break-words rounded-sm bg-muted px-2 py-1 text-muted-foreground line-through [overflow-wrap:anywhere]">
                            {c.before ?? "—"}
                          </span>
                          <ArrowRight className="mt-1 size-3 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 break-words rounded-sm bg-accent px-2 py-1 font-medium text-accent-foreground [overflow-wrap:anywhere]">
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
      </SheetContent>
    </Sheet>
  );
}
