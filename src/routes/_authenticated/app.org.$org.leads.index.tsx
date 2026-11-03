import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { LeadsPage, leadsSearchSchema } from "@/components/pages/leads-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/leads/")({
  component: LeadsPage,
  validateSearch: zodValidator(leadsSearchSchema),
  head: () => ({
    meta: [
      { title: "Leads · Branta Tech Console" },
      { property: "og:title", content: "Leads · Branta Tech Console" },
      { property: "og:description", content: "Company-scoped leads and follow-up workspace for Branta Hub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Full CRM leads data grid with filters, real-time updates, and per-lead workspaces.",
      },
    ],
  }),
});
