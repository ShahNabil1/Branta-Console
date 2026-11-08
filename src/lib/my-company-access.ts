// Who sees "My Company" for the open workspace. Mirrors canOperateCompany in group-admin.ts:
// Group Admins (super_admin/admin) may open every company's My Company; otherwise holding
// staff see only Branta Tech and a sister company's own non-Executive staff see only theirs.
export type MyCompanyPerms = { isSuperAdmin?: boolean; isAdmin?: boolean; roles?: string[] };
export type MyCompanyTarget = { is_holding: boolean; myRole?: string | null };

export function canSeeMyCompany(perms: MyCompanyPerms, company: MyCompanyTarget): boolean {
  const groupAdmin = Boolean(perms.isSuperAdmin || perms.isAdmin);
  const holdingStaff = groupAdmin || (perms.roles ?? []).some((r) => r !== "user");
  if (company.is_holding) return holdingStaff;
  if (groupAdmin) return true;
  const myRole = company.myRole;
  return !holdingStaff && !!myRole && myRole !== "member";
}
