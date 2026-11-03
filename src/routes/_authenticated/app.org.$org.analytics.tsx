import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "./app.analytics";

export const Route = createFileRoute("/_authenticated/app/org/$org/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Branta Tech Console" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});
