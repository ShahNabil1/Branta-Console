import { createFileRoute } from "@tanstack/react-router";
import { ProjectPage } from "./app.projects.$id";

export const Route = createFileRoute("/_authenticated/app/org/$org/projects/$id")({
  head: () => ({ meta: [{ title: "Project · Branta Tech Console" }, { name: "robots", content: "noindex" }] }),
  component: ProjectPage,
});
