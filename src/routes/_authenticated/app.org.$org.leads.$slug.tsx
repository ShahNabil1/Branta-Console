import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { LeadDetailPage, searchSchema } from "@/components/pages/lead-detail-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/leads/$slug")({
  component: LeadDetailPage,
  validateSearch: zodValidator(searchSchema),
  head: ({ params }) => ({
    meta: [
      { title: `Lead ${params.slug} · Branta Tech Console` },
      { name: "description", content: "Manage lead details, email conversations and meetings in Branta Tech Console." },
      { property: "og:title", content: `Lead ${params.slug} · Branta Tech Console` },
      { property: "og:description", content: "Manage lead details, email conversations and meetings in Branta Tech Console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
