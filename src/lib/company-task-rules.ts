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

/** Where a task shows: board (live), scheduled (waiting), draft, or archived. Schedules go live at the exact time. */
export type TaskBucket = "board" | "scheduled" | "draft" | "archived";
export function taskBucket(t: { publish_state: string; scheduled_at: string | null; archived_at: string | null }, now = Date.now()): TaskBucket {
  if (t.archived_at) return "archived";
  if (t.publish_state === "draft") return "draft";
  if (t.publish_state === "scheduled" && t.scheduled_at && new Date(t.scheduled_at).getTime() > now) return "scheduled";
  return "board";
}
/** Milliseconds until the next scheduled task goes live (for an exact refresh), or null. */
export function nextGoLiveIn(tasks: { publish_state: string; scheduled_at: string | null; archived_at: string | null }[], now = Date.now()): number | null {
  const times = tasks.filter((t) => taskBucket(t, now) === "scheduled").map((t) => new Date(t.scheduled_at!).getTime() - now);
  return times.length ? Math.max(0, Math.min(...times)) : null;
}

/** Submission uploads: images, PDFs and ZIPs only, stored in Cloudflare R2. */
export const MAX_SUBMISSION_FILES = 20;
export const MAX_SUBMISSION_FILE_BYTES = 50 * 1024 * 1024;
export type SubmissionFileKind = "image" | "pdf" | "zip";
export function submissionFileKind(name: string, mime: string): SubmissionFileKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (["zip"].includes(ext) || ["application/zip", "application/x-zip-compressed"].includes(mime)) return "zip";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "svg", "avif"].includes(ext)) return "image";
  return null;
}
/** R2 key for one person's upload on one task; the database checks this exact prefix. */
export function submissionFileKey(taskId: string, userId: string, name: string, stamp = Date.now()): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
  return `tasks/${taskId}/${userId}/${stamp}-${safe}`;
}

export const WORK_LINK_HINT = "Enter a full web link, like https://drive.google.com/…";
/**
 * Work/asset links: "" stays empty, a bare domain gets https://, anything that is not a
 * real http(s) web address (e.g. "#") returns null so the form can say so.
 */
export function normalizeWorkLink(raw: string): string | null {
  let v = raw.trim();
  if (!v) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return v;
  } catch {
    return null;
  }
}

/** Mirrors trigger sync_company_task_status: the board column follows assignee progress (Done is never moved). */
export function boardStatusFromAssignees(current: CompanyTaskStatus, assignees: string[]): CompanyTaskStatus {
  if (current === "done" || !assignees.length) return current;
  if (assignees.every((s) => s === "submitted" || s === "approved")) return "in_review";
  if (assignees.some((s) => s !== "todo")) return "doing";
  return "todo";
}
