import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { auth } from "@/lib/auth";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    if (data.session.aal !== "aal2") throw redirect({ to: "/two-factor" });
  },
  component: AuthGate,
});

const IDLE_MS = 30 * 60 * 1000;

function AuthGate() {
  const navigate = useNavigate();
  useIdleTimeout(IDLE_MS, async () => {
    await auth.signOut();
    navigate({ to: "/login", search: { reason: "idle" } });
  });
  return <Outlet />;
}
