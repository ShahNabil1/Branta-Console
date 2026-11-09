// Project Details: company-configurable project roles, client work updates with
// per-version feedback chat, and the project's invoices/payments (finance admins
// plus the project's Coordinator / Team Lead only).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dbError } from "@/lib/db-errors";
import { PROJECT_ROLES } from "@/lib/project-team.functions";
import { isGroupAdmin } from "@/lib/group-admin";

type Sb = any;
const Id = z.string().uuid();
const zp = <T extends z.ZodTypeAny>(s: T, d: unknown): z.infer<T> => {
  const r = s.safeParse(d);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
};

export type RoleOption = { key: string; label: string; system: boolean };

async function rolesFor(sb: Sb, companyId: string | null): Promise<RoleOption[]> {
  const sys = PROJECT_ROLES.map((r) => ({ key: r.key as string, label: r.label as string, system: true }));
  if (!companyId) return sys;
  const { data, error } = await sb.from("company_project_roles").select("key,label,position").eq("company_id", companyId).eq("active", true).order("position");
  if (error) throw dbError(error);
  return [...sys, ...(data ?? []).map((r: any) => ({ key: r.key, label: r.label, system: false }))];
}

export const listProjectRoleOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ projectId: Id }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: p } = await sb.from("client_projects").select("company_id").eq("id", data.projectId).maybeSingle();
    return rolesFor(sb, p?.company_id ?? null);
  });

export const listCompanyProjectRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ companyId: Id }), d))
  .handler(async ({ data, context }) => ({
    roles: await rolesFor(context.supabase as Sb, data.companyId),
    canEdit: await isGroupAdmin(context.supabase, context.userId),
  }));

const slugKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

export const saveCompanyProjectRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ companyId: Id, key: z.string().max(40).optional(), label: z.string().trim().min(2, "Give the role a name").max(60) }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    if (!(await isGroupAdmin(sb, context.userId))) throw new Error("Only Branta Tech group admins can change project roles.");
    if (data.key) {
      if (PROJECT_ROLES.some((r) => r.key === data.key)) throw new Error("Built-in roles can't be renamed.");
      const { error } = await sb.from("company_project_roles").update({ label: data.label }).eq("company_id", data.companyId).eq("key", data.key);
      if (error) throw dbError(error);
      return { ok: true };
    }
    const key = slugKey(data.label);
    if (key.length < 2 || PROJECT_ROLES.some((r) => r.key === key)) throw new Error("That role already exists.");
    const { data: max } = await sb.from("company_project_roles").select("position").eq("company_id", data.companyId).order("position", { ascending: false }).limit(1).maybeSingle();
    const { error } = await sb.from("company_project_roles").upsert({ company_id: data.companyId, key, label: data.label, active: true, position: (max?.position ?? 9) + 1 }, { onConflict: "company_id,key" });
    if (error) throw dbError(error);
    return { ok: true };
  });

/** Removing a role only hides it from new picks; members who already hold it keep it in history. */
export const removeCompanyProjectRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ companyId: Id, key: z.string().max(40) }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    if (!(await isGroupAdmin(sb, context.userId))) throw new Error("Only Branta Tech group admins can change project roles.");
    if (PROJECT_ROLES.some((r) => r.key === data.key)) throw new Error("Built-in roles can't be removed.");
    const { error } = await sb.from("company_project_roles").update({ active: false }).eq("company_id", data.companyId).eq("key", data.key);
    if (error) throw dbError(error);
    return { ok: true };
  });

export type WorkUpdate = {
  id: string; title: string; link: string | null; note: string | null; version: number; created_at: string;
  author: { name: string; avatar: string | null };
  comments: { id: string; body: string; created_at: string; author: { name: string; avatar: string | null } }[];
};

async function people(sb: Sb, ids: string[]) {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map<string, { name: string; avatar: string | null }>();
  const { data } = await sb.from("profiles").select("user_id, full_name, avatar_url").in("user_id", uniq);
  return new Map<string, { name: string; avatar: string | null }>((data ?? []).map((p: any) => [p.user_id, { name: p.full_name ?? "Team member", avatar: p.avatar_url ?? null }]));
}

