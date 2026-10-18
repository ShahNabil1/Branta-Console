// Project team (multi-role members). Phase 1 of Project & Delivery Management.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dbError } from "@/lib/db-errors";

export const PROJECT_ROLES = [
  { key: "project_head", label: "Project Head / Director" },
  { key: "team_lead", label: "Team Lead / PM" },
  { key: "qc_checker", label: "QC Checker" },
  { key: "specialist", label: "Specialist / Assignee" },
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number]["key"];
const RoleEnum = z.enum(["project_head", "team_lead", "qc_checker", "specialist"]);

export interface ProjectMember {
  id: string; user_id: string; name: string | null; avatar: string | null;
  roles: ProjectRole[]; active: boolean;
}

const roleLabel = (r: string) => PROJECT_ROLES.find((x) => x.key === r)?.label ?? r;

export const listProjectMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ members: ProjectMember[]; canManage: boolean }> => {
    const sb = context.supabase as any;
    const [{ data: rows, error }, { data: can }] = await Promise.all([
      sb.from("project_members").select("id, user_id, roles, active").eq("project_id", data.projectId).order("created_at"),
      sb.rpc("can_manage_project", { _project_id: data.projectId, _user: context.userId }),
    ]);
    if (error) throw dbError(error);
    const ids = (rows ?? []).map((r: any) => r.user_id);
    const { data: profs } = ids.length
      ? await sb.from("profiles").select("user_id, full_name, avatar_url").in("user_id", ids)
      : { data: [] };
    const pm = new Map<string, any>((profs ?? []).map((p: any) => [p.user_id, p]));
    return {
      canManage: !!can,
      members: (rows ?? []).map((r: any) => ({
        id: r.id, user_id: r.user_id, roles: r.roles, active: r.active,
        name: pm.get(r.user_id)?.full_name ?? null, avatar: pm.get(r.user_id)?.avatar_url ?? null,
      })),
    };
  });

export const setProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    userId: z.string().uuid(),
    roles: z.array(RoleEnum).max(4), // empty = deactivate
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: can } = await sb.rpc("can_manage_project", { _project_id: data.projectId, _user: context.userId });
    if (!can) throw new Error("Only project leadership or admins can manage the team");
    const roles = [...new Set(data.roles)].sort();
    const { data: existing } = await sb.from("project_members").select("id, roles, active")
      .eq("project_id", data.projectId).eq("user_id", data.userId).maybeSingle();

    if (roles.length === 0) {
      if (existing?.active) {
        const { error } = await sb.from("project_members").update({ active: false }).eq("id", existing.id);
        if (error) throw dbError(error);
      }
      return { ok: true };
    }
    if (existing) {
      const { error } = await sb.from("project_members").update({ roles, active: true }).eq("id", existing.id);
      if (error) throw dbError(error);
    } else {
      const { error } = await sb.from("project_members").insert({
        project_id: data.projectId, user_id: data.userId, roles, added_by: context.userId,
      });
      if (error) throw dbError(error);
    }
    const before = existing?.active ? [...(existing.roles ?? [])].sort().join(",") : "";
    if (before !== roles.join(",") && data.userId !== context.userId) {
      const { data: p } = await sb.from("client_projects").select("title").eq("id", data.projectId).maybeSingle();
      try {
        const { notify } = await import("@/lib/notify.server");
        await notify({
          event: "project.role_assigned", recipients: [data.userId], actorId: context.userId,
          vars: { project: p?.title ?? "Project", roles: roles.map(roleLabel).join(", ") },
          dedupeKey: `proj:${data.projectId}:member:${data.userId}:${roles.join(",")}`,
        });
      } catch (e) { console.warn("[project-team] notify failed", e); }
    }
    return { ok: true };
  });
