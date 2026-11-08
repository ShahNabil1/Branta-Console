import { createFileRoute } from "@tanstack/react-router";
import { TasksPage } from "@/components/pages/tasks-page";

export const Route = createFileRoute("/_authenticated/app/org/$org/tasks")({
  head: () => ({ meta: [{ title: "Tasks · Branta Tech Console" }, { name: "robots", content: "noindex" }] }),
  component: TasksPage,
});
