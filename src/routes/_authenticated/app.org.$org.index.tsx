import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { OverviewPage, searchSchema } from "@/components/pages/overview-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Overview · Branta Tech Console" }] }),
  component: OverviewPage,
});
