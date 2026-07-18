import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Mail,
  Calendar,
  Settings,
  Shield,
  BarChart3,
  Inbox,
  ChevronsLeft,
  LogOut,
  UserPlus,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import brandLogo from "@/assets/brand-logo.png.asset.json";
import type { LucideIcon } from "lucide-react";

type NavItem = { label: string; to: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", to: "/app", icon: LayoutDashboard },
      { label: "Analytics", to: "/app", icon: BarChart3 },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Leads", to: "/app/leads", icon: Users },
      { label: "Inbox", to: "/app/inbox", icon: Inbox },
    ],
  },
  {
    label: "Comms",
    items: [
      { label: "Email", to: "/app", icon: Mail },
      { label: "Mail queue", to: "/app/mail-queue", icon: Send },
      { label: "Calendar", to: "/app", icon: Calendar },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Employees", to: "/app/employees", icon: UserPlus },
      { label: "Settings", to: "/app/settings", icon: Settings },
      { label: "Security", to: "/app/settings", icon: Shield },
    ],
  },
];

const COLLAPSE_KEY = "branta.sidebar.collapsed";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [email, setEmail] = useState<string>("");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

  const initials =
    email
      .split("@")[0]
      ?.split(/[._-]/)
      .map((p) => p[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "BT";

  return (
    <aside
      className={cn(
        "hairline-r flex shrink-0 flex-col bg-card transition-[width] duration-150",
        collapsed ? "w-14" : "w-60",
      )}
    >
      {/* Logo + collapse */}
      <div className="hairline-b flex h-14 items-center justify-between px-3">
        <Link to="/app" className="flex items-center gap-2 overflow-hidden">
          <img
            src={brandLogo.url}
            alt="Branta"
            className={cn("h-6 w-auto shrink-0", collapsed && "h-7")}
          />
        </Link>
        <button
          onClick={toggle}
          className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <ChevronsLeft
            className={cn("size-3.5 transition-transform", collapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="px-2 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label + item.to}
                    to={item.to}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] font-medium transition-colors active:scale-[0.98]",
                      active
                        ? "bg-brand-50 text-brand"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      collapsed && "justify-center",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Account footer */}
      <div className="hairline-t p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-foreground">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{email || "—"}</div>
              <div className="truncate text-[11px] text-muted-foreground">Operator</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login" });
              }}
              className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
