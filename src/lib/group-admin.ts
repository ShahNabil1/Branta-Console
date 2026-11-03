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
