import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Settings,
  ShieldCheck,
  BarChart3,
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
  BellRing,
  RadioTower,
  Menu,
  X,
  BadgeDollarSign,
  TrendingUp,
  ChevronRight,
  Landmark,
  FileStack,
  HandCoins,
  FolderKanban,
  PieChart,
  Gauge,
  Contact,
  History,
  ArrowDownToLine,
  CalendarClock,
  Puzzle,
  Pin,
  PinOff,
  Handshake,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveActivePath } from "@/lib/nav-active";
import { stripOrg } from "@/lib/org-path";
import brandLogo from "@/assets/brand-logo.png.asset.json";
import { getMyPermissions } from "@/lib/permissions.functions";
import { CompanySwitcher, useActiveCompany } from "@/components/company/company-switcher";
import { GmailMark } from "@/components/company/google-account-card";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;
type Tone = "orange" | "sky" | "violet" | "emerald" | "amber" | "rose" | "indigo" | "teal" | "slate" | "brand";
type NavItem = { label: string; to: string; icon: IconType; tone: Tone; brand?: boolean };
type NavGroup = { label: string; items: NavItem[] };
type FinanceNavGroup = NavGroup & { icon: IconType; tone: Tone };

// Icon tile color per tone (soft tinted background + saturated glyph).
const TONE: Record<Tone, string> = {
  brand: "text-muted-foreground",
  orange: "text-muted-foreground",
  sky: "text-muted-foreground",
  violet: "text-muted-foreground",
  emerald: "text-muted-foreground",
  amber: "text-muted-foreground",
  rose: "text-muted-foreground",
  indigo: "text-muted-foreground",
  teal: "text-muted-foreground",
  slate: "text-muted-foreground",
};

const GmailIcon: IconType = ({ className }) => <GmailMark className={className} />;

const NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", to: "/app", icon: LayoutDashboard, tone: "brand" },
      { label: "Today's Operations", to: "/app/operations", icon: RadioTower, tone: "rose" },
      { label: "Projects", to: "/app/projects", icon: FolderKanban, tone: "violet" },
      { label: "Analytics", to: "/app/analytics", icon: PieChart, tone: "sky" },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Lead Dashboard", to: "/app/leads/dashboard", icon: Gauge, tone: "indigo" },
      { label: "Leads", to: "/app/leads", icon: Users, tone: "sky" },
      { label: "Customers", to: "/app/customers", icon: Handshake, tone: "emerald" },
      { label: "Inbox", to: "/app/inbox", icon: GmailIcon, tone: "slate", brand: true },
    ],
  },
  { label: "Finance", items: [] },
  {
    label: "Admin",
    items: [
      { label: "Companies", to: "/app/companies", icon: Building2, tone: "brand" },
      { label: "Employees", to: "/app/employees", icon: UserPlus, tone: "violet" },
      { label: "Transfers", to: "/app/transfers", icon: ArrowLeftRight, tone: "amber" },
      { label: "Mail queue", to: "/app/mail-queue", icon: Send, tone: "sky" },
      { label: "Notifications", to: "/app/notifications", icon: BellRing, tone: "rose" },
      { label: "Extension Settings", to: "/app/tracker-settings", icon: Puzzle, tone: "teal" },
    ],
  },
];

/** Each sister company's own finance pages. */
const SISTER_FINANCE = [
  { label: "Invoice", to: "/app/org/$org/finance/invoices", plain: "/app/finance/invoices", icon: FileText },
  { label: "Expense", to: "/app/org/$org/finance/expenses", plain: "/app/finance/expenses", icon: Receipt },
  { label: "Wallet", to: "/app/org/$org/finance/wallet", plain: "/app/finance/wallet", icon: Wallet },
] as const;

