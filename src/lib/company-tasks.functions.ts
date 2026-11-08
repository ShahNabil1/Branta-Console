// Company Tasks: day-to-day internal work per company. Every read/write runs as the
// caller (RLS: can_view/can_manage_company_tasks, can_work_company_task); the admin
// client is used only to read names/avatars of the company's own members after the
// caller's view access is confirmed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";
import { MAX_TASK_ASSETS, MAX_TASK_TAGS } from "@/lib/company-task-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const Workspace = z.string().regex(/^[a-z0-9-]{1,80}$/).optional().nullable();
const Id = z.string().uuid();
const Status = z.enum(["todo", "doing", "in_review", "done"]);
const Priority = z.enum(["low", "normal", "high", "urgent"]);
const PublishState = z.enum(["draft", "scheduled", "live"]);
const Url = z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link.");
const AssetIn = z.object({ title: z.string().trim().max(200).optional().nullable(), url: Url, assignee_id: Id.optional().nullable() });
const SubtaskIn = z.object({ title: z.string().trim().min(1).max(300), assignee_id: Id.optional().nullable() });

export type TaskMember = { user_id: string; name: string; avatar_url: string | null; code: string | null };
export type TaskPerson = { user_id: string; name: string; avatar_url: string | null };
export type CompanyTaskCard = {
  id: string; title: string; description: string | null; priority: string; status: string;
  due_on: string | null; due_time: string | null; tags: string[]; project_id: string | null; project_title: string | null;
  created_by: string; created_at: string; approved_at: string | null;
  publish_state: string; scheduled_at: string | null; archived_at: string | null;
  assignees: TaskPerson[]; subtasks_done: number; subtasks_total: number; comments: number; assets: number;
};
export type CompanyTaskDetail = CompanyTaskCard & {
  created_by_person: TaskPerson | null; approved_by_person: TaskPerson | null;
  assignee_rows: (TaskPerson & { status: string })[];
  subtasks: { id: string; title: string; assignee_id: string | null; done: boolean; done_by: string | null; done_at: string | null; position: number }[];
  asset_rows: { id: string; title: string | null; url: string; assignee_id: string | null; position: number }[];
  submissions: { id: string; user_id: string; asset_id: string | null; link: string | null; note: string | null; status: string; review_note: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string }[];
  comment_rows: { id: string; user_id: string; body: string; created_at: string }[];
  activity: { id: string; actor_id: string; kind: string; detail: Record<string, string | number | boolean | null | string[]>; created_at: string }[];
  people: Record<string, TaskPerson>;
  me: string;
  can: { edit: boolean; work: boolean; review: boolean };
};

async function resolveCompany(sb: Sb, userId: string, workspace?: string | null) {
  const { resolveLeadCompany } = await import("@/lib/lead-company.server");
  return resolveLeadCompany(sb, userId, workspace ?? null);
}
async function rpcBool(sb: Sb, fn: string, args: object) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw dbError(error);
  return Boolean(data);
}
async function assertManage(sb: Sb, userId: string, companyId: string) {
  if (!(await rpcBool(sb, "can_manage_company_tasks", { _company: companyId, _user: userId })))
    throw new Error("Only this company's C.E.O, C.O.O, HR or a Group Admin can manage tasks.");
}
async function taskCompany(sb: Sb, taskId: string): Promise<string> {
  const { data, error } = await sb.from("company_tasks").select("company_id").eq("id", taskId).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new Error("Task not found.");
  return data.company_id;
}
async function log(sb: Sb, userId: string, taskId: string, kind: string, detail: Record<string, unknown> = {}) {
  await sb.from("company_task_activity").insert({ task_id: taskId, actor_id: userId, kind, detail });
}

