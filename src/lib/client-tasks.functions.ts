// Client Tasks / Work Orders + team assignment + parcel-style tracking.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const TASK_STEPS = [
  { key: "created", label: "Task Created" },
  { key: "assigned", label: "Team Assigned" },
  { key: "started", label: "Work Started" },
  { key: "in_progress", label: "Production in Progress" },
  { key: "review", label: "Submitted for Review" },
  { key: "revision_requested", label: "Revision Requested" },
  { key: "revision_completed", label: "Revision Completed" },
  { key: "approved", label: "Approved" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Completed" },
] as const;
export type TaskStatus = (typeof TASK_STEPS)[number]["key"];
export const stepLabel = (k: string) => TASK_STEPS.find((s) => s.key === k)?.label ?? k;
export const stepIndex = (k: string) => TASK_STEPS.findIndex((s) => s.key === k);

export const ASSIGNEE_STATUSES = [
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
] as const;
export type AssigneeStatus = (typeof ASSIGNEE_STATUSES)[number]["key"];

export interface TaskAssignee {
  id: string;
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  responsibility: string | null;
  quantity: number | null;
  done_qty: number;
  status: AssigneeStatus;
}
export interface TaskEvent {
  id: string;
  status: string;
  note: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}
export interface ClientTask {
  id: string;
  customer_id: string;
  project_id: string | null;
  project_title: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  title: string;
  instructions: string | null;
  quantity: number | null;
  unit: string | null;
  per_unit_output: number | null;
  total_output: number | null;
  output_unit: string | null;
  priority: string;
  due_on: string | null;
  status: TaskStatus;
  revision_round: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  assignees: TaskAssignee[];
  can_manage: boolean;
}

async function profileMap(sb: any, ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter(Boolean))] as string[];
  const m = new Map<string, { name: string | null; avatar: string | null }>();
  if (!u.length) return m;
  const { data } = await sb.from("profiles").select("user_id, full_name, avatar_url").in("user_id", u);
  for (const p of data ?? []) m.set(p.user_id, { name: p.full_name, avatar: p.avatar_url });
  return m;
}

async function isManager(sb: any, userId: string) {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.some((r: string) => ["admin", "super_admin", "manager"].includes(r))) return true;
  const { data: p } = await sb.rpc("has_permission", { _user_id: userId, _perm: "lead_assign" });
  return !!p;
}

async function hydrate(sb: any, userId: string, rows: any[]): Promise<ClientTask[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [{ data: as }, { data: projs }, { data: custs }, mgr] = await Promise.all([
    sb.from("client_task_assignees").select("*").in("task_id", ids).order("created_at"),
    sb.from("client_projects").select("id, title").in("id", rows.map((r) => r.project_id).filter(Boolean)),
    sb.from("customers").select("id, name, customer_code, owner_id").in("id", [...new Set(rows.map((r) => r.customer_id))]),
    isManager(sb, userId),
  ]);
  const pm = await profileMap(sb, [...(as ?? []).map((a: any) => a.user_id), ...rows.map((r) => r.created_by)]);
  const projMap = new Map((projs ?? []).map((p: any) => [p.id, p.title]));
  const custMap = new Map((custs ?? []).map((c: any) => [c.id, c]));
  return rows.map((r) => {
    const c: any = custMap.get(r.customer_id);
    return {
      ...r,
      project_title: r.project_id ? (projMap.get(r.project_id) as string) ?? null : null,
      customer_name: c?.name ?? null,
      customer_code: c?.customer_code ?? null,
      created_by_name: r.created_by ? pm.get(r.created_by)?.name ?? null : null,
      can_manage: mgr || r.created_by === userId || c?.owner_id === userId,
      assignees: (as ?? [])
        .filter((a: any) => a.task_id === r.id)
        .map((a: any) => ({
          id: a.id, user_id: a.user_id, responsibility: a.responsibility,
          quantity: a.quantity != null ? Number(a.quantity) : null, done_qty: Number(a.done_qty ?? 0), status: a.status,
          name: pm.get(a.user_id)?.name ?? null, avatar_url: pm.get(a.user_id)?.avatar ?? null,
        })),
    };
  });
}

async function logEvent(sb: any, task: { id: string; customer_id: string }, actor: string, status: string, note?: string | null, meta: Record<string, unknown> = {}) {
  await sb.from("client_task_events").insert({ task_id: task.id, customer_id: task.customer_id, status, note: note ?? null, actor_id: actor, meta });
}

