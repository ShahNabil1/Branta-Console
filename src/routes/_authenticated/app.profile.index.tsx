import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/profile/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/profile/personal" });
  },
});