const FINANCE_NAV: FinanceNavGroup[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    tone: "brand",
    items: [
      { label: "Dashboard", to: "/app/finance", icon: LayoutDashboard, tone: "brand" },
      { label: "Fund Analytics", to: "/app/finance/fund-analytics", icon: BarChart3, tone: "sky" },
      { label: "Project Profitability", to: "/app/finance/profitability", icon: TrendingUp, tone: "emerald" },
      { label: "Reconciliation", to: "/app/finance/reconciliation", icon: ShieldCheck, tone: "indigo" },
    ],
  },
  {
    label: "Funds",
    icon: Landmark,
    tone: "emerald",
    items: [
      { label: "Fund Ledger", to: "/app/finance/funds", icon: PiggyBank, tone: "emerald" },
      { label: "Fund Transfers", to: "/app/finance/fund-transfers", icon: ArrowLeftRight, tone: "amber" },
      { label: "Fund Loans", to: "/app/finance/fund-loans", icon: Banknote, tone: "teal" },
      { label: "Fund Settings", to: "/app/finance/fund-settings", icon: Settings, tone: "slate" },
    ],
  },
  {
    label: "Billing",
    icon: FileStack,
    tone: "sky",
    items: [
      { label: "Invoices", to: "/app/finance/invoices", icon: FileText, tone: "sky" },
      { label: "Income", to: "/app/finance/income", icon: TrendingUp, tone: "emerald" },
      { label: "Historical Allocation", to: "/app/finance/historical-allocation", icon: History, tone: "violet" },
    ],
  },
  {
    label: "Team Payments",
    icon: HandCoins,
    tone: "violet",
    items: [
      { label: "Employee Payments", to: "/app/finance/employee-payments", icon: BadgeDollarSign, tone: "emerald" },
      { label: "Employee Wallets", to: "/app/finance/employee-wallets", icon: Wallet, tone: "violet" },
      { label: "Employee Earnings (Legacy)", to: "/app/finance/employee-earnings", icon: Contact, tone: "slate" },
      { label: "Salary", to: "/app/finance/salary", icon: BadgeDollarSign, tone: "amber" },
      { label: "Salary Report", to: "/app/finance/salary-report", icon: CalendarClock, tone: "indigo" },
      { label: "Wallet", to: "/app/finance/wallet", icon: Wallet, tone: "brand" },
      { label: "Withdrawals", to: "/app/finance/withdrawals", icon: ArrowDownToLine, tone: "rose" },
    ],
  },
  {
    label: "Expenses",
    icon: Receipt,
    tone: "rose",
    items: [{ label: "Expenses", to: "/app/finance/expenses", icon: Receipt, tone: "rose" }],
  },
];

const ALL_PATHS = [
  ...NAV.flatMap((g) => g.items.map((i) => i.to)),
  ...FINANCE_NAV.flatMap((g) => g.items.map((i) => i.to)),
];

const COLLAPSE_KEY = "branta.sidebar.collapsed";

