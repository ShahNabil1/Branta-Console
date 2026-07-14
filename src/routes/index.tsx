import { createFileRoute, redirect } from "@tanstack/react-router";
import { auth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await auth.getSession();
    if (data.session) throw redirect({ to: "/app" });
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
