import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChartPreloader, PRELOADER_CYCLE_MS } from "@/components/branta/chart-preloader";
import { markBooted } from "@/lib/boot-splash";

// Module flag: the intro plays once per page load (login/refresh), not on
// every remount of the shell.
let introPlayed = false;
import { AppSidebar } from "@/components/branta/app-sidebar";
import { TopBar } from "@/components/branta/top-bar";
import { CommandPalette } from "@/components/branta/command-palette";
import { EmailFailureNotifier } from "@/components/branta/email-failure-notifier";
import { InboxNotifier } from "@/components/branta/inbox-notifier";
import { TransferNotifier } from "@/components/branta/transfer-notifier";
import { ImpersonationBanner } from "@/components/branta/impersonation-banner";
import { usePresenceTracker } from "@/hooks/use-presence";
import { getOnboardingStatus } from "@/lib/onboarding.functions";
import { isImpersonating } from "@/lib/impersonation";
import { WorkspaceGate } from "@/components/company/workspace-gate";
import { OrgBridge } from "@/components/company/org-bridge";
import { HoldingRoleGuard } from "@/components/company/holding-role-guard";

export const Route = createFileRoute("/_authenticated/app")({
  ssr: false,
  component: AppShell,
});

function AppShell() {
  const navigate = useNavigate();
  usePresenceTracker();
  const statusFn = useServerFn(getOnboardingStatus);

  // Gate: force new employees through a password change before the app
  // renders. The check is cheap (one profile row) and cached at the layout
  // level, so nested routes don't re-fetch it.
  const status = useQuery({
    queryKey: ["onboarding.status"],
    // Admins impersonating skip onboarding; the employee still sees it.
    queryFn: () =>
      isImpersonating()
        ? Promise.resolve({ mustChangePassword: false, passwordResetPending: false })
        : statusFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!status.data) return;
    if (status.data.mustChangePassword) {
      navigate({ to: "/onboarding/password", replace: true });
    }
  }, [status.data, navigate]);

  // Dashboard Dissolve plays only right after sign-in (flag set by /login).
  // A plain refresh keeps the static boot splash until real data has settled.
  const [fresh] = useState(() => {
    if (introPlayed || typeof window === "undefined") return false;
    try { return sessionStorage.getItem("branta_fresh_login") === "1"; } catch { return false; }
  });
  const [cycleDone, setCycleDone] = useState(!fresh);
  const [capHit, setCapHit] = useState(false);
  const [gone, setGone] = useState(!fresh);
  const fetching = useIsFetching();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const cap = setTimeout(() => setCapHit(true), (fresh ? PRELOADER_CYCLE_MS : 0) + 10_000);
    if (!fresh) return () => clearTimeout(cap);
    const t = setTimeout(() => setCycleDone(true), PRELOADER_CYCLE_MS);
    return () => { clearTimeout(t); clearTimeout(cap); };
  }, [fresh]);
  // Debounce "no queries fetching" so chained queries don't cause an early reveal.
  useEffect(() => {
    if (fetching > 0) { setSettled(false); return; }
    const t = setTimeout(() => setSettled(true), 250);
    return () => clearTimeout(t);
  }, [fetching]);
  const blocked =
    status.data?.mustChangePassword || status.isLoading;
  const leaving = cycleDone && !blocked && (settled || capHit);
  useEffect(() => {
    if (!leaving) return;
    introPlayed = true;
    try { sessionStorage.removeItem("branta_fresh_login"); } catch { /* ignore */ }
    if (!fresh) { markBooted(); return; }
    if (gone) return;
    const t = setTimeout(() => setGone(true), 300);
    return () => clearTimeout(t);
  }, [leaving, gone, fresh]);

  // The overlay stays the first child at a stable position so it is never
  // remounted (a remount restarts the CSS animation mid-cycle).
  const overlay = !fresh || (gone && !blocked) ? null : <ChartPreloader leaving={leaving} />;
  if (blocked) return <>{overlay}</>;

  return (
    <>
    {overlay}
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <ImpersonationBanner />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col md:my-2 md:mr-2 md:overflow-hidden md:rounded-[20px] md:border md:border-border md:bg-card">
          <TopBar />
          <main className="w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <OrgBridge />
            <WorkspaceGate><HoldingRoleGuard><Outlet /></HoldingRoleGuard></WorkspaceGate>
          </main>
        </div>
      </div>
      <CommandPalette />
      <EmailFailureNotifier />
      <InboxNotifier />
      <TransferNotifier />
    </div>
    </>
  );
}


