import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) throw redirect({ to: "/login" });

    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      await supabase.auth.signOut();
      throw redirect({ to: "/login" });
    }
    // First-login enforcement: no verified TOTP factor yet → back to login for enrollment.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerified = !!factors?.totp?.some((f) => f.status === "verified");
    if (!hasVerified) {
      await supabase.auth.signOut();
      throw redirect({ to: "/login" });
    }
    return { user: userData.user };
  },
  component: AuthGate,
});

const IDLE_MS = 30 * 60 * 1000;

function AuthGate() {
  const navigate = useNavigate();
  useIdleTimeout(IDLE_MS, async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", search: { reason: "idle" } });
  });
  return <Outlet />;
}
