// Resolve unique notification recipients for a project by role (server-only).
export type ProjectRoleKey = "project_head" | "team_lead" | "qc_checker" | "specialist";

export async function projectRecipients(
  projectId: string,
  roles: ProjectRoleKey[],
  exclude: (string | null | undefined)[] = [],
): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("project_members").select("user_id, roles")
    .eq("project_id", projectId).eq("active", true).overlaps("roles", roles);
  const skip = new Set(exclude.filter(Boolean));
  return [...new Set<string>((data ?? []).map((r: any) => r.user_id))].filter((u) => !skip.has(u));
}
