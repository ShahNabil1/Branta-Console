import { createFileRoute } from "@tanstack/react-router";
import { ExpensesPage } from "@/components/pages/finance-expenses-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/finance/expenses")({
  head: () => ({ meta: [{ title: "Expenses · Finance · Company" }] }),
  validateSearch: (s: Record<string, unknown>): { highlight?: string } =>
    typeof s.highlight === "string" ? { highlight: s.highlight } : {},
  component: ExpensesPage,
});