export const listWorkUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ projectId: Id }), d))
  .handler(async ({ data, context }): Promise<WorkUpdate[]> => {
    const sb = context.supabase as Sb;
    const { data: ups, error } = await sb.from("project_work_updates").select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw dbError(error);
    const ids = (ups ?? []).map((u: any) => u.id);
    const { data: cs } = ids.length ? await sb.from("project_update_comments").select("*").in("update_id", ids).order("created_at") : { data: [] };
    const pm = await people(sb, [...(ups ?? []).map((u: any) => u.created_by), ...(cs ?? []).map((c: any) => c.created_by)]);
    const anon = { name: "Team member", avatar: null };
    return (ups ?? []).map((u: any) => ({
      id: u.id, title: u.title, link: u.link, note: u.note, version: u.version, created_at: u.created_at, author: pm.get(u.created_by) ?? anon,
      comments: (cs ?? []).filter((c: any) => c.update_id === u.id).map((c: any) => ({ id: c.id, body: c.body, created_at: c.created_at, author: pm.get(c.created_by) ?? anon })),
    }));
  });

const Link = z.preprocess((v) => {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}, z.string().url("Paste a valid link, e.g. a Google Drive video link").max(2000).nullable());

export const addWorkUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ projectId: Id, title: z.string().trim().min(2, "Give the update a title").max(200), link: Link, note: z.string().max(4000).nullable() }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: prev } = await sb.from("project_work_updates").select("version").eq("project_id", data.projectId).ilike("title", data.title).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (prev?.version ?? 0) + 1;
    const { error } = await sb.from("project_work_updates").insert({ project_id: data.projectId, title: data.title, link: data.link, note: data.note || null, version, created_by: context.userId });
    if (error) throw dbError(error);
    await sb.from("client_project_activity").insert({ project_id: data.projectId, actor_id: context.userId, action: "work_update", body: `Shared "${data.title}" (version ${version})` });
    return { ok: true, version };
  });

export const addUpdateComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ updateId: Id, body: z.string().trim().min(1, "Write a message").max(4000) }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: u } = await sb.from("project_work_updates").select("project_id,title,version").eq("id", data.updateId).maybeSingle();
    if (!u) throw new Error("Update not found.");
    const { error } = await sb.from("project_update_comments").insert({ update_id: data.updateId, body: data.body, created_by: context.userId });
    if (error) throw dbError(error);
    await sb.from("client_project_activity").insert({ project_id: u.project_id, actor_id: context.userId, action: "feedback", body: `Commented on "${u.title}" v${u.version}` });
    return { ok: true };
  });

export type ProjectMoney = {
  allowed: boolean;
  invoices: { slug: string; status: string; total: number; paid: number; currency: string; created_at: string }[];
  payments: { id: string; paid_at: string | null; amount: number; currency: string; invoice_slug: string; label: string; method: string | null }[];
};

/** Finance admins and the project's Coordinator / Team Lead only. */
export const getProjectMoney = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ projectId: Id }), d))
  .handler(async ({ data, context }): Promise<ProjectMoney> => {
    const sb = context.supabase as Sb;
    const [{ data: fin }, { data: lead }] = await Promise.all([
      sb.rpc("is_finance_admin", { _user_id: context.userId }),
      sb.rpc("has_project_role", { _project_id: data.projectId, _user: context.userId, _roles: ["project_head", "team_lead"] }),
    ]);
    if (!fin && !lead) return { allowed: false, invoices: [], payments: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await (supabaseAdmin as Sb).from("invoices").select("id,slug,status,total_amount,paid_amount,currency,created_at")
      .eq("project_id", data.projectId).is("archived_at", null).order("created_at", { ascending: false });
    if (error) throw dbError(error);
    const ids = (inv ?? []).map((i: any) => i.id);
    const { data: ins } = ids.length ? await (supabaseAdmin as Sb).from("invoice_installments").select("id,invoice_id,label,paid_amount,paid_at,payment_method,status")
      .in("invoice_id", ids).gt("paid_amount", 0).order("paid_at", { ascending: false }) : { data: [] };
    const byId = new Map<string, any>((inv ?? []).map((i: any) => [i.id, i]));
    return {
      allowed: true,
      invoices: (inv ?? []).map((i: any) => ({ slug: i.slug, status: i.status, total: Number(i.total_amount), paid: Number(i.paid_amount), currency: i.currency, created_at: i.created_at })),
      payments: (ins ?? []).map((p: any) => ({ id: p.id, paid_at: p.paid_at, amount: Number(p.paid_amount), currency: byId.get(p.invoice_id)?.currency ?? "BDT", invoice_slug: byId.get(p.invoice_id)?.slug ?? "", label: p.label, method: p.payment_method })),
    };
  });
