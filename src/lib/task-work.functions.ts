// Work updates feed, work submissions + review, and protected project/task finance.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface WorkUpdate {
  id: string; author_id: string; author_name: string | null; author_avatar: string | null;
  body: string; items_done: number | null; is_manager: boolean; edited_at: string | null; created_at: string;
}
export interface SubmissionLink { kind: "drive" | "folder" | "file"; url: string }
export interface WorkSubmission {
  id: string; no: number; submitted_by: string; submitter_name: string | null; submitter_avatar: string | null;
  links: SubmissionLink[]; notes: string | null; items_completed: number | null;
  status: "submitted" | "approved" | "revision_requested" | "rejected" | "completed";
  reviewer_name: string | null; review_note: string | null; reviewed_at: string | null; created_at: string;
}
export const PAYMENT_STATUSES = [
  { key: "not_invoiced", label: "Not Invoiced" },
  { key: "invoice_sent", label: "Invoice Sent" },
  { key: "partial_paid", label: "Partial Paid" },
  { key: "paid", label: "Paid" },
  { key: "due", label: "Due" },
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]["key"];
export interface FinanceRow {
  project_value: number; paid_amount: number; due_amount: number; payment_status: PaymentStatus;
  payment_date: string | null; currency: string; updated_at: string | null;
}

async function profileMap(sb: any, ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter(Boolean))] as string[];
  const m = new Map<string, { name: string | null; avatar: string | null }>();
  if (!u.length) return m;
  const { data } = await sb.from("profiles").select("user_id, full_name, avatar_url").in("user_id", u);
  for (const p of data ?? []) m.set(p.user_id, { name: p.full_name, avatar: p.avatar_url });
  return m;
}
async function canManage(sb: any, taskId: string, userId: string) {
  const { data } = await sb.rpc("can_manage_task", { _task_id: taskId, _user: userId });
  return !!data;
}
async function notifySafe(input: any) {
  try { const { notify } = await import("@/lib/notify.server"); await notify(input); }
  catch (e) { console.warn("[task-work] notify failed", e); }
}
async function logEvent(sb: any, taskId: string, actor: string, status: string, note: string | null, meta: Record<string, unknown> = {}) {
  const { data: t } = await sb.from("client_tasks").select("customer_id").eq("id", taskId).single();
  if (t) await sb.from("client_task_events").insert({ task_id: taskId, customer_id: t.customer_id, status, note, actor_id: actor, meta });
}

const Id = z.object({ taskId: z.string().uuid() });

// ---------- Work updates ----------
export const listWorkUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Id.parse(d))
  .handler(async ({ data, context }): Promise<WorkUpdate[]> => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("client_task_updates").select("*").eq("task_id", data.taskId).order("created_at");
    if (error) throw new Error(error.message);
    const pm = await profileMap(sb, (rows ?? []).map((r: any) => r.author_id));
    return (rows ?? []).map((r: any) => ({
      id: r.id, author_id: r.author_id, body: r.body, items_done: r.items_done != null ? Number(r.items_done) : null,
      is_manager: r.is_manager, edited_at: r.edited_at, created_at: r.created_at,
      author_name: pm.get(r.author_id)?.name ?? null, author_avatar: pm.get(r.author_id)?.avatar ?? null,
    }));
  });

export const postWorkUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Id.extend({
    body: z.string().trim().min(1, "Write an update").max(2000),
    items_done: z.number().nonnegative().max(100000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const mgr = await canManage(sb, data.taskId, context.userId);
    const { error } = await sb.from("client_task_updates").insert({
      task_id: data.taskId, author_id: context.userId, body: data.body, items_done: data.items_done ?? null, is_manager: mgr,
    });
    if (error) throw new Error(error.message);
    // Keep the member's own progress in sync when they report completed items.
    if (data.items_done != null) {
      const { data: a } = await sb.from("client_task_assignees").select("id, done_qty, status").eq("task_id", data.taskId).eq("user_id", context.userId).maybeSingle();
      if (a) await sb.from("client_task_assignees").update({
        done_qty: Number(a.done_qty ?? 0) + data.items_done, status: a.status === "not_started" ? "in_progress" : a.status,
      }).eq("id", a.id);
    }
    const { data: as } = await sb.from("client_task_assignees").select("user_id").eq("task_id", data.taskId);
    const recips = (as ?? []).map((x: any) => x.user_id).filter((u: string) => u !== context.userId);
    if (mgr && recips.length) {
      const { data: t } = await sb.from("client_tasks").select("title").eq("id", data.taskId).single();
      await notifySafe({ event: "task.status_changed", recipients: recips, actorId: context.userId,
        vars: { title: t?.title ?? "", client: "", status: `Manager update: ${data.body.slice(0, 120)}` },
        dedupeKey: `task:${data.taskId}:update:${Date.now()}` });
    }
    return { ok: true };
  });

export const editWorkUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row, error } = await sb.from("client_task_updates").update({ body: data.body, edited_at: new Date().toISOString() })
      .eq("id", data.id).eq("author_id", context.userId).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Updates can only be edited within 10 minutes");
    return { ok: true };
  });

