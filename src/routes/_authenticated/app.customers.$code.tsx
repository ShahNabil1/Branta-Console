import { createFileRoute } from "@tanstack/react-router";
import { CustomerDetailPage } from "@/components/pages/customer-detail-page";

export const Route = createFileRoute("/_authenticated/app/customers/$code")({
  component: CustomerDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: `Customer ${params.code} · Branta Tech Console` },
      { name: "robots", content: "noindex" },
    ],
  }),
});
