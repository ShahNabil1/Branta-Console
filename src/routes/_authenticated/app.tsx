import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChartPreloader, PRELOADER_CYCLE_MS } from "@/components/branta/chart-preloader";

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

export const Route = createFileRoute("/_authenticated/app")({
  ssr: false,
  component: AppShell,
});

function AppShell() {
  const navigate = useNavigate();
  usePresenceTracker();
  const statusFn = useServerFn(getOnboardingStatus);

  // Gate: force new employees through password + telegram before the app
  // renders. The check is cheap (one profile row) and cached at the layout
  // level, so nested routes don't re-fetch it.
  const status = useQuery({
    queryKey: ["onboarding.status"],
    // Admins impersonating skip onboarding; the employee still sees it.
    queryFn: () =>
      isImpersonating()
        ? Promise.resolve({ mustChangePassword: false, mustLinkTelegram: false, passwordResetPending: false })
        : statusFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!status.data) return;
    if (status.data.mustChangePassword) {
      navigate({ to: "/onboarding/password", replace: true });
    } else if (status.data.mustLinkTelegram) {
      navigate({ to: "/onboarding/telegram", replace: true });
    }
  }, [status.data, navigate]);

  // Play at least one full preloader cycle per page load; meanwhile the shell
  // renders underneath so every page query starts fetching in the background.
  const [cycleDone, setCycleDone] = useState(introPlayed);
  const [gone, setGone] = useState(introPlayed);
  useEffect(() => {
    if (introPlayed) return;
    const t = setTimeout(() => setCycleDone(true), PRELOADER_CYCLE_MS);
    return () => clearTimeout(t);
  }, []);
  const blocked =
    status.data?.mustChangePassword || status.data?.mustLinkTelegram || status.isLoading;
  const leaving = cycleDone && !blocked;
  useEffect(() => {
    if (!leaving || gone) return;
    introPlayed = true;
    const t = setTimeout(() => setGone(true), 300);
    return () => clearTimeout(t);
  }, [leaving, gone]);

  const overlay = gone ? null : <ChartPreloader leaving={leaving} />;
  if (blocked) return overlay ?? <ChartPreloader />;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {overlay}
      <ImpersonationBanner />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <OrgBridge />
            <WorkspaceGate><Outlet /></WorkspaceGate>
          </main>
        </div>
      </div>
      <CommandPalette />
      <EmailFailureNotifier />
      <InboxNotifier />
      <TransferNotifier />
    </div>
  );
}


