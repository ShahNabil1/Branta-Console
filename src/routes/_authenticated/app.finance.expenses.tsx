import { createFileRoute } from "@tanstack/react-router";
import { ExpensesPage } from "@/components/pages/finance-expenses-page";

export const Route = createFileRoute("/_authenticated/app/finance/expenses")({
  head: () => ({ meta: [
    { title: "Expenses · Finance · Branta" },
    { name: "description", content: "Manage company expenses, payment details and receipts in Branta Console." },
    { property: "og:title", content: "Expenses · Finance · Branta" },
    { property: "og:description", content: "Manage company expenses, payment details and receipts in Branta Console." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { highlight?: string } =>
    typeof s.highlight === "string" ? { highlight: s.highlight } : {},
  component: ExpensesPage,
});