// ---------- Submissions ----------
const url = z.string().trim().url("Enter a valid link").max(1000).refine((u) => /^https?:\/\//i.test(u), "Link must start with http(s)://");

export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Id.parse(d))
  .handler(async ({ data, context }): Promise<WorkSubmission[]> => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("client_task_submissions").select("*").eq("task_id", data.taskId).order("created_at");
    if (error) throw new Error(error.message);
    const pm = await profileMap(sb, (rows ?? []).flatMap((r: any) => [r.submitted_by, r.reviewed_by]));
    return (rows ?? []).map((r: any, i: number) => ({
      id: r.id, no: i + 1, submitted_by: r.submitted_by, links: r.links ?? [], notes: r.notes,
      items_completed: r.items_completed != null ? Number(r.items_completed) : null, status: r.status,
      review_note: r.review_note, reviewed_at: r.reviewed_at, created_at: r.created_at,
      submitter_name: pm.get(r.submitted_by)?.name ?? null, submitter_avatar: pm.get(r.submitted_by)?.avatar ?? null,
      reviewer_name: r.reviewed_by ? pm.get(r.reviewed_by)?.name ?? null : null,
    })).reverse();
  });

export const submitWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Id.extend({
    links: z.array(z.object({ kind: z.enum(["drive", "folder", "file"]), url })).max(20),
    notes: z.string().trim().max(4000).nullable().optional(),
    items_completed: z.number().nonnegative().max(100000).nullable().optional(),
  }).refine((v) => v.links.length > 0 || (v.notes && v.notes.length > 0), "Add at least one link or a note").parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("client_task_submissions").insert({
      task_id: data.taskId, submitted_by: context.userId, links: data.links, notes: data.notes ?? null,
      items_completed: data.items_completed ?? null, status: "submitted",
    });
    if (error) throw new Error(error.message);
    const { data: t } = await sb.from("client_tasks").select("id, status, title, customer_id, created_by").eq("id", data.taskId).single();
    const pm = await profileMap(sb, [context.userId]);
    const who = pm.get(context.userId)?.name || "Member";
    const note = `${who} submitted work${data.items_completed != null ? ` · ${data.items_completed} items` : ""}`;
    if (t && t.status !== "review") {
      await sb.from("client_tasks").update({ status: "review" }).eq("id", t.id);
      await logEvent(sb, t.id, context.userId, "review", note, { from: t.status });
    }
    await sb.from("client_task_updates").insert({ task_id: data.taskId, author_id: context.userId, body: `📦 ${note}`, items_done: null, is_manager: false });
    if (t) {
      const { data: c } = await sb.from("customers").select("owner_id, name").eq("id", t.customer_id).maybeSingle();
      const recips = [...new Set([t.created_by, c?.owner_id].filter((u) => u && u !== context.userId))];
      if (recips.length) await notifySafe({ event: "task.status_changed", recipients: recips, actorId: context.userId,
        vars: { title: t.title, client: c?.name ?? "", status: "Submitted for Review" }, dedupeKey: `task:${t.id}:submit:${Date.now()}` });
    }
    return { ok: true };
  });

const REVIEW_TO_STEP = { approved: "approved", revision_requested: "revision_requested", rejected: "revision_requested", completed: "completed" } as const;
const REVIEW_LABEL = { approved: "Approved", revision_requested: "Revision requested", rejected: "Rejected", completed: "Marked completed" } as const;

