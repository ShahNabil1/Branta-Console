import { useRouterState } from "@tanstack/react-router";
import { ImpersonationBanner } from "@/components/branta/impersonation-banner";
import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { useSessionWatcher } from "@/hooks/use-session-watcher";
import { IMP_ACTIVE_KEY } from "@/lib/impersonation";
import { getSessionAssurance } from "@/lib/session-assurance.functions";

// Per-session cache so passkey assurance is checked once per auth session, not per navigation.
let strongSessionId: string | null = null;

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
    if (!impersonating) {
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return { user: userData.user };
      // Passkey sessions are verified server-side (works across tabs and restarts).
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? "";
      let sid: string | null = null;
      try { sid = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).session_id ?? null; } catch { sid = null; }
      if (sid && sid === strongSessionId) return { user: userData.user };
      const strong = await getSessionAssurance().then((r) => r.strong).catch(() => false);
      if (strong) { strongSessionId = sid; return { user: userData.user }; }
      if (aal?.nextLevel === "aal2") {
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
    const { signOutWithLog } = await import("@/lib/sign-out");
    await signOutWithLog("idle_timeout");
    navigate({ to: "/login", search: { reason: "idle" } });
  });
  useSessionWatcher();
  const onboarding = useRouterState({ select: (s) => s.location.pathname.startsWith("/onboarding") });
  return (
    <>
      {onboarding && <ImpersonationBanner />}
      <Outlet />
    </>
  );
}
