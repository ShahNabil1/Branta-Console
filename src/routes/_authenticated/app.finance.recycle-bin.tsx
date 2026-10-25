import { formatCategory } from "@/lib/expense-categories";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDeletedExpenses,
  restoreExpense,
  type DeletedExpenseRow,
} from "@/lib/expense-logs.functions";
import { isFinanceAdminCheck } from "@/lib/finance.functions";
import { parseInsufficient } from "@/lib/fund-ops.functions";
import { ExpenseLogsDialog } from "@/components/finance/expense-logs-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Undo2, History, ArrowLeft, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/finance/recycle-bin")({
  head: () => ({
    meta: [
      { title: "Recycle Bin · Finance · Branta" },
      { name: "description", content: "Recently deleted expense vouchers — recover within 30 days." },
      { property: "og:title", content: "Recycle Bin · Finance · Branta" },
      { property: "og:description", content: "Recently deleted expense vouchers — recover within 30 days." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecycleBinPage,
});

function fmt(n: number, cur: string) {
  return (cur === "BDT" ? "৳ " : "$ ") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function daysLeft(purgeAfter: string | null) {
  if (!purgeAfter) return 30;
  const ms = new Date(purgeAfter).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function DeletedCard({
  r,
  onRestore,
  onLogs,
  busy,
}: {
  r: DeletedExpenseRow;
  onRestore: () => void;
  onLogs: () => void;
  busy: boolean;
}) {
  const left = daysLeft(r.purge_after);
  return (
    <div className="rounded-md border border-border bg-card p-3.5 sm:p-4">
      <div className="rounded-sm border border-rose-200 bg-rose-50/70 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          <Trash2 className="size-3.5 shrink-0 text-rose-600" />
          <span className="font-semibold text-rose-800">
            Deleted by {r.deleted_by_name || "Unknown"}
          </span>
          <span className="font-mono text-[11.5px] text-rose-700">{fmtWhen(r.deleted_at)}</span>
          <span className="ml-auto rounded-sm bg-rose-600 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-white">
            {left} day{left === 1 ? "" : "s"} left
          </span>
        </div>
        <p className="mt-1.5 text-[13px] font-semibold leading-snug text-rose-900">
          Reason: {r.delete_reason || "—"}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {r.voucher_no && (
            <span className="inline-block rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold">
              {r.voucher_no}
            </span>
          )}
          <h3 className="mt-1 truncate text-[15px] font-semibold">{r.vendor || formatCategory(r.category)}</h3>
          <p className="text-[12.5px] text-muted-foreground">
            <span>{formatCategory(r.category)}</span> · {r.spent_on}
            {r.department ? ` · ${r.department}` : ""}
          </p>
          {(r.request_purpose || r.notes) && (
            <p className="mt-1 max-w-xl text-[12.5px] leading-snug text-muted-foreground">
              {r.request_purpose || r.notes}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-[15px] font-semibold text-rose-700">{fmt(r.amount, r.currency)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-8 rounded-sm bg-primary text-[12.5px] hover:bg-brand-700"
          disabled={busy}
          onClick={onRestore}
        >
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Undo2 className="mr-1.5 size-3.5" />}
          Recover
        </Button>
        <Button size="sm" variant="ghost" className="h-8 rounded-sm text-[12.5px]" onClick={onLogs}>
          <History className="mr-1.5 size-3.5" /> Activity log
        </Button>
      </div>
    </div>
  );
}

function RecycleBinPage() {
  const check = useServerFn(isFinanceAdminCheck);
  const listFn = useServerFn(listDeletedExpenses);
  const restoreFn = useServerFn(restoreExpense);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<{ id: string; voucher: string | null } | null>(null);

  const isAdmin = useQuery({ queryKey: ["is-finance-admin"], queryFn: () => check(), staleTime: 60_000 });
  const q = useQuery({
    queryKey: ["expenses-deleted"],
    queryFn: () => listFn(),
    enabled: !!isAdmin.data?.isAdmin,
    staleTime: 10_000,
  });

  const restore = async (r: DeletedExpenseRow) => {
    try {
      setBusyId(r.id);
      await restoreFn({ data: { id: r.id, reason: null } });
      toast.success("Recovered — back in Expenses");
      void q.refetch();
    } catch (e) {
      const info = parseInsufficient((e as Error).message);
      if (info) toast.error(`Fund shortage — cannot recover. Required ৳${info.required.toLocaleString()}, available ৳${info.available.toLocaleString()}, shortfall ৳${info.shortfall.toLocaleString()}. Expense stays in Recycle Bin.`, { duration: 10000 });
      else toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (isAdmin.isLoading)
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!isAdmin.data?.isAdmin)
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-[18px] font-semibold">Finance-only page</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Finance or Super-admin role required.</p>
      </div>
    );

  const rows = q.data ?? [];

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 px-3 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold sm:text-[20px]">Recently deleted</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Deleted expenses stay here for 30 days, then delete themselves permanently. Manual permanent
            delete is not allowed.
          </p>
        </div>
        <Button asChild variant="ghost" className="h-9 rounded-sm">
          <Link to="/app/finance/expenses" search={{}}>
            <ArrowLeft className="mr-1.5 size-3.5" /> Back to Expenses
          </Link>
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid h-40 place-items-center rounded-md border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-4 py-16 text-center">
          <Trash2 className="mx-auto mb-2 size-7 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Recycle Bin is empty.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <DeletedCard
              key={r.id}
              r={r}
              busy={busyId === r.id}
              onRestore={() => void restore(r)}
              onLogs={() => setLogsFor({ id: r.id, voucher: r.voucher_no })}
            />
          ))}
        </div>
      )}

      {logsFor && (
        <ExpenseLogsDialog
          expenseId={logsFor.id}
          voucherNo={logsFor.voucher}
          onClose={() => setLogsFor(null)}
        />
      )}
    </div>
  );
}
