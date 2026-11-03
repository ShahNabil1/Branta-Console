import { createFileRoute } from "@tanstack/react-router";
import { InvoicesPage } from "@/components/pages/finance-invoices-page";

export const Route = createFileRoute("/_authenticated/app/finance/invoices/")({
  head: () => ({ meta: [{ title: "Invoices · Finance · Branta" }] }),
  component: InvoicesPage,
});