export const reviewSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["approved", "revision_requested", "rejected", "completed"]),
    note: z.string().trim().max(2000).nullable().optional(),
  }).refine((v) => !(["revision_requested", "rejected"].includes(v.action)) || (v.note && v.note.length >= 3), "Please write a note (at least 3 characters)").parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: s, error: e0 } = await sb.from("client_task_submissions").select("id, task_id, submitted_by").eq("id", data.id).single();
    if (e0) throw new Error(e0.message);
    if (!(await canManage(sb, s.task_id, context.userId))) throw new Error("Only managers can review submissions");
    const { error } = await sb.from("client_task_submissions").update({
      status: data.action, review_note: data.note ?? null, reviewed_by: context.userId, reviewed_at: new Date().toISOString(),
    }).eq("id", s.id);
    if (error) throw new Error(error.message);
    const { data: t } = await sb.from("client_tasks").select("id, status, revision_round, title").eq("id", s.task_id).single();
    const step = REVIEW_TO_STEP[data.action];
    const label = REVIEW_LABEL[data.action];
    if (t && t.status !== step) {
      const round = step === "revision_requested" ? t.revision_round + 1 : t.revision_round;
      await sb.from("client_tasks").update({ status: step, revision_round: round }).eq("id", t.id);
      await logEvent(sb, t.id, context.userId, step, `${label}${data.note ? ` — ${data.note}` : ""}`, { from: t.status, ...(step.startsWith("revision") ? { round } : {}) });
    }
    await sb.from("client_task_updates").insert({ task_id: s.task_id, author_id: context.userId, body: `${label}${data.note ? `: ${data.note}` : ""}`, is_manager: true });
    if (s.submitted_by !== context.userId) await notifySafe({ event: "task.status_changed", recipients: [s.submitted_by], actorId: context.userId,
      vars: { title: t?.title ?? "", client: "", status: label }, dedupeKey: `task:${s.task_id}:review:${s.id}:${data.action}` });
    return { ok: true };
  });

// ---------- Finance (finance admins only; RLS enforces it too) ----------
async function isFinance(sb: any, userId: string) {
  const { data } = await sb.rpc("is_finance_admin", { _user_id: userId });
  return !!data;
}
const Target = z.object({ projectId: z.string().uuid().optional(), taskId: z.string().uuid().optional() })
  .refine((v) => !!v.projectId !== !!v.taskId, "Pick a project or a task");

export const getFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Target.parse(d))
  .handler(async ({ data, context }): Promise<{ allowed: boolean; row: FinanceRow | null }> => {
    const sb = context.supabase as any;
    if (!(await isFinance(sb, context.userId))) return { allowed: false, row: null };
    let q = sb.from("client_project_finance").select("*");
    q = data.projectId ? q.eq("project_id", data.projectId) : q.eq("task_id", data.taskId);
    const { data: r } = await q.maybeSingle();
    if (!r) return { allowed: true, row: null };
    const v = Number(r.project_value), p = Number(r.paid_amount);
    return { allowed: true, row: { project_value: v, paid_amount: p, due_amount: Math.max(v - p, 0), payment_status: r.payment_status, payment_date: r.payment_date, currency: r.currency, updated_at: r.updated_at } };
  });

export const saveFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid().optional(), taskId: z.string().uuid().optional(),
    project_value: z.number().nonnegative().max(1e12),
    paid_amount: z.number().nonnegative().max(1e12),
    payment_status: z.enum(PAYMENT_STATUSES.map((s) => s.key) as [PaymentStatus, ...PaymentStatus[]]),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    currency: z.string().trim().min(3).max(3).default("BDT"),
  }).refine((v) => !!v.projectId !== !!v.taskId, "Pick a project or a task")
    .refine((v) => v.paid_amount <= v.project_value || v.project_value === 0, "Paid amount can't be more than project value").parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    if (!(await isFinance(sb, context.userId))) throw new Error("Only management/accounts can edit finance");
    const row = {
      project_id: data.projectId ?? null, task_id: data.taskId ?? null, project_value: data.project_value, paid_amount: data.paid_amount,
      payment_status: data.payment_status, payment_date: data.payment_date ?? null, currency: data.currency.toUpperCase(), updated_by: context.userId,
    };
    const { error } = await sb.from("client_project_finance").upsert(row, { onConflict: data.projectId ? "project_id" : "task_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const suggestPaymentStatus = (value: number, paid: number, current: PaymentStatus): PaymentStatus => {
  if (value > 0 && paid >= value) return "paid";
  if (paid > 0) return "partial_paid";
  return current === "paid" || current === "partial_paid" ? "due" : current;
};