/** Active members of one company (auth user ids) — only after the caller may view it. */
async function companyMembers(companyId: string): Promise<TaskMember[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const a = supabaseAdmin as Sb;
  const { data: rows, error } = await a.from("company_members").select("user_id").eq("company_id", companyId).eq("is_active", true);
  if (error) throw dbError(error);
  const pids = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
  if (!pids.length) return [];
  const { data: profs, error: pe } = await a.from("profiles").select("id, user_id, full_name, avatar_url, employee_code, deactivated_at").in("id", pids);
  if (pe) throw dbError(pe);
  return (profs ?? [])
    .filter((p: { user_id: string | null; deactivated_at: string | null }) => p.user_id && !p.deactivated_at)
    .map((p: { user_id: string; full_name: string | null; avatar_url: string | null; employee_code: string | null }) => ({ user_id: p.user_id, name: p.full_name || "Team member", avatar_url: p.avatar_url, code: p.employee_code }))
    .sort((x: TaskMember, y: TaskMember) => x.name.localeCompare(y.name));
}
async function peopleFor(ids: string[]): Promise<Record<string, TaskPerson>> {
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return {};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as Sb).from("profiles").select("user_id, full_name, avatar_url").in("user_id", u);
  const out: Record<string, TaskPerson> = {};
  for (const p of data ?? []) out[p.user_id] = { user_id: p.user_id, name: p.full_name || "Team member", avatar_url: p.avatar_url };
  return out;
}

// ---------- Board ----------
export const listCompanyTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspace: Workspace }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const co = await resolveCompany(sb, context.userId, data.workspace);
    const [canView, canManage] = await Promise.all([
      rpcBool(sb, "can_view_company_tasks", { _company: co.id, _user: context.userId }),
      rpcBool(sb, "can_manage_company_tasks", { _company: co.id, _user: context.userId }),
    ]);
    if (!canView) throw new Error("You don't have access to this company's tasks.");
    const { data: tasks, error } = await sb.from("company_tasks")
      .select("id, title, description, priority, status, due_on, due_time, tags, project_id, created_by, created_at, approved_at, position, publish_state, scheduled_at, archived_at")
      .eq("company_id", co.id).order("position", { ascending: false }).limit(1000);
    if (error) throw dbError(error);
    const ids = (tasks ?? []).map((t: { id: string }) => t.id);
    const [asg, subs, coms, assets, projects, members] = await Promise.all([
      ids.length ? sb.from("company_task_assignees").select("task_id, user_id").in("task_id", ids) : { data: [] },
      ids.length ? sb.from("company_task_subtasks").select("task_id, done").in("task_id", ids) : { data: [] },
      ids.length ? sb.from("company_task_comments").select("task_id").in("task_id", ids) : { data: [] },
      ids.length ? sb.from("company_task_assets").select("task_id").in("task_id", ids) : { data: [] },
      sb.from("client_projects").select("id, title, status").eq("company_id", co.id).order("created_at", { ascending: false }).limit(500),
      companyMembers(co.id),
    ]);
    const people = Object.fromEntries(members.map((m) => [m.user_id, m]));
    const extra = await peopleFor((asg.data ?? []).map((a: { user_id: string }) => a.user_id).filter((u: string) => !people[u]));
    const person = (u: string): TaskPerson => people[u] ?? extra[u] ?? { user_id: u, name: "Team member", avatar_url: null };
    const count = (rows: { task_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.task_id === id).length;
    const projTitle = new Map((projects.data ?? []).map((p: { id: string; title: string }) => [p.id, p.title]));
    const cards: CompanyTaskCard[] = (tasks ?? []).map((t: Sb) => {
      const st = (subs.data ?? []).filter((s: { task_id: string }) => s.task_id === t.id);
      return {
        ...t, project_title: t.project_id ? (projTitle.get(t.project_id) as string) ?? null : null,
        assignees: (asg.data ?? []).filter((a: { task_id: string }) => a.task_id === t.id).map((a: { user_id: string }) => person(a.user_id)),
        subtasks_done: st.filter((s: { done: boolean }) => s.done).length, subtasks_total: st.length,
        comments: count(coms.data, t.id), assets: count(assets.data, t.id),
      };
    });
    return {
      company: { id: co.id, slug: co.slug, name: co.name, isHolding: co.isHolding },
      canManage, me: context.userId, tasks: cards, members,
      projects: (projects.data ?? []).map((p: { id: string; title: string; status: string }) => ({ id: p.id, title: p.title, status: p.status })),
    };
  });

