import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { IMP_ACTIVE_KEY } from "@/lib/impersonation";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const redirectTo = { to: "/login" as const, search: { redirect: location.href } };
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) throw redirect(redirectTo);

    // Bypass MFA checks while an admin is impersonating another user — the
    // target account may not have TOTP set up, but the admin's original
    // session (still stored in sessionStorage) has already satisfied AAL2.
    const impersonating =
      typeof window !== "undefined" &&
      sessionStorage.getItem(IMP_ACTIVE_KEY) === "1";
    if (!impersonating) {
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        await supabase.auth.signOut();
        throw redirect(redirectTo);
      }
      // First-login enforcement: no verified TOTP factor yet → back to login for enrollment.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasVerified = !!factors?.totp?.some((f) => f.status === "verified");
      if (!hasVerified) {
        await supabase.auth.signOut();
        throw redirect(redirectTo);
      }
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
