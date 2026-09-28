import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ClientTask, TaskAssignee, TaskStatus } from "@/lib/client-tasks.functions";

export interface OperationsTask extends ClientTask {
  latest_activity_at: string;
  latest_activity_label: string;
  completed_today: number;
}

export interface OperationsDashboard {
  allowed: boolean;
  date_key: string;
  date_label: string;
  generated_at: string;
  metrics: {
    active_clients: number;
    assigned_today: number;
    work_completed: number;
    awaiting_review: number;
    revision_required: number;
    completed_today: number;
  };
  tasks: OperationsTask[];
}

const EMPTY_METRICS = {
  active_clients: 0,
  assigned_today: 0,
  work_completed: 0,
  awaiting_review: 0,
  revision_required: 0,
  completed_today: 0,
};

function dhakaDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const key = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    key,
    start: `${key}T00:00:00+06:00`,
    end: `${key}T23:59:59.999+06:00`,
    label: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
  };
}

async function hasManagementRole(sb: any, userId: string) {
  const checks = await Promise.all(
    (["super_admin", "admin", "manager"] as const).map((role) =>
      sb.rpc("has_role", { _user_id: userId, _role: role }),
    ),
  );
  return checks.some((result) => result.data === true);
}

export const getTodayOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OperationsDashboard> => {
    const sb = context.supabase as any;
    const day = dhakaDay();
    const generatedAt = new Date().toISOString();
    if (!(await hasManagementRole(sb, context.userId))) {
      return { allowed: false, date_key: day.key, date_label: day.label, generated_at: generatedAt, metrics: EMPTY_METRICS, tasks: [] };
    }

    const [tasksRes, assignmentsRes, eventsRes, updatesRes, submissionsRes] = await Promise.all([
      sb.from("client_tasks").select("*").is("archived_at", null),
      sb.from("client_task_assignees").select("*").lte("created_at", day.end),
      sb.from("client_task_events").select("task_id, status, created_at").gte("created_at", day.start).lte("created_at", day.end),
      sb.from("client_task_updates").select("task_id, body, items_done, created_at").gte("created_at", day.start).lte("created_at", day.end),
      sb.from("client_task_submissions").select("task_id, status, created_at, updated_at").or(`created_at.gte.${day.start},updated_at.gte.${day.start}`),
    ]);
    for (const result of [tasksRes, assignmentsRes, eventsRes, updatesRes, submissionsRes]) {
      if (result.error) throw new Error(result.error.message);
    }

    const tasks = tasksRes.data ?? [];
    const assignments = assignmentsRes.data ?? [];
    const events = (eventsRes.data ?? []).filter((row: any) => row.created_at <= day.end);
    const updates = updatesRes.data ?? [];
    const submissions = (submissionsRes.data ?? []).filter((row: any) =>
      (row.created_at >= day.start && row.created_at <= day.end)
      || (row.updated_at >= day.start && row.updated_at <= day.end),
    );
    const todayTaskIds = new Set<string>();
    for (const task of tasks) {
      if ((task.created_at >= day.start && task.created_at <= day.end) || (task.due_on === day.key && task.status !== "completed")) todayTaskIds.add(task.id);
    }
    for (const row of assignments) if (row.created_at >= day.start) todayTaskIds.add(row.task_id);
    for (const row of [...events, ...updates, ...submissions]) todayTaskIds.add(row.task_id);

    const picked = tasks.filter((task: any) => todayTaskIds.has(task.id));
    const customerIds = [...new Set(picked.map((task: any) => task.customer_id).filter(Boolean))] as string[];
    const projectIds = [...new Set(picked.map((task: any) => task.project_id).filter(Boolean))] as string[];
    const profileIds = [...new Set([
      ...picked.map((task: any) => task.created_by),
      ...assignments.filter((row: any) => todayTaskIds.has(row.task_id)).map((row: any) => row.user_id),
    ].filter(Boolean))] as string[];
    const [customersRes, projectsRes, profilesRes] = await Promise.all([
      customerIds.length ? sb.from("customers").select("id, name, customer_code").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
      projectIds.length ? sb.from("client_projects").select("id, title").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
      profileIds.length ? sb.from("profiles").select("user_id, full_name, avatar_url").in("user_id", profileIds) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [customersRes, projectsRes, profilesRes]) if (result.error) throw new Error(result.error.message);

    const customers = new Map((customersRes.data ?? []).map((row: any) => [row.id, row]));
    const projects = new Map((projectsRes.data ?? []).map((row: any) => [row.id, row.title]));
    const profiles = new Map((profilesRes.data ?? []).map((row: any) => [row.user_id, row]));
    const latest = (taskId: string) => {
      const activity = [
        ...events.filter((row: any) => row.task_id === taskId).map((row: any) => ({ at: row.created_at, label: row.status === "completed" ? "Completed" : "Status updated" })),
        ...updates.filter((row: any) => row.task_id === taskId).map((row: any) => ({ at: row.created_at, label: row.body || "Work updated" })),
        ...submissions.filter((row: any) => row.task_id === taskId).map((row: any) => ({ at: row.updated_at > row.created_at ? row.updated_at : row.created_at, label: row.status === "submitted" ? "Work submitted" : "Submission reviewed" })),
      ].sort((a, b) => b.at.localeCompare(a.at))[0];
      return activity ?? { at: generatedAt, label: "Due today" };
    };

    const hydrated: OperationsTask[] = picked.map((task: any) => {
      const customer: any = customers.get(task.customer_id);
      const activity = latest(task.id);
      const taskAssignments = assignments.filter((row: any) => row.task_id === task.id);
      const taskUpdates = updates.filter((row: any) => row.task_id === task.id);
      return {
        ...task,
        status: task.status as TaskStatus,
        project_title: task.project_id ? (projects.get(task.project_id) as string | undefined) ?? null : null,
        customer_name: customer?.name ?? null,
        customer_code: customer?.customer_code ?? null,
        created_by_name: task.created_by ? (profiles.get(task.created_by) as any)?.full_name ?? null : null,
        can_manage: true,
        assignees: taskAssignments.map((row: any): TaskAssignee => ({
          id: row.id,
          user_id: row.user_id,
          name: (profiles.get(row.user_id) as any)?.full_name ?? null,
          avatar_url: (profiles.get(row.user_id) as any)?.avatar_url ?? null,
          responsibility: row.responsibility,
          quantity: row.quantity == null ? null : Number(row.quantity),
          done_qty: Number(row.done_qty ?? 0),
          status: row.status,
        })),
        latest_activity_at: activity.at,
        latest_activity_label: activity.label,
        completed_today: taskUpdates.reduce((sum: number, row: any) => sum + Number(row.items_done ?? 0), 0),
      };
    }).sort((a: OperationsTask, b: OperationsTask) => b.latest_activity_at.localeCompare(a.latest_activity_at));

    const completedIds = new Set(events.filter((row: any) => row.status === "completed").map((row: any) => row.task_id));
    const assignedIds = new Set(assignments.filter((row: any) => row.created_at >= day.start).map((row: any) => row.task_id));
    return {
      allowed: true,
      date_key: day.key,
      date_label: day.label,
      generated_at: generatedAt,
      metrics: {
        active_clients: new Set(hydrated.filter((task) => task.status !== "completed").map((task) => task.customer_id)).size,
        assigned_today: assignedIds.size,
        work_completed: updates.reduce((sum: number, row: any) => sum + Number(row.items_done ?? 0), 0),
        awaiting_review: hydrated.filter((task) => task.status === "review").length,
        revision_required: hydrated.filter((task) => task.status === "revision_requested").length,
        completed_today: completedIds.size,
      },
      tasks: hydrated,
    };
  });