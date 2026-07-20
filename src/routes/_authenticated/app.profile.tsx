import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { User, Wallet, ShieldCheck, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "Profile · Branta Tech" }] }),
  component: ProfileLayout,
});

const TABS = [
  { to: "/app/profile/personal", label: "Personal Information", icon: User },
  { to: "/app/profile/finance", label: "Finance & Wallet", icon: Wallet },
  { to: "/app/profile/security", label: "Security & Notification", icon: ShieldCheck },
  { to: "/app/profile/activity", label: "My Activity", icon: Activity },
] as const;

function ProfileLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-6 px-6 pt-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Account
            </div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
              Profile
            </h1>
          </div>
        </div>
        <nav className="mx-auto mt-4 flex max-w-5xl items-center gap-1 overflow-x-auto px-4">
          {TABS.map((t) => {
            const active =
              pathname === t.to || pathname.startsWith(t.to + "/");
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "border-brand text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.75} />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
