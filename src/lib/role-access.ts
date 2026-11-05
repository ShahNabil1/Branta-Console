// Branta Tech (holding) role model. DB values stay stable; only labels/access change.
// super_admin = Group Admin, finance = Accounts, admin = HR, manager = C.E.O, coo = C.O.O, user = Executive.
export type AppRole = "super_admin" | "admin" | "finance" | "manager" | "coo" | "user";

export const ROLE_ORDER: AppRole[] = ["super_admin", "admin", "finance", "manager", "coo", "user"];

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Group Admin (GA)",
  finance: "Accounts",
  admin: "HR",
  manager: "C.E.O",
  coo: "C.O.O",
  user: "Executive",
};

export const ROLE_NOTE: Record<AppRole, string> = {
  super_admin: "Full control of every company.",
  finance: "Finance & Customers of every company.",
  admin: "Workspace, CRM, Expenses, Wallets & Employees of every company.",
  manager: "Full control of Branta Tech only.",
  coo: "Full control of Branta Tech only.",
  user: "Workspace & CRM of Branta Tech only.",
};

export const roleLabel = (r: string) => ROLE_LABEL[r as AppRole] ?? r;

export type RolePerms = { isSuperAdmin?: boolean; isAdmin?: boolean; isFinance?: boolean; isManager?: boolean; roles?: string[] };

const WORKSPACE_CRM = ["/app", "/app/operations", "/app/projects", "/app/analytics", "/app/leads/dashboard", "/app/leads", "/app/customers", "/app/inbox"];
const HR_EXTRA = ["/app/finance/expenses", "/app/finance/employee-wallets", "/app/tracker-settings", "/app/employees"];

const under = (path: string, base: string) => base === "/app" ? path === "/app" || path === "/app/" : path === base || path.startsWith(base + "/");

/** Which Branta Tech pages a role may open. Profile/settings-free shared pages are always allowed. */
export function holdingPageAllowed(p: RolePerms, path: string): boolean {
  if (p.isSuperAdmin) return true;
  if (path.startsWith("/app/profile") || path.startsWith("/app/org/") || path.startsWith("/app/companies")) return true;
  // Employee detail is server-gated (holding admin or that employee's sister-company CEO/COO).
  if (/^\/app\/employees\/[^/]+\/?$/.test(path)) return true;
  const roles = p.roles ?? [];
  if (roles.includes("manager") || roles.includes("coo")) {
    return !under(path, "/app/notifications");
  }
  if (roles.includes("admin")) {
    return [...WORKSPACE_CRM, ...HR_EXTRA].some((b) => under(path, b));
  }
  if (roles.includes("finance")) {
    return under(path, "/app/finance") || under(path, "/app/customers");
  }
  return WORKSPACE_CRM.some((b) => under(path, b));
}
