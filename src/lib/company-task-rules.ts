// Company Tasks: shared, browser-safe rules. The database (RLS + triggers) is the
// real boundary; these mirror it so the UI only offers what the server allows.
export const TASK_STATUSES = [
  { key: "todo", label: "To Do" },
  { key: "doing", label: "Doing" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
] as const;
export type CompanyTaskStatus = (typeof TASK_STATUSES)[number]["key"];

export const TASK_PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
] as const;
export type CompanyTaskPriority = (typeof TASK_PRIORITIES)[number]["key"];

export const MAX_TASK_ASSETS = 30;
export const MAX_TASK_TAGS = 20;

export const statusLabel = (k: string) => TASK_STATUSES.find((s) => s.key === k)?.label ?? k;
export const priorityLabel = (k: string) => TASK_PRIORITIES.find((p) => p.key === k)?.label ?? k;

/** Holding roles (user_roles) that manage Branta Tech tasks: C.E.O, C.O.O, HR + Group Admin. */
export const HOLDING_TASK_MANAGER_ROLES = ["super_admin", "admin", "manager", "coo"] as const;
/** Sister company_members roles that manage that company's tasks: C.E.O, C.O.O, HR. */
export const SISTER_TASK_MANAGER_ROLES = ["super_admin", "coo", "manager"] as const;

export type TaskViewer = { groupAdmin: boolean; isHolding: boolean; holdingRoles: string[]; companyRole: string | null };

/** Mirrors public.can_manage_company_tasks. */
export function canManageCompanyTasks(v: TaskViewer): boolean {
  if (v.groupAdmin) return true;
  if (v.isHolding) return v.holdingRoles.some((r) => (HOLDING_TASK_MANAGER_ROLES as readonly string[]).includes(r));
  return !!v.companyRole && (SISTER_TASK_MANAGER_ROLES as readonly string[]).includes(v.companyRole);
}

export type TaskCapabilities = { edit: boolean; work: boolean; review: boolean };
/** Managers have full control; assignees may submit, comment, tick subtasks and log activity. */
export function taskCapabilities(manage: boolean, assignee: boolean): TaskCapabilities {
  return { edit: manage, work: manage || assignee, review: manage };
}

/** "https://a, b\nc" → unique trimmed http(s) URLs, capped at MAX_TASK_ASSETS. */
export function parseAssetLinks(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const v = raw.trim();
    if (!/^https?:\/\/\S+$/i.test(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length >= MAX_TASK_ASSETS) break;
  }
  return out;
}

export function subtaskProgress(subtasks: { done: boolean }[]): { done: number; total: number } {
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length };
}
