import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdmakaiCallback, canAccessAdmakai } from "./admakai-policy";

export const issueAdmakaiSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ redirect_uri: z.string().max(500), state: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!isAdmakaiCallback(data.redirect_uri)) throw new Error("This Admakai callback is not approved.");
    const [profile, roles, auth] = await Promise.all([
      context.supabase.from("profiles").select("deactivated_at, allowed_apps, must_change_password, must_link_telegram").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.auth.getUser(),
    ]);
    if (profile.error || roles.error || auth.error || !auth.data.user?.email || !canAccessAdmakai({ roles: (roles.data ?? []).map((r) => r.role), allowedApps: profile.data?.allowed_apps ?? [], hasProfile: !!profile.data, deactivatedAt: profile.data?.deactivated_at ?? null, bannedUntil: auth.data.user?.banned_until ?? null })) throw new Error("Access denied: You do not have permission to access Admakai. Contact a Branta administrator.");
    if (profile.data?.must_change_password || auth.data.user.app_metadata?.password_reset_pending === true)
      throw new Error("Complete your required password change and account setup in Branta Console first.");
    const { isStrongSession } = await import("./session-assurance.server");
    if (!(await isStrongSession(context.supabase, context.claims, context.userId))) throw new Error("Complete Branta two-factor verification first.");
    const { syncAdmakaiEmployee, mintAdmakaiSession, admakaiAdmin } = await import("./admakai.server");
    const mirrored = await syncAdmakaiEmployee(context.userId);
    if (!mirrored?.active || !mirrored.user.email) throw new Error("Admakai access is disabled.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const connection = await supabaseAdmin.from("connected_apps").upsert({ user_id: context.userId, app: "admakai", last_authorized_at: new Date().toISOString(), revoked_at: null }, { onConflict: "user_id,app" });
    if (connection.error) throw new Error("Could not record the Admakai connection.");
    const session = await mintAdmakaiSession(admakaiAdmin(), mirrored.user.email);
    return { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, state: data.state };
  });