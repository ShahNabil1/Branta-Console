/** Auth user ids of employees switched on (active company_members) for one company. */
export async function companyMemberUserIds(slug: string): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: co, error } = await supabaseAdmin.from("companies").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!co) throw new Error("Company not found");
  const { data: mem, error: mErr } = await supabaseAdmin
    .from("company_members").select("user_id").eq("company_id", (co as { id: string }).id).eq("is_active", true);
  if (mErr) throw new Error(mErr.message);
  const pids = (mem ?? []).map((m) => (m as { user_id: string }).user_id);
  if (pids.length === 0) return new Set();
  const { data: profs, error: pErr } = await supabaseAdmin.from("profiles").select("user_id").in("id", pids);
  if (pErr) throw new Error(pErr.message);
  return new Set((profs ?? []).map((p) => (p as { user_id: string }).user_id).filter(Boolean));
}

/** True when the caller is CEO/COO (can_manage_company) of a sister company the target employee is an active member of. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function managesEmployee(supabase: any, callerId: string, targetUserId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("user_id", targetUserId).maybeSingle();
  if (!prof) return false;
  const { data: mem } = await supabaseAdmin
    .from("company_members").select("company_id, companies!inner(is_holding)")
    .eq("profile_id" as never, (prof as { id: string }).id).eq("is_active", true);
  for (const m of (mem ?? []) as unknown as { company_id: string; companies: { is_holding: boolean } }[]) {
    if (m.companies?.is_holding) continue;
    const { data } = await supabase.rpc("can_manage_company", { _company: m.company_id, _user: callerId });
    if (data) return true;
  }
  return false;
}