// ---------- Detail ----------
export const getCompanyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id }).parse(d))
  .handler(async ({ data, context }): Promise<CompanyTaskDetail> => {
    const sb = context.supabase as Sb;
    const { data: t, error } = await sb.from("company_tasks").select("*").eq("id", data.id).maybeSingle();
    if (error) throw dbError(error);
    if (!t) throw new Error("Task not found.");
    const [asg, subs, assets, sub, com, act, manage, proj] = await Promise.all([
      sb.from("company_task_assignees").select("user_id, status").eq("task_id", t.id),
      sb.from("company_task_subtasks").select("id, title, assignee_id, done, done_by, done_at, position").eq("task_id", t.id).order("position"),
      sb.from("company_task_assets").select("id, title, url, assignee_id, position").eq("task_id", t.id).order("position"),
      sb.from("company_task_submissions").select("*").eq("task_id", t.id).order("created_at", { ascending: false }),
      sb.from("company_task_comments").select("id, user_id, body, created_at").eq("task_id", t.id).order("created_at"),
      sb.from("company_task_activity").select("id, actor_id, kind, detail, created_at").eq("task_id", t.id).order("created_at", { ascending: false }).limit(300),
      rpcBool(sb, "can_manage_company_tasks", { _company: t.company_id, _user: context.userId }),
      t.project_id ? sb.from("client_projects").select("title").eq("id", t.project_id).maybeSingle() : { data: null },
    ]);
    for (const r of [asg, subs, assets, sub, com, act]) if (r.error) throw dbError(r.error);
    const ids = [t.created_by, t.approved_by, ...(asg.data ?? []).map((a: Sb) => a.user_id), ...(sub.data ?? []).flatMap((s: Sb) => [s.user_id, s.reviewed_by]),
      ...(com.data ?? []).map((c: Sb) => c.user_id), ...(act.data ?? []).map((a: Sb) => a.actor_id), ...(subs.data ?? []).flatMap((s: Sb) => [s.assignee_id, s.done_by]),
      ...(assets.data ?? []).map((a: Sb) => a.assignee_id)].filter(Boolean) as string[];
    const people = await peopleFor(ids);
    const P = (u: string) => people[u] ?? { user_id: u, name: "Team member", avatar_url: null };
    const assignee = (asg.data ?? []).some((a: Sb) => a.user_id === context.userId);
    return {
      ...t, project_title: proj.data?.title ?? null,
      assignees: (asg.data ?? []).map((a: Sb) => P(a.user_id)),
      assignee_rows: (asg.data ?? []).map((a: Sb) => ({ ...P(a.user_id), status: a.status })),
      subtasks_done: (subs.data ?? []).filter((s: Sb) => s.done).length, subtasks_total: (subs.data ?? []).length,
      comments: (com.data ?? []).length, assets: (assets.data ?? []).length,
      created_by_person: t.created_by ? P(t.created_by) : null, approved_by_person: t.approved_by ? P(t.approved_by) : null,
      subtasks: subs.data ?? [], asset_rows: assets.data ?? [], submissions: sub.data ?? [], comment_rows: com.data ?? [], activity: act.data ?? [],
      people, me: context.userId, can: { edit: manage, work: manage || assignee, review: manage },
    };
  });

// ---------- Create ----------
export const createCompanyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    workspace: Workspace,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20000).optional().nullable(),
    priority: Priority.default("normal"),
    status: Status.default("todo"),
    due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    due_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(MAX_TASK_TAGS).default([]),
    project_id: Id.optional().nullable(),
    assignees: z.array(Id).max(50).default([]),
    subtasks: z.array(SubtaskIn).max(100).default([]),
    assets: z.array(AssetIn).max(MAX_TASK_ASSETS).default([]),
    publish_state: PublishState.default("live"),
    scheduled_at: z.string().datetime({ offset: true }).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const co = await resolveCompany(sb, context.userId, data.workspace);
    await assertManage(sb, context.userId, co.id);
    const assignees = [...new Set(data.assignees)];
    const inTeam = (u?: string | null) => !u || assignees.includes(u);
    if (!data.subtasks.every((s) => inTeam(s.assignee_id)) || !data.assets.every((a) => inTeam(a.assignee_id)))
      throw new Error("Subtasks and assets can only be marked for this task's assignees.");
    if (data.publish_state === "scheduled" && (!data.scheduled_at || new Date(data.scheduled_at).getTime() <= Date.now()))
      throw new Error("Pick a future start date and time to schedule this task.");
    const { data: t, error } = await sb.from("company_tasks").insert({
      publish_state: data.publish_state, scheduled_at: data.publish_state === "scheduled" ? data.scheduled_at : null,
      company_id: co.id, title: data.title, description: data.description?.trim() || null, priority: data.priority,
      status: data.status, due_on: data.due_on || null, due_time: data.due_on ? data.due_time || null : null, tags: [...new Set(data.tags)], project_id: data.project_id || null, created_by: context.userId,
    }).select("id").single();
    if (error) throw dbError(error);
    try {
      if (assignees.length) {
        const r = await sb.from("company_task_assignees").insert(assignees.map((u) => ({ task_id: t.id, user_id: u })));
        if (r.error) throw dbError(r.error);
      }
      if (data.subtasks.length) {
        const r = await sb.from("company_task_subtasks").insert(data.subtasks.map((s, i) => ({ task_id: t.id, title: s.title, assignee_id: s.assignee_id || null, position: i })));
        if (r.error) throw dbError(r.error);
      }
      if (data.assets.length) {
        const r = await sb.from("company_task_assets").insert(data.assets.map((a, i) => ({ task_id: t.id, title: a.title?.trim() || null, url: a.url, assignee_id: a.assignee_id || null, position: i, created_by: context.userId })));
        if (r.error) throw dbError(r.error);
      }
    } catch (e) {
      await sb.from("company_tasks").delete().eq("id", t.id);
      throw e;
    }
    await log(sb, context.userId, t.id, "created", { title: data.title, publish_state: data.publish_state, scheduled_at: data.publish_state === "scheduled" ? data.scheduled_at : null, assignees: assignees.length, subtasks: data.subtasks.length, assets: data.assets.length });
    return { id: t.id as string };
  });

