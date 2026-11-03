import { createFileRoute } from "@tanstack/react-router";
import { NewInvoicePage } from "@/components/pages/finance-invoice-new-page";

export const Route = createFileRoute("/_authenticated/app/finance/invoices/new")({
  head: () => ({ meta: [{ title: "New Invoice · Finance · Branta" }] }),
  component: NewInvoicePage,
});