function IconTile({ icon: Icon, tone, active, brand, small }: { icon: IconType; tone: Tone; active: boolean; brand?: boolean; small?: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md transition-colors duration-150 group-hover/item:text-foreground",
        small ? "size-6" : "size-7",
        brand ? "" : active ? "text-brand" : TONE[tone],
      )}
    >
      <Icon className={small ? "size-3.5" : "size-4"} strokeWidth={2} />
    </span>
  );
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [peek, setPeek] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFinanceGroups, setOpenFinanceGroups] = useState<string[]>([]);
  const pathname = stripOrg(useRouterState({ select: (s) => s.location.pathname }));
  const { active: activeCompany } = useActiveCompany();
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const activePath = resolveActivePath(pathname, ALL_PATHS);
  const isRouteActive = (to: string) => activePath === to;
  const expanded = !collapsed || peek;

  const activeFinanceGroup = FINANCE_NAV.find((group) =>
    group.items.some((item) => item.to === activePath),
  )?.label;

  useEffect(() => {
    if (!activeFinanceGroup) return;
    setOpenFinanceGroups((current) =>
      current.includes(activeFinanceGroup) ? current : [...current.slice(-1), activeFinanceGroup],
    );
  }, [activeFinanceGroup]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    setPeek(false);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

  const onEnter = () => {
    if (!collapsed) return;
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(true), 120);
  };
  const onLeave = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    if (groupTimer.current) clearTimeout(groupTimer.current);
    setPeek(false);
  };

  const nav = useMemo<NavGroup[]>(() => {
    const perms = permsQ.data;
    if (!perms) return NAV;
    const isAdmin = perms.isAdmin ?? perms.isSuperAdmin;
    const isManagement = Boolean(isAdmin || perms.isManager);
    const isSuperAdmin = perms.isSuperAdmin ?? false;
    const sister = activeCompany && !activeCompany.is_holding;
    const ceo = Boolean(sister && (activeCompany as { canManage?: boolean }).canManage);
    const isFinance = Boolean(perms.isFinance ?? isAdmin) || ceo;
    // In a sister workspace, Branta Finance staff (not admin/CEO) only see Customers + Finance.
    if (sister && !isAdmin && !ceo && perms.isFinance) {
      return NAV.map((g) => g.label === "Finance" ? g : { ...g, items: g.items.filter((it) => it.to === "/app/customers") })
        .filter((g) => g.items.length > 0);
    }
    return NAV.map((g) => {
      if (g.label === "Admin" && !isAdmin) return { ...g, items: [] };
      if (ceo && g.label !== "Admin") return g;
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
    }).filter((g) => (g.label === "Finance" ? isFinance : g.items.length > 0));
  }, [permsQ.data, activeCompany]);

  const toggleFinanceGroup = (label: string) => {
    setOpenFinanceGroups((current) =>
      current.includes(label) ? current.filter((i) => i !== label) : [...current.slice(-1), label],
    );
  };
  // Hover-intent: resting on a section header for a moment opens it.
  const hoverOpenGroup = (label: string) => {
    if (groupTimer.current) clearTimeout(groupTimer.current);
    groupTimer.current = setTimeout(() => {
      setOpenFinanceGroups((current) => (current.includes(label) ? current : [...current.slice(-1), label]));
    }, 260);
  };
  const cancelGroupHover = () => {
    if (groupTimer.current) clearTimeout(groupTimer.current);
  };

  const itemClass = (active: boolean) =>
    cn(
      "group/item relative flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-[13px] font-medium transition-all duration-150 ",
      active
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      !expanded && "md:justify-center md:px-0",
    );

  const ActiveBar = ({ show }: { show: boolean }) =>
    show ? (
      <span className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" />
    ) : null;

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
          className="fixed inset-0 z-30 touch-none overscroll-none bg-foreground/30 md:hidden"
        />
      )}
      {/* Spacer keeps page layout stable while the panel peeks over content */}
      <div
        className={cn(
          "relative hidden shrink-0 transition-[width] duration-200 ease-out md:block",
          collapsed ? "md:w-16" : "md:w-64",
        )}
      >
        <aside
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className={cn(
            "hairline-r fixed inset-y-0 left-0 z-40 flex flex-col bg-card transition-[width,box-shadow] duration-200 ease-out",
            expanded ? "w-64" : "w-16",
            peek && "shadow-2xl shadow-foreground/10",
          )}
        >
          {renderBody(false)}
        </aside>
      </div>
      <aside
        className={cn(
          "hairline-r fixed inset-y-0 left-0 z-40 flex w-[min(19rem,86vw)] flex-col bg-card shadow-xl transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {renderBody(true)}
      </aside>
    </>
  );

  function renderBody(mobile: boolean) {
    const exp = mobile || expanded;
    return (
      <>
        <div className={cn("hairline-b flex min-h-14 items-center gap-1 px-2 py-1.5", !exp && "flex-col px-1.5")}>
          <div className="min-w-0 flex-1 w-full">
            <CompanySwitcher
              collapsed={!exp}
              canManage={Boolean(permsQ.data?.isAdmin ?? permsQ.data?.isSuperAdmin)}
              holdingLogoUrl={brandLogo.url}
            />
          </div>
          {!mobile && exp && (
            <button
              onClick={toggle}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
              aria-label={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
              title={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
            >
              {collapsed ? <Pin className="size-3.5" /> : <ChevronsLeft className="size-4" />}
            </button>
          )}
          {!mobile && !exp && (
            <button
              onClick={toggle}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Expand sidebar"
            >
              <PinOff className="size-3.5" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-2 [scrollbar-width:thin]">
          {nav.map((group) => (
            <div key={group.label} className="mb-3">
              <div
                className={cn(
                  "flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80",
                  !exp && "justify-center px-0",
                )}
              >
                {exp ? group.label : <span className="h-px w-5 bg-border" />}
              </div>
              {group.label === "Finance" && activeCompany && !activeCompany.is_holding ? (
                <div className="space-y-0.5">
                  {SISTER_FINANCE.map((item) => {
                    const active = isRouteActive(item.plain) || (item.plain === "/app/finance/invoices" && (activePath ?? "").startsWith("/app/finance/invoices"));
                    return (
                      <Link key={item.to} to={item.to} params={{ org: activeCompany.slug }} title={!exp ? item.label : undefined} className={itemClass(active)}>
                        <ActiveBar show={active} />
                        <IconTile icon={item.icon} tone="brand" active={active} />
                        {exp && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              ) : group.label === "Finance" ? (
                <div className="space-y-0.5">
                  {FINANCE_NAV.map((fg) => {
                    const open = openFinanceGroups.includes(fg.label) && exp;
                    const containsActive = fg.items.some((i) => isRouteActive(i.to));
                    return (
                      <div key={fg.label} onMouseEnter={() => exp && hoverOpenGroup(fg.label)} onMouseLeave={cancelGroupHover}>
                        <button
                          type="button"
                          onClick={() => toggleFinanceGroup(fg.label)}
                          aria-expanded={open}
                          title={!exp ? fg.label : undefined}
                          className={cn(itemClass(false), "w-full", containsActive && "text-foreground")}
                        >
                          <ActiveBar show={containsActive && !open} />
                          <IconTile icon={fg.icon} tone={fg.tone} active={containsActive} />
                          {exp && <span className="min-w-0 flex-1 truncate text-left">{fg.label}</span>}
                          {exp && (
                            <ChevronRight className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")} />
                          )}
                        </button>
                        <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                          <div className="overflow-hidden">
                            <div className="ml-[18px] space-y-0.5 border-l border-dashed border-border py-1 pl-2">
                              {fg.items.map((item) => {
                                const active = isRouteActive(item.to);
                                return (
                                  <Link key={item.to} to={item.to} className={cn(itemClass(active), "text-[12.5px]")}>
                                    <IconTile icon={item.icon} tone={item.tone} active={active} small />
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
              ) : (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isRouteActive(item.to);
                    return (
                      <Link key={item.label + item.to} to={item.to} title={!exp ? item.label : undefined} className={itemClass(active)}>
                        <ActiveBar show={active} />
                        <IconTile icon={item.icon} tone={item.tone} active={active} brand={item.brand} />
                        {exp && <span className="truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </>
    );
  }
}
