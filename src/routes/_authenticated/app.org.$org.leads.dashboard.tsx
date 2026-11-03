import { createFileRoute } from "@tanstack/react-router";
import { LeadDashboardPage } from "@/components/pages/lead-dashboard-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/leads/dashboard")({
  head: () => ({
    meta: [
      { title: "Lead Dashboard — Branta Console" },
      { name: "description", content: "Management summary of leads by status, source, employee and priority." },
      { property: "og:title", content: "Lead Dashboard — Branta Console" },
      { property: "og:description", content: "Management summary of leads by status, source, employee and priority." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadDashboardPage,
});
