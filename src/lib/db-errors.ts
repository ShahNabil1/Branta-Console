/** Maps raw Postgres/PostgREST errors to plain-language messages for the UI. */
export function dbError(err: { message?: string; code?: string; details?: string | null } | null | undefined): Error {
  const msg = err?.message ?? "Something went wrong";
  const code = err?.code ?? "";
  if (code === "23505" || /duplicate key value/i.test(msg)) {
    const what = /slug|voucher|slip_no|code/i.test(msg) ? "An automatic code clashed" : "This record already exists";
    return new Error(`${what}. Please try again — if it repeats, contact an admin.`);
  }
  if (code === "23503" || /violates foreign key constraint/i.test(msg)) {
    return new Error("This record is linked to other records (payments, fund history, invoices…), so it can't be deleted. Archive or reverse it instead.");
  }
  if (code === "42501" || /permission denied|row-level security/i.test(msg)) {
    return new Error("You don't have permission to do this.");
  }
  if (code === "23502" || /null value in column/i.test(msg)) {
    return new Error("A required field is missing.");
  }
  return new Error(msg);
}
