// Pure scope rule for a sister company's C.E.O/C.O.O reviewing lead transfers:
// only that company's leads, and only between its own (non-group) staff.
export type ScopedTransfer = { lead_id: string; to_user_id: string; from_user_id: string | null };

export function filterCompanyTransfers<T extends ScopedTransfer>(
  rows: T[],
  leadCompany: Map<string, string | null>,
  companyId: string,
  allowedUserIds: Set<string>,
): T[] {
  return rows.filter(
    (r) =>
      leadCompany.get(r.lead_id) === companyId &&
      allowedUserIds.has(r.to_user_id) &&
      (!r.from_user_id || allowedUserIds.has(r.from_user_id)),
  );
}
