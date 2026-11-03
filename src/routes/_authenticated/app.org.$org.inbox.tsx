import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/components/pages/inbox-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox · Branta Tech Console" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InboxPage,
});
