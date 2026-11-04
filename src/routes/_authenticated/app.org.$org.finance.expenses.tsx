import { createFileRoute } from "@tanstack/react-router";
import { ExpensesPage } from "@/components/pages/finance-expenses-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/finance/expenses")({
  head: () => ({ meta: [
    { title: "Company Expenses · Finance · Branta Console" },
    { name: "description", content: "Company expense records, receipts and employee activity history in Branta Console." },
    { property: "og:title", content: "Company Expenses · Finance · Branta Console" },
    { property: "og:description", content: "Company expense records, receipts and employee activity history in Branta Console." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { highlight?: string } =>
    typeof s.highlight === "string" ? { highlight: s.highlight } : {},
  component: ExpensesPage,
});