async function notifySafe(input: Parameters<typeof import("@/lib/notify.server").notify>[0]) {
  try {
    const { notify } = await import("@/lib/notify.server");
    await notify(input);
  } catch (e) {
    console.warn("[client-tasks] notify failed", e);
  }
}

export const listClientTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string }) => z.object({ customerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("client_tasks").select("*").eq("customer_id", data.customerId).is("archived_at", null).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return hydrate(sb, context.userId, rows ?? []);
  });

export const listMyTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: mine } = await sb.from("client_task_assignees").select("task_id").eq("user_id", context.userId);
    const ids = (mine ?? []).map((m: any) => m.task_id);
    if (!ids.length) return [] as ClientTask[];
    const { data: rows } = await sb.from("client_tasks").select("*").in("id", ids).is("archived_at", null).neq("status", "completed").order("due_on", { ascending: true, nullsFirst: false }).limit(30);
    return hydrate(sb, context.userId, rows ?? []);
  });

export const getTaskEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TaskEvent[]> => {
    const sb = context.supabase as any;
    const { data: ev } = await sb.from("client_task_events").select("*").eq("task_id", data.taskId).order("created_at", { ascending: true });
    const pm = await profileMap(sb, (ev ?? []).map((e: any) => e.actor_id));
    return (ev ?? []).map((e: any) => ({
      id: e.id, status: e.status, note: e.note, meta: e.meta ?? {}, created_at: e.created_at,
      actor_name: e.actor_id ? pm.get(e.actor_id)?.name ?? null : null,
      actor_avatar_url: e.actor_id ? pm.get(e.actor_id)?.avatar ?? null : null,
    }));
  });

const num = z.number().nonnegative().nullable().optional();
const TaskInput = z.object({
  title: z.string().trim().min(2).max(200),
  project_id: z.string().uuid().nullable().optional(),
  instructions: z.string().trim().max(8000).nullable().optional(),
  quantity: num,
  unit: z.string().trim().max(40).nullable().optional(),
  per_unit_output: num,
  total_output: num,
  output_unit: z.string().trim().max(40).nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  due_on: z.string().nullable().optional(),
});

export const createClientTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TaskInput.extend({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row, error } = await sb.from("client_tasks").insert({ ...data, status: "created", created_by: context.userId }).select("id, customer_id").single();
    if (error) throw new Error(error.message);
    await logEvent(sb, row, context.userId, "created", null, { title: data.title });
    if (data.project_id) await sb.from("client_project_activity").insert({
      project_id: data.project_id, customer_id: data.customer_id, actor_id: context.userId, action: "task_created", body: `Task "${data.title}" created`, changes: {},
    }).then(() => {}, () => {});
    return { id: row.id as string };
  });

export const updateClientTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TaskInput.partial().extend({ id: z.string().uuid(), archive: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { id, archive, ...patch } = data;
    const upd: Record<string, unknown> = { ...patch };
    if (archive) upd.archived_at = new Date().toISOString();
    const { data: row, error } = await sb.from("client_tasks").update(upd).eq("id", id).select("id, customer_id").single();
    if (error) throw new Error(error.message);
    return { ok: true, customer_id: row.customer_id as string };
  });

