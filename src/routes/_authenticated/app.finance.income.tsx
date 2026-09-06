import { createFileRoute } from "@tanstack/react-router";
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
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-[20px] font-semibold text-foreground">Income</h1>
        <p className="text-[12.5px] text-muted-foreground">
          Paid invoice instalments and manual company income in one filterable ledger.
        </p>
      </div>
      <ReportWorkspace kind="income" title="Income transactions" description="Filtered results below are exactly what gets exported." />
    </div>
  );
}
