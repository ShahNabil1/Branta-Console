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
    .eq("user_id", (prof as { id: string }).id).eq("is_active", true);
  for (const m of (mem ?? []) as unknown as { company_id: string; companies: { is_holding: boolean } }[]) {
    if (m.companies?.is_holding) continue;
    const { data } = await supabase.rpc("can_manage_company", { _company: m.company_id, _user: callerId });
    if (data) return true;
  }
  return false;
}

export type EmployeeCompany = { name: string; slug: string; isHolding: boolean; logoUrl: string | null; mark: string | null };

/** Active company memberships per auth user id (for company badges on employee cards/profiles). */
export async function employeeCompanies(userIds: string[]): Promise<Map<string, EmployeeCompany[]>> {
  const out = new Map<string, EmployeeCompany[]>();
  if (userIds.length === 0) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profs } = await supabaseAdmin.from("profiles").select("id, user_id").in("user_id", userIds);
  const byProfile = new Map((profs ?? []).map((p) => [(p as { id: string }).id, (p as { user_id: string }).user_id]));
  if (byProfile.size === 0) return out;
  const { data: mem } = await supabaseAdmin
    .from("company_members").select("user_id, companies!inner(name, slug, is_holding, logo_url, brand_kit)")
    .in("user_id", [...byProfile.keys()]).eq("is_active", true);
  for (const m of (mem ?? []) as unknown as { user_id: string; companies: { name: string; slug: string; is_holding: boolean; logo_url: string | null; brand_kit: { mark?: string } | null } }[]) {
    const uid = byProfile.get(m.user_id);
    if (!uid || !m.companies) continue;
    const c = m.companies;
    const list = out.get(uid) ?? [];
    list.push({ name: c.name, slug: c.slug, isHolding: c.is_holding, logoUrl: c.logo_url, mark: c.brand_kit?.mark ?? null });
    out.set(uid, list);
  }
  out.forEach((l) => l.sort((a, b) => Number(b.isHolding) - Number(a.isHolding)));
  return out;
}
