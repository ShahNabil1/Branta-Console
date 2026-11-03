import { createFileRoute } from "@tanstack/react-router";
import { InvoicesPage } from "@/components/pages/finance-invoices-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/finance/invoices/")({
  head: () => ({ meta: [{ title: "Invoices · Finance · Company" }] }),
  component: InvoicesPage,
});
