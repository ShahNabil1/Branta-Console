// Server-only orchestration. Plaintext credentials exist only for this request.
export async function applyEmployeePasswordReset({
  admin, user, password, passwordHash, resetTwoFactor, sendEmail,
}: {
  // Supabase admin client is injected so the recovery rules can be tested without touching employees.
  admin: any;
  user: { id: string; app_metadata: Record<string, unknown> };
  password: string;
  passwordHash: string;
  resetTwoFactor: boolean;
  sendEmail: () => Promise<void>;
}) {
  let factors: { id: string; factor_type: string }[] = [];
  if (resetTwoFactor) {
    const listed = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    if (listed.error) throw new Error("Could not check two-factor authentication. Nothing was reset.");
    factors = listed.data?.factors ?? [];
  }

  // Set the forced-change gate before replacing the password: fail closed if a later step fails.
  const profile = await admin.from("profiles")
    .update({ must_change_password: true }).eq("user_id", user.id).select("user_id").single();
  if (profile.error || !profile.data) throw new Error("Could not prepare the required password change. Nothing was reset.");
  const history = await admin.from("password_history")
    .insert({ user_id: user.id, password_hash: passwordHash });
  if (history.error) throw new Error("Could not secure the temporary password. Retry the reset.");
  const updated = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...user.app_metadata, password_reset_pending: true },
  });
  if (updated.error) throw new Error("Could not replace the password. Retry the reset.");

  let twoFactorResetComplete = true;
  if (resetTwoFactor) {
    for (const factor of factors.filter((f) => f.factor_type === "totp")) {
      const removed = await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id });
      if (removed.error) twoFactorResetComplete = false;
    }
  }

  // Email acceptance is not delivery. A provider failure must never hide a password already issued.
  let emailStatus: "accepted" | "failed" = "accepted";
  try { await sendEmail(); } catch { emailStatus = "failed"; }
  return { ok: true as const, tempPassword: password, emailStatus, resetTwoFactor, twoFactorResetComplete };
}