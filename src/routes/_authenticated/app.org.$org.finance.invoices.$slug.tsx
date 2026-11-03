import { createFileRoute } from "@tanstack/react-router";
import { InvoiceDetail } from "@/components/pages/finance-invoice-detail-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/finance/invoices/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} · Invoice · Company` }],
  }),
  component: InvoiceDetail,
});