export const setTaskAssignees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      taskId: z.string().uuid(),
      assignees: z.array(z.object({
        user_id: z.string().uuid(),
        responsibility: z.string().trim().max(200).nullable().optional(),
        quantity: num,
        status: z.enum(["not_started", "in_progress", "done"]).optional(),
      })).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: task, error: e0 } = await sb.from("client_tasks").select("id, customer_id, title, status").eq("id", data.taskId).single();
    if (e0) throw new Error(e0.message);
    const { data: existing } = await sb.from("client_task_assignees").select("user_id").eq("task_id", data.taskId);
    const before = new Set((existing ?? []).map((x: any) => x.user_id));
    const after = new Set(data.assignees.map((a) => a.user_id));
    const removed = [...before].filter((u) => !after.has(u as string));
    if (removed.length) {
      const { error } = await sb.from("client_task_assignees").delete().eq("task_id", data.taskId).in("user_id", removed);
      if (error) throw new Error(error.message);
    }
    if (data.assignees.length) {
      const { error } = await sb.from("client_task_assignees").upsert(
        data.assignees.map((a) => ({ task_id: data.taskId, user_id: a.user_id, responsibility: a.responsibility ?? null, quantity: a.quantity ?? null, status: a.status ?? "not_started", assigned_by: context.userId })),
        { onConflict: "task_id,user_id" },
      );
      if (error) throw new Error(error.message);
    }
    const added = data.assignees.filter((a) => !before.has(a.user_id));
    const pm = await profileMap(sb, [...added.map((a) => a.user_id), ...(removed as string[])]);
    const parts: string[] = [];
    if (added.length) parts.push(`Added: ${added.map((a) => pm.get(a.user_id)?.name || "Member").join(", ")}`);
    if (removed.length) parts.push(`Removed: ${(removed as string[]).map((u) => pm.get(u)?.name || "Member").join(", ")}`);
    if (!parts.length) parts.push("Assignments updated");
    if (task.status === "created" && data.assignees.length) {
      await sb.from("client_tasks").update({ status: "assigned" }).eq("id", task.id);
      await logEvent(sb, task, context.userId, "assigned", parts.join(" · "));
    } else {
      await logEvent(sb, task, context.userId, "team_update", parts.join(" · "));
    }
    if (added.length) {
      const { data: c } = await sb.from("customers").select("name").eq("id", task.customer_id).maybeSingle();
      for (const a of added) {
        await notifySafe({
          event: "task.assigned", recipients: [a.user_id], actorId: context.userId,
          vars: { title: task.title, client: c?.name ?? "", responsibility: a.responsibility || "—", qty: a.quantity ?? "—" },
          dedupeKey: `task:${task.id}:assigned:${a.user_id}`,
        });
      }
    }
    return { ok: true };
  });

export const updateMyAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["not_started", "in_progress", "done"]).optional(), done_qty: z.number().nonnegative().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { id, ...patch } = data;
    const { data: row, error } = await sb.from("client_task_assignees").update(patch).eq("id", id).select("task_id, user_id").single();
    if (error) throw new Error(error.message);
    const { data: task } = await sb.from("client_tasks").select("id, customer_id").eq("id", row.task_id).single();
    const pm = await profileMap(sb, [row.user_id]);
    const bits = [patch.status ? ASSIGNEE_STATUSES.find((s) => s.key === patch.status)?.label : null, patch.done_qty != null ? `${patch.done_qty} done` : null].filter(Boolean);
    if (task) await logEvent(sb, task, context.userId, "member_update", `${pm.get(row.user_id)?.name || "Member"}: ${bits.join(" · ")}`);
    return { ok: true };
  });

export const addTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      taskId: z.string().uuid(),
      status: z.enum(TASK_STEPS.map((s) => s.key) as [TaskStatus, ...TaskStatus[]]),
      note: z.string().trim().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: task, error: e0 } = await sb.from("client_tasks").select("id, customer_id, project_id, title, status, revision_round").eq("id", data.taskId).single();
    if (e0) throw new Error(e0.message);
    if (data.status === task.status) throw new Error("Task is already at this status");
    const round = data.status === "revision_requested" ? task.revision_round + 1 : task.revision_round;
    const { error } = await sb.from("client_tasks").update({ status: data.status, revision_round: round }).eq("id", task.id);
    if (error) throw new Error(error.message);
    const meta: Record<string, unknown> = { from: task.status };
    if (data.status.startsWith("revision")) meta.round = round;
    await logEvent(sb, task, context.userId, data.status, data.note ?? null, meta);
    if (task.project_id) await sb.from("client_project_activity").insert({
      project_id: task.project_id, customer_id: task.customer_id, actor_id: context.userId, action: "task_status",
      body: `Task "${task.title}" → ${stepLabel(data.status)}${data.note ? ` — ${data.note}` : ""}`, changes: {},
    }).then(() => {}, () => {});
    const { data: as } = await sb.from("client_task_assignees").select("user_id").eq("task_id", task.id);
    const recips = (as ?? []).map((a: any) => a.user_id).filter((u: string) => u !== context.userId);
    if (recips.length) {
      const { data: c } = await sb.from("customers").select("name").eq("id", task.customer_id).maybeSingle();
      await notifySafe({
        event: "task.status_changed", recipients: recips, actorId: context.userId,
        vars: { title: task.title, client: c?.name ?? "", status: stepLabel(data.status) },
        dedupeKey: `task:${task.id}:status:${data.status}:${Date.now()}`,
      });
    }
    return { ok: true };
  });
