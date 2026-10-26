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

export type TrackerLiveStatus = "active" | "idle" | "inactive";

export type TrackerSettingRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  active: boolean;
  intervalMinutes: number;
  idleMinutes: number;
  setup: boolean;
  status: TrackerLiveStatus;
  connected: boolean;
  lastSeenAt: string | null;
  shotsToday: number;
};

export const getTrackerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { trackerAdmin } = await import("@/lib/tracker.server");
    const sb = trackerAdmin();
    const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
    const [profiles, settings, shifts, users, shots] = await Promise.all([
      sb.from("profiles").select("id,name,email,job_role,avatar_url,is_active"),
      sb.from("employee_tracker_settings").select("employee_id,screenshots_per_hour,idle_threshold_seconds"),
      sb.from("shift_sessions").select("id,employee_id").eq("status", "active").is("check_out_at", null),
      sb.auth.admin.listUsers({ perPage: 1000 }),
      sb.from("screenshots").select("employee_id").gte("captured_at", `${today}T00:00:00+06:00`),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shiftRows = (shifts.data ?? []) as any[];
    const lastLog = new Map<string, { at: string; status: string }>();
    if (shiftRows.length) {
      const logs = await sb
        .from("activity_logs")
        .select("shift_id,interval_end,status")
        .in("shift_id", shiftRows.map((s) => s.id))
        .order("interval_end", { ascending: false })
        .limit(500);
      for (const l of logs.data ?? []) if (!lastLog.has(l.shift_id)) lastLog.set(l.shift_id, { at: l.interval_end, status: l.status });
    }
    const shiftByEmp = new Map(shiftRows.map((s) => [s.employee_id, s.id as string]));
    const userById = new Map((users.data?.users ?? []).map((u) => [u.id, u]));
    const shotCount = new Map<string, number>();
    for (const s of shots.data ?? []) shotCount.set(s.employee_id, (shotCount.get(s.employee_id) ?? 0) + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map((settings.data ?? []).map((s: any) => [s.employee_id, s]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: TrackerSettingRow[] = (profiles.data ?? []).map((p: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = byId.get(p.id);
      const u = userById.get(p.id);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const setup = !!u?.last_sign_in_at || typeof meta.tracker_device === "string";
      const shiftId = shiftByEmp.get(p.id);
      const log = shiftId ? lastLog.get(shiftId) : undefined;
      const fresh = !!log && Date.now() - Date.parse(log.at) < 3 * 60_000;
      const status: TrackerLiveStatus = fresh ? (log!.status === "active" ? "active" : "idle") : "inactive";
      const seen = [log?.at, typeof meta.tracker_seen_at === "string" ? meta.tracker_seen_at : undefined]
        .filter(Boolean)
        .sort()
        .pop() as string | undefined;
      return {
        id: p.id,
        name: p.name || p.email || "Employee",
        email: p.email ?? "",
        role: p.job_role ?? "",
        avatar: typeof p.avatar_url === "string" && p.avatar_url.startsWith("https://") ? p.avatar_url : null,
        active: p.is_active !== false,
        intervalMinutes: Math.round(60 / Math.max(1, s?.screenshots_per_hour ?? 20)),
        idleMinutes: Math.max(1, Math.round((s?.idle_threshold_seconds ?? 300) / 60)),
        setup,
        status,
        connected: fresh && p.is_active !== false,
        lastSeenAt: seen ?? null,
        shotsToday: shotCount.get(p.id) ?? 0,
      };
    });
    const rank = { active: 0, idle: 1, inactive: 2 };
    employees.sort((a, b) => Number(b.active) - Number(a.active) || rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
    return { employees };
  });

export type TrackerShot = { id: string; url: string; capturedAt: string; sizeKb: number };

export const getEmployeeScreenshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; since?: string }) => z.object({ id: z.string().uuid(), since: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { trackerAdmin } = await import("@/lib/tracker.server");
    const base = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    const { data: rows, error } = await trackerAdmin()
      .from("screenshots")
      .select("id,storage_path,captured_at,file_size_kb")
      .eq("employee_id", data.id)
      .order("captured_at", { ascending: false })
      .limit(60);
    if (error) throw new Error("Could not load screenshots.");
    const shots: TrackerShot[] = (rows ?? []).map((r) => ({
      id: r.id,
      url: `${base}/${String(r.storage_path).split("/").map(encodeURIComponent).join("/")}`,
      capturedAt: r.captured_at,
      sizeKb: r.file_size_kb ?? 0,
    }));
    return { shots };
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