// ---------- Manager edits ----------
export const updateCompanyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: Id,
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(20000).optional().nullable(),
    priority: Priority.optional(),
    status: Status.optional(),
    due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    due_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(MAX_TASK_TAGS).optional(),
    project_id: Id.optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.id));
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = k === "description" ? (typeof v === "string" ? v.trim() || null : null) : v;
    if (!Object.keys(patch).length) return { ok: true };
    if (patch.status && patch.status !== "done") { patch.approved_by = null; patch.approved_at = null; }
    const { error } = await sb.from("company_tasks").update(patch).eq("id", id);
    if (error) throw dbError(error);
    await log(sb, context.userId, id, patch.status ? "status" : "updated", { fields: Object.keys(patch), status: patch.status });
    return { ok: true };
  });

export const approveCompanyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id, note: z.string().trim().max(1000).optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.id));
    const { error } = await sb.from("company_tasks").update({ status: "done", approved_by: context.userId, approved_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw dbError(error);
    await log(sb, context.userId, data.id, "approved", { note: data.note || null });
    return { ok: true };
  });

export const archiveCompanyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.id));
    const { error } = await sb.from("company_tasks").update({ archived_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw dbError(error);
    await log(sb, context.userId, data.id, "archived");
    return { ok: true };
  });

export const unarchiveCompanyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.id));
    const { error } = await sb.from("company_tasks").update({ archived_at: null }).eq("id", data.id);
    if (error) throw dbError(error);
    await log(sb, context.userId, data.id, "unarchived");
    return { ok: true };
  });

/** Draft / Scheduled / Live. Live now publishes immediately; scheduling needs a future time. */
export const publishCompanyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id, publish_state: PublishState, scheduled_at: z.string().datetime({ offset: true }).optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.id));
    if (data.publish_state === "scheduled" && (!data.scheduled_at || new Date(data.scheduled_at).getTime() <= Date.now()))
      throw new Error("Pick a future start date and time to schedule this task.");
    const patch = data.publish_state === "scheduled" ? { publish_state: "scheduled", scheduled_at: data.scheduled_at }
      : data.publish_state === "live" ? { publish_state: "live", scheduled_at: null }
      : { publish_state: "draft", scheduled_at: null };
    const { error } = await sb.from("company_tasks").update(patch).eq("id", data.id);
    if (error) throw dbError(error);
    await log(sb, context.userId, data.id, data.publish_state === "live" ? "published" : data.publish_state === "scheduled" ? "scheduled" : "drafted", { scheduled_at: patch.scheduled_at ?? null });
    return { ok: true };
  });

