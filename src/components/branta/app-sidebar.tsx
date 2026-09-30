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
  Bell,
  RadioTower,
  Menu,
  X,
  BadgeDollarSign,
  TrendingUp,
  ChevronRight,
  Landmark,
  FileStack,
  HandCoins,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import brandLogo from "@/assets/brand-logo.png.asset.json";
import type { LucideIcon } from "lucide-react";
import { getMyPermissions } from "@/lib/permissions.functions";
import { Button } from "@/components/ui/button";

type NavItem = { label: string; to: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };
type FinanceNavGroup = NavGroup & { icon: LucideIcon };


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
    items: [],
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

const FINANCE_NAV: FinanceNavGroup[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      { label: "Dashboard", to: "/app/finance", icon: LayoutDashboard },
      { label: "Fund Analytics", to: "/app/finance/fund-analytics", icon: BarChart3 },
      { label: "Project Profitability", to: "/app/finance/profitability", icon: TrendingUp },
      { label: "Reconciliation", to: "/app/finance/reconciliation", icon: Shield },
    ],
  },
  {
    label: "Funds",
    icon: Landmark,
    items: [
      { label: "Fund Ledger", to: "/app/finance/funds", icon: PiggyBank },
      { label: "Fund Transfers", to: "/app/finance/fund-transfers", icon: ArrowLeftRight },
      { label: "Fund Loans", to: "/app/finance/fund-loans", icon: Banknote },
      { label: "Fund Settings", to: "/app/finance/fund-settings", icon: Settings },
    ],
  },
  {
    label: "Billing",
    icon: FileStack,
    items: [
      { label: "Invoices", to: "/app/finance/invoices", icon: FileText },
      { label: "Income", to: "/app/finance/income", icon: TrendingUp },
      { label: "Historical Allocation", to: "/app/finance/historical-allocation", icon: FileText },
    ],
  },
  {
    label: "Team Payments",
    icon: HandCoins,
    items: [
      { label: "Employee Payments", to: "/app/finance/employee-payments", icon: BadgeDollarSign },
      { label: "Employee Wallets", to: "/app/finance/employee-wallets", icon: Wallet },
      { label: "Employee Earnings (Legacy)", to: "/app/finance/employee-earnings", icon: Wallet },
      { label: "Salary", to: "/app/finance/salary", icon: BadgeDollarSign },
      { label: "Salary Report", to: "/app/finance/salary-report", icon: FileText },
      { label: "Wallet", to: "/app/finance/wallet", icon: Wallet },
      { label: "Withdrawals", to: "/app/finance/withdrawals", icon: Banknote },
    ],
  },
  {
    label: "Expenses",
    icon: Receipt,
    items: [{ label: "Expenses", to: "/app/finance/expenses", icon: Receipt }],
  },
  {
    label: "Integrations",
    icon: Plug,
    items: [{ label: "Finance Sheets", to: "/app/finance/sheets", icon: FileText }],
  },
];

const COLLAPSE_KEY = "branta.sidebar.collapsed";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFinanceGroups, setOpenFinanceGroups] = useState<string[]>([]);
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

  const isRouteActive = (to: string) =>
    pathname === to || (to !== "/app/finance" && pathname.startsWith(`${to}/`));

  const activeFinanceGroup = FINANCE_NAV.find((group) =>
    group.items.some((item) => isRouteActive(item.to)),
  )?.label;

  useEffect(() => {
    if (!activeFinanceGroup) return;
    setOpenFinanceGroups((current) => {
      if (current.includes(activeFinanceGroup)) return current;
      return [...current.slice(-1), activeFinanceGroup];
    });
  }, [activeFinanceGroup]);

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
      if (g.label === "Finance") return isFinance ? g : { ...g, items: [] };
      return {
        ...g,
        items: g.items.filter((it) => {
          if (it.to === "/app/customers" && !perms.customer_access) return false;
          if (it.to === "/app/operations" && !isManagement) return false;
          if (it.to === "/app/notifications" && !isSuperAdmin) return false;
          return true;
        }),
      };
    }).filter((g) => g.label === "Finance" ? isFinance : g.items.length > 0);
  }, [permsQ.data]);

  const toggleFinanceGroup = (label: string) => {
    if (collapsed) {
      setCollapsed(false);
      localStorage.setItem(COLLAPSE_KEY, "0");
    }
    setOpenFinanceGroups((current) => {
      if (current.includes(label)) return current.filter((item) => item !== label);
      return [...current.slice(-1), label];
    });
  };



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
            {group.label === "Finance" ? (
              <div className="space-y-0.5">
                {FINANCE_NAV.map((financeGroup) => {
                  const open = openFinanceGroups.includes(financeGroup.label);
                  const containsActive = financeGroup.items.some((item) => isRouteActive(item.to));
                  const GroupIcon = financeGroup.icon;
                  return (
                    <div key={financeGroup.label}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleFinanceGroup(financeGroup.label)}
                        aria-expanded={open}
                        title={collapsed ? financeGroup.label : undefined}
                        className={cn(
                          "h-8 w-full justify-start gap-2 rounded-sm px-2 text-[13px] font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground",
                          containsActive && "text-foreground",
                          collapsed && "md:justify-center",
                        )}
                      >
                        <GroupIcon className="size-4 shrink-0" strokeWidth={1.75} />
                        <span className={cn("min-w-0 flex-1 truncate text-left", collapsed && "md:hidden")}>
                          {financeGroup.label}
                        </span>
                        <ChevronRight
                          className={cn(
                            "size-3.5 shrink-0 transition-transform duration-150",
                            open && "rotate-90",
                            collapsed && "md:hidden",
                          )}
                        />
                      </Button>
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-150",
                          open && !collapsed ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="ml-3 space-y-0.5 border-l border-border py-0.5 pl-2">
                            {financeGroup.items.map((item) => {
                              const active = isRouteActive(item.to);
                              const Icon = item.icon;
                              return (
                                <Link
                                  key={item.to}
                                  to={item.to}
                                  className={cn(
                                    "flex min-h-8 items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] font-medium transition-colors active:scale-[0.98]",
                                    active
                                      ? "bg-brand-50 text-brand"
                                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                  )}
                                >
                                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                                  <span className="truncate">{item.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isRouteActive(item.to);
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
            </div>}
          </div>
        ))}
      </nav>

    </aside>
    </>
  );
}
