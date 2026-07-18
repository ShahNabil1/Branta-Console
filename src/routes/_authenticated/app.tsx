import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/branta/app-sidebar";
import { TopBar } from "@/components/branta/top-bar";
import { CommandPalette } from "@/components/branta/command-palette";
import { EmailFailureNotifier } from "@/components/branta/email-failure-notifier";
import { InboxNotifier } from "@/components/branta/inbox-notifier";
import { ImpersonationBanner } from "@/components/branta/impersonation-banner";

export const Route = createFileRoute("/_authenticated/app")({
  ssr: false,
  component: AppShell,
});

function AppShell() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <ImpersonationBanner />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette />
      <EmailFailureNotifier />
      <InboxNotifier />
    </div>
  );
}