/** Only tasks nobody has started (draft or scheduled, not yet live) can be deleted for good. */
export const deleteCompanyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.id));
    const { data: t, error: e } = await sb.from("company_tasks").select("publish_state, scheduled_at").eq("id", data.id).maybeSingle();
    if (e) throw dbError(e);
    if (!t) throw new Error("Task not found.");
    const live = t.publish_state === "live" || (t.publish_state === "scheduled" && new Date(t.scheduled_at).getTime() <= Date.now());
    if (live) throw new Error("This task is already live. Archive it instead.");
    const { error } = await sb.from("company_tasks").delete().eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true };
  });

export const setCompanyTaskAssignees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id, userIds: z.array(Id).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.id));
    const want = [...new Set(data.userIds)];
    const { data: cur, error } = await sb.from("company_task_assignees").select("user_id").eq("task_id", data.id);
    if (error) throw dbError(error);
    const have = (cur ?? []).map((r: { user_id: string }) => r.user_id);
    const add = want.filter((u) => !have.includes(u)), del = have.filter((u: string) => !want.includes(u));
    if (add.length) { const r = await sb.from("company_task_assignees").insert(add.map((u) => ({ task_id: data.id, user_id: u }))); if (r.error) throw dbError(r.error); }
    if (del.length) {
      const r = await sb.from("company_task_assignees").delete().eq("task_id", data.id).in("user_id", del); if (r.error) throw dbError(r.error);
      await sb.from("company_task_subtasks").update({ assignee_id: null }).eq("task_id", data.id).in("assignee_id", del);
      await sb.from("company_task_assets").update({ assignee_id: null }).eq("task_id", data.id).in("assignee_id", del);
    }
    if (add.length || del.length) await log(sb, context.userId, data.id, "assignees", { added: add, removed: del });
    return { ok: true };
  });

export const addCompanyTaskSubtask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: Id }).merge(SubtaskIn).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.taskId));
    const { count } = await sb.from("company_task_subtasks").select("id", { count: "exact", head: true }).eq("task_id", data.taskId);
    const { error } = await sb.from("company_task_subtasks").insert({ task_id: data.taskId, title: data.title, assignee_id: data.assignee_id || null, position: count ?? 0 });
    if (error) throw dbError(error);
    await log(sb, context.userId, data.taskId, "subtask_added", { title: data.title });
    return { ok: true };
  });

export const updateCompanyTaskSubtask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id, done: z.boolean().optional(), title: z.string().trim().min(1).max(300).optional(), assignee_id: Id.optional().nullable(), remove: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: s, error } = await sb.from("company_task_subtasks").select("task_id, title").eq("id", data.id).maybeSingle();
    if (error) throw dbError(error);
    if (!s) throw new Error("Subtask not found.");
    if (data.remove) {
      const r = await sb.from("company_task_subtasks").delete().eq("id", data.id); if (r.error) throw dbError(r.error);
      await log(sb, context.userId, s.task_id, "subtask_removed", { title: s.title });
      return { ok: true };
    }
    const patch: Record<string, unknown> = {};
    if (data.done !== undefined) patch.done = data.done;
    if (data.title !== undefined) patch.title = data.title;
    if (data.assignee_id !== undefined) patch.assignee_id = data.assignee_id;
    const { data: rows, error: ue } = await sb.from("company_task_subtasks").update(patch).eq("id", data.id).select("id");
    if (ue) throw dbError(ue);
    if (!rows?.length) throw new Error("Only this task's assignees can update subtasks.");
    await log(sb, context.userId, s.task_id, data.done !== undefined ? (data.done ? "subtask_done" : "subtask_reopened") : "subtask_edited", { title: data.title ?? s.title });
    return { ok: true };
  });

export const addCompanyTaskAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: Id, assets: z.array(AssetIn).min(1).max(MAX_TASK_ASSETS) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await assertManage(sb, context.userId, await taskCompany(sb, data.taskId));
    const { count } = await sb.from("company_task_assets").select("id", { count: "exact", head: true }).eq("task_id", data.taskId);
    if ((count ?? 0) + data.assets.length > MAX_TASK_ASSETS) throw new Error(`A task can hold at most ${MAX_TASK_ASSETS} assets.`);
    const { error } = await sb.from("company_task_assets").insert(data.assets.map((a, i) => ({ task_id: data.taskId, title: a.title?.trim() || null, url: a.url, assignee_id: a.assignee_id || null, position: (count ?? 0) + i, created_by: context.userId })));
    if (error) throw dbError(error);
    await log(sb, context.userId, data.taskId, "assets_added", { count: data.assets.length });
    return { ok: true };
  });

