import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { useSessionWatcher } from "@/hooks/use-session-watcher";
import { IMP_ACTIVE_KEY } from "@/lib/impersonation";
import { PASSKEY_SESSION_FLAG } from "@/routes/login";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const redirectTo = { to: "/login" as const, search: { redirect: location.href } };
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) throw redirect(redirectTo);

    // Bypass MFA checks while an admin is impersonating another user, OR when
    // the current session was established via a passkey (WebAuthn already
    // provided a strong factor).
    const impersonating =
      typeof window !== "undefined" &&
      sessionStorage.getItem(IMP_ACTIVE_KEY) === "1";
    const viaPasskey =
      typeof window !== "undefined" &&
      sessionStorage.getItem(PASSKEY_SESSION_FLAG) === "1";
    if (!impersonating && !viaPasskey) {
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
  useSessionWatcher();
  return <Outlet />;
}
