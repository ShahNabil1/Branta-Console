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
  Palette,
  Bell,
  RadioTower,
  Menu,
  X,
  BadgeDollarSign, TrendingUp } from "lucide-react";
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
      { label: "Today's Operations", to: "/app/operations", icon: RadioTower },
      { label: "Analytics", to: "/app/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Lead Dashboard", to: "/app/leads/dashboard", icon: BarChart3 },
      { label: "Leads", to: "/app/leads", icon: Users },
      { label: "Customers", to: "/app/customers", icon: Building2 },
      { label: "Inbox", to: "/app/inbox", icon: Inbox },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Dashboard", to: "/app/finance", icon: PiggyBank },
      { label: "Fund Ledger", to: "/app/finance/funds", icon: Shield },
      { label: "Fund Settings", to: "/app/finance/fund-settings", icon: Settings },
      { label: "Income", to: "/app/finance/income", icon: TrendingUp },
      { label: "Invoices", to: "/app/finance/invoices", icon: FileText },
      { label: "Wallet", to: "/app/finance/wallet", icon: Wallet },
      { label: "Withdrawals", to: "/app/finance/withdrawals", icon: Banknote },
      { label: "Expenses", to: "/app/finance/expenses", icon: Receipt },
      { label: "Salary", to: "/app/finance/salary", icon: BadgeDollarSign },
      { label: "Salary Report", to: "/app/finance/salary-report", icon: BadgeDollarSign },
      { label: "Templates", to: "/app/finance/templates", icon: Palette },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Employees", to: "/app/employees", icon: UserPlus },
      { label: "Transfers", to: "/app/transfers", icon: ArrowLeftRight },
      { label: "Mail queue", to: "/app/mail-queue", icon: Send },
      { label: "Notifications", to: "/app/notifications", icon: Bell },
    ],
  },
];

const COLLAPSE_KEY = "branta.sidebar.collapsed";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const permsFn = useServerFn(getMyPermissions);
  const permsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permsFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

  const nav = useMemo<NavGroup[]>(() => {
    const perms = permsQ.data;
    if (!perms) return NAV;
    const isAdmin = perms.isAdmin ?? perms.isSuperAdmin;
    const isManagement = Boolean(isAdmin || perms.isManager);
    const isSuperAdmin = perms.isSuperAdmin ?? false;
    const isFinance = perms.isFinance ?? isAdmin;
    return NAV.map((g) => {
      if (g.label === "Admin" && !isAdmin) return { ...g, items: [] };
      if (g.label === "Finance" && !isFinance) return { ...g, items: [] };
      return {
        ...g,
        items: g.items.filter((it) => {
          if (it.to === "/app/customers" && !perms.customer_access) return false;
          if (it.to === "/app/operations" && !isManagement) return false;
          if (it.to === "/app/notifications" && !isSuperAdmin) return false;
          return true;
        }),
      };
    }).filter((g) => g.items.length > 0);
  }, [permsQ.data]);



  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="fixed left-3 top-3 z-50 grid size-8 place-items-center rounded-sm border border-border bg-card text-foreground shadow-sm md:hidden"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/30 md:hidden"
        />
      )}
    <aside
      className={cn(
        "hairline-r fixed inset-y-0 left-0 z-40 flex w-[min(19rem,86vw)] shrink-0 flex-col bg-card shadow-xl transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:shadow-none md:transition-[width] md:duration-150",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        collapsed ? "md:w-14" : "md:w-60",
      )}
    >
      {/* Logo + collapse */}
      <div className="hairline-b flex h-14 items-center justify-between px-3">
        <Link to="/app" className="flex items-center gap-2 overflow-hidden">
          <img
            src={brandLogo.url}
            alt="Branta"
            className={cn("h-6 w-auto shrink-0", collapsed && "md:h-7")}
          />
        </Link>
        <button
          onClick={toggle}
          className="hidden size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground md:grid"
          aria-label="Toggle sidebar"
        >
          <ChevronsLeft
            className={cn("size-3.5 transition-transform", collapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        {nav.map((group) => (
          <div key={group.label} className="mb-4">
            <div
              className={cn(
                "px-2 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                collapsed && "md:hidden",
              )}
            >
              {group.label}
            </div>
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
                      collapsed && "md:justify-center",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className={cn("truncate", collapsed && "md:hidden")}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

    </aside>
    </>
  );
}