export const updateCompanyTaskAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id, assignee_id: Id.optional().nullable(), title: z.string().trim().max(200).optional().nullable(), remove: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: a, error } = await sb.from("company_task_assets").select("task_id, url").eq("id", data.id).maybeSingle();
    if (error) throw dbError(error);
    if (!a) throw new Error("Asset not found.");
    await assertManage(sb, context.userId, await taskCompany(sb, a.task_id));
    if (data.remove) {
      const r = await sb.from("company_task_assets").delete().eq("id", data.id); if (r.error) throw dbError(r.error);
      await log(sb, context.userId, a.task_id, "asset_removed", { url: a.url });
      return { ok: true };
    }
    const patch: Record<string, unknown> = {};
    if (data.assignee_id !== undefined) patch.assignee_id = data.assignee_id;
    if (data.title !== undefined) patch.title = data.title || null;
    const r = await sb.from("company_task_assets").update(patch).eq("id", data.id); if (r.error) throw dbError(r.error);
    await log(sb, context.userId, a.task_id, "asset_updated", { url: a.url, assignee_id: data.assignee_id });
    return { ok: true };
  });

// ---------- Assignee work ----------
export const submitCompanyTaskWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: Id, assetId: Id.optional().nullable(), link: Url.optional().nullable().or(z.literal("")), note: z.string().trim().max(4000).optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    if (!(await rpcBool(sb, "can_work_company_task", { _task: data.taskId, _user: context.userId })))
      throw new Error("Only this task's assignees can submit work.");
    const { error } = await sb.from("company_task_submissions").insert({ task_id: data.taskId, asset_id: data.assetId || null, user_id: context.userId, link: data.link || null, note: data.note || null });
    if (error) throw dbError(error);
    await sb.from("company_task_assignees").update({ status: "submitted" }).eq("task_id", data.taskId).eq("user_id", context.userId);
    await log(sb, context.userId, data.taskId, "submitted", { asset_id: data.assetId || null, link: data.link || null });
    return { ok: true };
  });

export const reviewCompanyTaskSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id, decision: z.enum(["approved", "revision"]), note: z.string().trim().max(2000).optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: s, error } = await sb.from("company_task_submissions").select("task_id, user_id").eq("id", data.id).maybeSingle();
    if (error) throw dbError(error);
    if (!s) throw new Error("Submission not found.");
    await assertManage(sb, context.userId, await taskCompany(sb, s.task_id));
    const r = await sb.from("company_task_submissions").update({ status: data.decision, review_note: data.note || null }).eq("id", data.id);
    if (r.error) throw dbError(r.error);
    await sb.from("company_task_assignees").update({ status: data.decision }).eq("task_id", s.task_id).eq("user_id", s.user_id);
    await log(sb, context.userId, s.task_id, data.decision === "approved" ? "submission_approved" : "revision_requested", { for: s.user_id, note: data.note || null });
    return { ok: true };
  });

export const setMyCompanyTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: Id, status: z.enum(["todo", "doing"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: rows, error } = await sb.from("company_task_assignees").update({ status: data.status }).eq("task_id", data.taskId).eq("user_id", context.userId).select("id");
    if (error) throw dbError(error);
    if (!rows?.length) throw new Error("You are not assigned to this task.");
    await log(sb, context.userId, data.taskId, "my_status", { status: data.status });
    return { ok: true };
  });

export const addCompanyTaskComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: Id, body: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { error } = await sb.from("company_task_comments").insert({ task_id: data.taskId, user_id: context.userId, body: data.body });
    if (error) throw dbError(error);
    await log(sb, context.userId, data.taskId, "commented");
    return { ok: true };
  });

export const deleteCompanyTaskComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Id }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: rows, error } = await sb.from("company_task_comments").delete().eq("id", data.id).select("task_id");
    if (error) throw dbError(error);
    if (!rows?.length) throw new Error("You can't remove this comment.");
    await log(sb, context.userId, rows[0].task_id, "comment_removed");
    return { ok: true };
  });

export const addCompanyTaskNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: Id, note: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { error } = await sb.from("company_task_activity").insert({ task_id: data.taskId, actor_id: context.userId, kind: "note", detail: { note: data.note } });
    if (error) throw dbError(error);
    return { ok: true };
  });
