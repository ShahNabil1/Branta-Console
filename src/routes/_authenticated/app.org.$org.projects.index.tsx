import { createFileRoute } from "@tanstack/react-router";
import { ProjectsHub } from "./app.projects.index";

export const Route = createFileRoute("/_authenticated/app/org/$org/projects/")({
  head: () => ({ meta: [{ title: "Projects · Branta Tech Console" }, { name: "robots", content: "noindex" }] }),
  component: ProjectsHub,
});
