// First-sign-in onboarding gate: forces employees to replace an
// admin-issued temporary password before the app is usable. Telegram is
// optional and connected from Profile → Security.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OnboardingStatus {
  mustChangePassword: boolean;
  passwordResetPending: boolean;
}

export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (authError || !authUser.user) throw new Error("Could not check password change status.");
    return {
      mustChangePassword: !!prof?.must_change_password,
      passwordResetPending: authUser.user.app_metadata?.password_reset_pending === true,
    };
  });
