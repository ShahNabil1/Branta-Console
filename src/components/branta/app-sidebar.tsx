import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Settings,
  Shield,
  BarChart3,
  Inbox,
  ChevronsLeft,
  UserPlus,
  Send,
  Building2,
  Wallet,
  FileText,
  Banknote,
  Receipt,
  PiggyBank,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import brandLogo from "@/assets/brand-logo.png.asset.json";
import type { LucideIcon } from "lucide-react";
import { getMyPermissions } from "@/lib/permissions.functions";

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
      { label: "Customers", to: "/app/customers", icon: Building2 },
      { label: "Inbox", to: "/app/inbox", icon: Inbox },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Dashboard", to: "/app/finance", icon: PiggyBank },
      { label: "Invoices", to: "/app/finance/invoices", icon: FileText },
      { label: "Wallet", to: "/app/finance/wallet", icon: Wallet },
      { label: "Withdrawals", to: "/app/finance/withdrawals", icon: Banknote },
      { label: "Expenses", to: "/app/finance/expenses", icon: Receipt },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Employees", to: "/app/employees", icon: UserPlus },
      { label: "Transfers", to: "/app/transfers", icon: ArrowLeftRight },
      { label: "Mail queue", to: "/app/mail-queue", icon: Send },
      { label: "Settings", to: "/app/settings", icon: Settings },
      { label: "Security", to: "/app/settings", icon: Shield },
    ],
  },
];

const COLLAPSE_KEY = "branta.sidebar.collapsed";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

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

    </aside>
  );
}
