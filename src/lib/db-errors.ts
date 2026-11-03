/** Maps raw Postgres/PostgREST errors to plain-language messages for the UI. */
export function dbError(err: { message?: string; code?: string; details?: string | null } | null | undefined): Error {
  const msg = err?.message ?? "Something went wrong";
  const code = err?.code ?? "";
  // Technical detail stays in server logs only.
  console.error("[db-error]", code, msg, err?.details ?? "");
  if (/COMPANY_SETUP_REQUIRED/.test(msg)) return new Error(msg.replace(/^.*COMPANY_SETUP_REQUIRED:\s*/, "Setup required: ") + " (ask a Branta Tech admin to finish it in the company Settings).");
  if (/leads_slug_key/.test(msg)) return new Error("Unable to create the lead because the generated lead code is already in use. Please try again.");
  if (code === "23505" || /duplicate key value/i.test(msg)) {
    const what = /slug|voucher|slip_no|code/i.test(msg) ? "An automatic code clashed" : "This record already exists";
    return new Error(`${what}. Please try again — if it repeats, contact an admin.`);
  }
  if (code === "23503" || /violates foreign key constraint/i.test(msg)) {
    return new Error("This record has related financial/history data and cannot be deleted. Archive or deactivate it instead.");
  }
  if (code === "42501" || /permission denied|row-level security/i.test(msg)) {
    return new Error("You don't have permission to do this.");
  }
  if (code === "23502" || /null value in column/i.test(msg)) {
    return new Error("A required field is missing.");
  }
  // Business-rule messages from our own RPCs (P0001) are already user-facing; hide any other raw SQL text.
  if (code && code !== "P0001" && /constraint|relation|column|syntax|violates/i.test(msg)) return new Error("Something went wrong while saving. Please try again.");
  return new Error(msg.replace(/^[A-Z_]+:\s*/, ""));
}
