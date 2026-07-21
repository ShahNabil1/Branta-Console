// First-sign-in onboarding gate: forces new employees to (1) replace the
// admin-issued temporary password and (2) link Telegram before the app is
// usable. Flags live on `profiles.must_change_password` /
// `profiles.must_link_telegram` and self-clear once each step is done.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OnboardingStatus {
  mustChangePassword: boolean;
  mustLinkTelegram: boolean;
}

export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingStatus> => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password, must_link_telegram")
      .eq("user_id", context.userId)
      .maybeSingle();

    let mustChangePassword = !!prof?.must_change_password;
    let mustLinkTelegram = !!prof?.must_link_telegram;

    // Self-heal: if Telegram is already linked (e.g. the employee linked it
    // then signed out mid-onboarding), clear the flag so we don't loop.
    if (mustLinkTelegram) {
      const { data: sub } = await supabaseAdmin
        .from("telegram_subscriptions")
        .select("active")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (sub?.active) {
        await supabaseAdmin
          .from("profiles")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ must_link_telegram: false } as any)
          .eq("user_id", context.userId);
        mustLinkTelegram = false;
      }
    }

    return { mustChangePassword, mustLinkTelegram };
  });
