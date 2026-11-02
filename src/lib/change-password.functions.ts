// Change password: verify current, block reuse of current or previous.
// Also exposes setInitialPassword for the onboarding forced-change flow,
// which skips current-password verification (the employee already signed
// in with the temp password + 2FA) but rejects reusing the temp password.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { strongPasswordSchema } from "@/lib/branta-credentials";

const Input = z.object({
  current_password: z.string().min(1),
  new_password: strongPasswordSchema,
});

const InitialInput = z.object({
  new_password: strongPasswordSchema,
});

export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { hashPassword, HISTORY_SALT } = await import(
      "@/lib/password-hash.server"
    );

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    const email = userData.user?.email;
    if (!email) throw new Error("User not found");

    if (data.current_password === data.new_password) {
      throw new Error("New password must be different from your current password.");
    }

    const tokenRes = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY!}`,
        },
        body: JSON.stringify({ email, password: data.current_password }),
      },
    );
    if (!tokenRes.ok) {
      throw new Error("Current password is incorrect.");
    }

    const newHash = await hashPassword(data.new_password, HISTORY_SALT);
    const currentHash = await hashPassword(data.current_password, HISTORY_SALT);

    const { data: history } = await supabaseAdmin
      .from("password_history")
      .select("password_hash,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if ((history ?? []).some((h) => h.password_hash === newHash)) {
      throw new Error(
        "You cannot reuse your previous password. Choose a different one.",
      );
    }
    if (newHash === currentHash) {
      throw new Error("New password must be different from your current password.");
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      context.userId,
      { password: data.new_password },
    );
    if (updateErr) throw new Error(updateErr.message);

    await supabaseAdmin
      .from("password_history")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: context.userId, password_hash: currentHash } as any);

    await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ must_change_password: false } as any)
      .eq("user_id", context.userId);

    try {
      const { notify } = await import("@/lib/notify.server");
      const when = new Date().toLocaleString("en-GB", {
        timeZone: "Asia/Dhaka",
        hour12: true,
        dateStyle: "medium",
        timeStyle: "short",
      });
      await notify({
        event: "auth.password_changed",
        recipients: [context.userId],
        vars: { when: `${when} (BDT)` },
        dedupeKey: `pwd:${context.userId}:${Date.now()}`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[changeMyPassword] notify failed:", e);
    }

    return { ok: true as const };
  });

// First-sign-in forced password change. Only allowed when
// profiles.must_change_password is still true. The temp password hash was
// seeded into password_history at creation/reset time, so we reject a new
// password that matches it — no need to ask the employee to retype the
// temp password they already used moments ago to sign in.
export const setInitialPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InitialInput.parse(input))
  .handler(async ({ data, context }) => {
    const { isStrongSession } = await import("@/lib/session-assurance.server");
    if (!await isStrongSession(context.supabase, context.claims, context.userId))
      throw new Error("Complete two-factor authentication or passkey verification first.");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { hashPassword, HISTORY_SALT } = await import(
      "@/lib/password-hash.server"
    );

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("user_id", context.userId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(prof as any)?.must_change_password) {
      throw new Error(
        "Your password has already been set. Use Change password from Settings instead.",
      );
    }

    const newHash = await hashPassword(data.new_password, HISTORY_SALT);

    // Reject reuse of the temp password (seeded in history) or the last
    // stored password.
    const { data: history, error: historyError } = await supabaseAdmin
      .from("password_history")
      .select("password_hash")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (historyError) throw new Error("Could not verify password history. Please retry.");
    if ((history ?? []).some((h) => h.password_hash === newHash)) {
      throw new Error(
        "New password must be different from your temporary password.",
      );
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      context.userId,
      { password: data.new_password },
    );
    if (updateErr) throw new Error(updateErr.message);

    // Record the new password's hash so future changes can't reuse it.
    const recorded = await supabaseAdmin
      .from("password_history")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: context.userId, password_hash: newHash } as any);
    if (recorded.error) throw new Error("Could not finish recording the password change. Please retry with a different password.");

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (authError || !authUser.user) throw new Error("Could not finish the password change. Please retry.");
    if (authUser.user.app_metadata?.password_reset_pending === true) {
      const finished = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        app_metadata: { ...authUser.user.app_metadata, password_reset_pending: false },
      });
      if (finished.error) throw new Error("Could not finish the password change. Please retry.");
    }

    const cleared = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false } as any)
      .eq("user_id", context.userId);
    if (cleared.error) throw new Error("Password changed, but the required-change status could not be cleared. Please retry.");

    try {
      const { notify } = await import("@/lib/notify.server");
      const when = new Date().toLocaleString("en-GB", {
        timeZone: "Asia/Dhaka",
        hour12: true,
        dateStyle: "medium",
        timeStyle: "short",
      });
      await notify({
        event: "auth.password_changed",
        recipients: [context.userId],
        vars: { when: `${when} (BDT)` },
        dedupeKey: `pwd:${context.userId}:initial:${Date.now()}`,
        actorId: context.userId,
      });
      // Check if onboarding is now complete (telegram already linked).
      const { data: sub } = await supabaseAdmin
        .from("telegram_subscriptions")
        .select("active")
        .eq("user_id", context.userId)
        .maybeSingle();
      const { data: prof2 } = await supabaseAdmin
        .from("profiles")
        .select("must_link_telegram, full_name")
        .eq("user_id", context.userId)
        .maybeSingle();
      const name =
        (prof2 as { full_name?: string } | null)?.full_name ??
        "New employee";
      if (authUser.user.app_metadata?.password_reset_pending !== true) {
        await notify({
          event: "employee.onboarded",
          recipientRoles: ["super_admin", "admin"],
          vars: { name },
          dedupeKey: `onboarded:${context.userId}`,
          actorId: context.userId,
        });
      }
    } catch (e) {
      console.error("[setInitialPassword] notify failed:", e);
    }

    return { ok: true as const };
  });
