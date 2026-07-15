import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/branta/app-sidebar";
import { TopBar } from "@/components/branta/top-bar";
import { CommandPalette } from "@/components/branta/command-palette";

export const Route = createFileRoute("/_authenticated/app")({
  ssr: false,
  component: AppShell,
});

function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
