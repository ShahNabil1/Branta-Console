import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Branta Console -> Tracker Extension single sign-on.
 * Extension opens /sso/tracker via chrome.identity.launchWebAuthFlow (redirect to
 * https://<id>.chromiumapp.org/). After Console sign-in, the server upserts the
 * employee into the Tracker Supabase project (one user per email) and returns a
 * regular Tracker Supabase session (access + refresh token) for the extension.
 */
export const TRACKER_REDIRECT_RE = /^https:\/\/([a-p]{32})\.chromiumapp\.org\/[^\s#]*$/;

export const issueTrackerSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ redirect_uri: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const m = TRACKER_REDIRECT_RE.exec(data.redirect_uri);
    if (!m) throw new Error("This sign-in link is not from the Branta Tracker extension.");
    // Fixed ID from the manifest "key" (same on every employee install) + optional extras.
    const allowed = [
      "depkbpehdbgckceobdmiacgjokaihklp",
      ...(process.env.TRACKER_EXTENSION_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    ];
    if (allowed.length && !allowed.includes(m[1])) {
      throw new Error("This extension is not approved for Branta sign-in.");
    }

    const { isStrongSession } = await import("./session-assurance.server");
    if (!(await isStrongSession(context.supabase, context.claims, context.userId)))
      throw new Error("Complete Branta two-factor verification first.");
    const sb = context.supabase;
    const [{ data: prof }, { data: roles }, { data: userRes }] = await Promise.all([
      sb
        .from("profiles")
        .select("full_name, employee_code, job_role, avatar_url, deactivated_at, must_change_password, must_link_telegram")
        .eq("user_id", context.userId)
        .maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", context.userId),
      sb.auth.getUser(),
    ]);
    if (prof?.deactivated_at) throw new Error("Your account is deactivated.");
    if (!prof || prof.must_change_password || prof.must_link_telegram || userRes.user?.app_metadata?.password_reset_pending === true)
      throw new Error("Complete your required password change and account setup in Branta Console first.");
    const email = userRes.user?.email;
    if (!email) throw new Error("Your account has no email address.");

    const { ensureTrackerUser, mintTrackerSession } = await import("./tracker.server");
    const trackerUser = await ensureTrackerUser({
      console_user_id: context.userId,
      email,
      name: prof?.full_name ?? null,
      employee_code: prof?.employee_code ?? null,
      job_role: prof?.job_role ?? null,
      avatar_url: prof?.avatar_url ?? null,
      roles: (roles ?? []).map((r) => r.role as string),
    });
    const { syncTrackerEmployee } = await import("./tracker.server");
    await syncTrackerEmployee(context.userId);
    const session = await mintTrackerSession(email);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("connected_apps").upsert(
      {
        user_id: context.userId,
        app: "tracker_extension",
        last_authorized_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "user_id,app" },
    );

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      tracker_user_id: trackerUser.id,
    };
  });

/** Admin-only health check of the Tracker project connection. */
export const checkTrackerConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { trackerAdmin } = await import("./tracker.server");
    const { error } = await trackerAdmin().auth.admin.listUsers({ page: 1, perPage: 1 });
    return { ok: !error, error: error?.message ?? null };
  });

export const listMyConnectedApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("connected_apps")
      .select("app, connected_at, last_authorized_at")
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .order("connected_at");
    if (error) throw new Error("Could not load connected apps.");
    // One row per app (defensive de-dupe).
    const seen = new Set<string>();
    return (data ?? []).filter((r) => (seen.has(r.app) ? false : (seen.add(r.app), true)));
  });

export const getMyAppAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [prof, sup] = await Promise.all([
      context.supabase.from("profiles").select("allowed_apps").eq("user_id", context.userId).maybeSingle(),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { allowedApps: (((prof.data as any)?.allowed_apps as string[] | null) ?? []), isSuperAdmin: !!sup.data };
  });

export const disconnectMyApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ app: z.enum(["tracker_extension", "admakai"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("connected_apps")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("app", data.app);
    if (error) throw new Error("Could not disconnect.");
    return { ok: true };
  });
