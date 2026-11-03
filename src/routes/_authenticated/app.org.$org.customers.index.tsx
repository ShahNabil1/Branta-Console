import { createFileRoute } from "@tanstack/react-router";
import { CustomersPage } from "@/components/pages/customers-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/customers/")({
  component: CustomersPage,
  head: () => ({
    meta: [
      { title: "Customers · Branta Tech Console" },
      {
        name: "description",
        content:
          "All active customers — manually added or auto-imported from converted leads.",
      },
    ],
  }),
});
