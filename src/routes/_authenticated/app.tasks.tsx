import { createFileRoute } from "@tanstack/react-router";
import { TasksPage } from "@/components/pages/tasks-page";

export const Route = createFileRoute("/_authenticated/app/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · Branta Tech Console" },
      { name: "description", content: "Day-to-day company tasks with assignees, subtasks, assets, submissions and reviews." },
      { property: "og:title", content: "Tasks · Branta Tech Console" },
      { property: "og:description", content: "Day-to-day company tasks with assignees, subtasks, assets, submissions and reviews." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});
