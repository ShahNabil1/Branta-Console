import { createFileRoute } from "@tanstack/react-router";
import { DraftsPage } from "@/components/pages/lead-drafts-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/leads/drafts")({
  component: DraftsPage,
  head: () => ({
    meta: [
      { title: "Lead drafts · Branta Tech Console" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
