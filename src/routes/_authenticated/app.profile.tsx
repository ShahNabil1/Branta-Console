import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { User, Wallet, ShieldCheck } from "lucide-react";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "Profile · Branta Tech" }] }),
  component: ProfileLayout,
});

const TABS = [
  { to: "/app/profile/personal", label: "Personal Information", icon: User },
  { to: "/app/profile/finance", label: "Finance & Payment", icon: Wallet },
  { to: "/app/profile/security", label: "Security & Notification", icon: ShieldCheck },
] as const;

function ProfileLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-4 px-3 pt-5 sm:gap-6 sm:px-6 sm:pt-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {"\n"}
            </div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
              Profile
            </h1>
          </div>
        </div>
        <UnderlineTabs
          className="mx-auto mt-4 max-w-5xl px-4"
          ariaLabel="Profile sections"
          value={
            TABS.find((t) => pathname === t.to || pathname.startsWith(t.to + "/"))?.to ?? TABS[0].to
          }
          items={TABS.map((t) => ({ id: t.to, label: t.label, icon: t.icon, to: t.to }))}
        />
      </div>
      <Outlet />
    </div>
  );
}
