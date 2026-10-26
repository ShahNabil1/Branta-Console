// Admin-only Extension Settings: per-employee screenshot interval, idle threshold and manual capture (Tracker Supabase).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const [su, ad] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!su.data && !ad.data) throw new Error("Only admins can manage Extension Settings.");
}

export type TrackerSettingRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  active: boolean;
  intervalMinutes: number;
  idleMinutes: number;
};

export const getTrackerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { trackerAdmin } = await import("@/lib/tracker.server");
    const sb = trackerAdmin();
    const [profiles, settings] = await Promise.all([
      sb.from("profiles").select("id,name,email,job_role,avatar_url,is_active"),
      sb.from("employee_tracker_settings").select("employee_id,screenshots_per_hour,idle_threshold_seconds"),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map((settings.data ?? []).map((s: any) => [s.employee_id, s]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: TrackerSettingRow[] = (profiles.data ?? []).map((p: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = byId.get(p.id);
      return {
        id: p.id,
        name: p.name || p.email || "Employee",
        email: p.email ?? "",
        role: p.job_role ?? "",
        avatar: typeof p.avatar_url === "string" && p.avatar_url.startsWith("https://") ? p.avatar_url : null,
        active: p.is_active !== false,
        intervalMinutes: Math.round(60 / Math.max(1, s?.screenshots_per_hour ?? 20)),
        idleMinutes: Math.max(1, Math.round((s?.idle_threshold_seconds ?? 300) / 60)),
      };
    });
    employees.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return { employees };
  });

export const saveTrackerSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] | "all"; intervalMinutes?: number; idleMinutes?: number }) =>
    z
      .object({
        ids: z.union([z.literal("all"), z.array(z.string().uuid()).min(1).max(500)]),
        intervalMinutes: z.number().int().min(1).max(60).optional(),
        idleMinutes: z.number().int().min(1).max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch: Record<string, number> = {};
    if (data.intervalMinutes) patch.screenshots_per_hour = Math.max(1, Math.round(60 / data.intervalMinutes));
    if (data.idleMinutes) patch.idle_threshold_seconds = data.idleMinutes * 60;
    if (!Object.keys(patch).length) throw new Error("Nothing to save.");
    const { trackerAdmin } = await import("@/lib/tracker.server");
    let q = trackerAdmin().from("employee_tracker_settings").update(patch);
    q = data.ids === "all" ? q.not("id", "is", null) : q.in("employee_id", data.ids);
    const { error } = await q;
    if (error) throw new Error("Could not save the settings.");
    return { ok: true };
  });

// Manual capture: stamps a request on the Tracker auth user; the extension picks it up on its next 30-second heartbeat.
export const requestManualScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { trackerAdmin } = await import("@/lib/tracker.server");
    const sb = trackerAdmin();
    const { data: u, error } = await sb.auth.admin.getUserById(data.id);
    if (error || !u.user) throw new Error("Employee not found in Tracker.");
    const res = await sb.auth.admin.updateUserById(data.id, {
      app_metadata: { ...(u.user.app_metadata ?? {}), screenshot_request: new Date().toISOString() },
    });
    if (res.error) throw new Error("Could not send the capture request.");
    return { ok: true };
  });
