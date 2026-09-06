import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, TrendingUp } from "lucide-react";
import { isFinanceAdminCheck } from "@/lib/finance.functions";
import { ReportWorkspace } from "@/components/finance/report-workspace";

export const Route = createFileRoute("/_authenticated/app/finance/income")({
  head: () => ({
    meta: [
      { title: "Income · Finance · Branta" },
      { name: "description", content: "Every payment received — invoice instalments and manual income — with advanced filters and PDF, Excel and CSV export." },
      { property: "og:title", content: "Income · Finance · Branta" },
      { property: "og:description", content: "Filter received payments by date, client, project, method and amount, then export the exact result set." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomePage,
});

function IncomePage() {
  const check = useServerFn(isFinanceAdminCheck);
  const isAdmin = useQuery({ queryKey: ["is-finance-admin"], queryFn: () => check(), staleTime: 60_000 });

  if (isAdmin.isLoading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!isAdmin.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <TrendingUp className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-[18px] font-semibold">Finance-only page</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Finance or Super-admin role required.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-[20px] font-semibold text-foreground">Income</h1>
        <p className="text-[12.5px] text-muted-foreground">
          Paid invoice instalments and manual company income in one filterable ledger.
        </p>
      </div>
      <ReportWorkspace kind="income" title="Income transactions" description="Whatever the filters show is exactly what gets exported." />
    </div>
  );
}
