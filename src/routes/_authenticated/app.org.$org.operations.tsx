import { createFileRoute } from "@tanstack/react-router";
import { OperationsPage } from "./app.operations";

export const Route = createFileRoute("/_authenticated/app/org/$org/operations")({
  head: () => ({ meta: [{ title: "Today's Operations · Branta Tech Console" }, { name: "robots", content: "noindex" }] }),
  component: OperationsPage,
});
