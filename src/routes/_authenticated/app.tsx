import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/branta/app-sidebar";
import { TopBar } from "@/components/branta/top-bar";
import { CommandPalette } from "@/components/branta/command-palette";
import { EmailFailureNotifier } from "@/components/branta/email-failure-notifier";
import { InboxNotifier } from "@/components/branta/inbox-notifier";
import { TransferNotifier } from "@/components/branta/transfer-notifier";
import { ImpersonationBanner } from "@/components/branta/impersonation-banner";
import { usePresenceTracker } from "@/hooks/use-presence";
import { getOnboardingStatus } from "@/lib/onboarding.functions";

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
    queryFn: () => statusFn(),
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

  if (
    status.data?.mustChangePassword ||
    status.data?.mustLinkTelegram ||
    status.isLoading
  ) {
    return (
      <div className="grid h-screen w-full place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-2 text-[13px]">
          <Loader2 className="size-4 animate-spin" />
          Preparing your workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <ImpersonationBanner />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <Outlet />
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


