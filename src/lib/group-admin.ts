// Group-level (Branta Tech holding) admin check. Company-scoped roles such as a
// sister company's CEO/COO super_admin never pass — only global user_roles do.
type Rpc = { rpc: (f: string, a: object) => PromiseLike<{ data: unknown }> };

export async function isGroupAdmin(sb: unknown, userId: string): Promise<boolean> {
  const c = sb as Rpc;
  const [su, ad] = await Promise.all([
    c.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    c.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  return Boolean(su.data) || Boolean(ad.data);
}

export async function assertGroupAdmin(sb: unknown, userId: string, msg = "Only Branta Tech group admins can manage companies.") {
  if (!(await isGroupAdmin(sb, userId))) throw new Error(msg);
}

type Sbx = Rpc & { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const HOLDING_STAFF = ["super_admin", "admin", "finance", "manager", "coo"];
const SISTER_STAFF = ["super_admin", "coo", "manager", "finance"];

/** My Company gate: group admins, or the caller's own non-Executive staff of this company. */
export async function canOperateCompany(sb: unknown, userId: string, companyId: string): Promise<boolean> {
  if (await isGroupAdmin(sb, userId)) return true;
  const c = sb as Sbx;
  const { data: co } = await c.from("companies").select("is_holding").eq("id", companyId).maybeSingle();
  if (!co) return false;
  if (co.is_holding) {
    const r = await Promise.all(HOLDING_STAFF.map((role) => c.rpc("has_role", { _user_id: userId, _role: role })));
    return r.some((x) => Boolean(x.data));
  }
  const { data: me } = await c.from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!me) return false;
  const { data: m } = await c.from("company_members").select("role").eq("company_id", companyId).eq("user_id", me.id).eq("is_active", true).maybeSingle();
  return !!m && SISTER_STAFF.includes(m.role);
}

export async function assertCompanyOperator(sb: unknown, userId: string, companyId: string, msg = "You don't have access to manage this company.") {
  if (!(await canOperateCompany(sb, userId, companyId))) throw new Error(msg);
}
