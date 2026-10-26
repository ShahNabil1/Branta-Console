// Admin-only Extension Settings: screenshot interval + live Tracker monitoring (read from Tracker Supabase).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const [su, ad] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!su.data && !ad.data) throw new Error("Only admins can view Extension Settings.");
}

export type TrackerEmployeeRow = {
  id: string;
  name: string;
  status: "active" | "idle" | "break" | "offline" | "deactive";
  workedSeconds: number;
  clicks: number;
  keys: number;
  lastSeen: string | null;
};
export type TrackerShot = { id: string; employee: string; capturedAt: string; sizeKb: number; url: string };

export const getTrackerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { trackerAdmin } = await import("@/lib/tracker.server");
    const sb = trackerAdmin();
    const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
    const [profiles, settings, shifts, shots] = await Promise.all([
      sb.from("profiles").select("*"),
      sb.from("employee_tracker_settings").select("screenshots_per_hour").limit(1),
      sb.from("shifts").select("id,employee_id,status,total_worked_seconds,check_out_at,updated_at").eq("date", today),
      sb.from("screenshots").select("id,employee_id,storage_path,file_size_kb,captured_at").order("captured_at", { ascending: false }).limit(24),
    ]);
    const shiftRows = shifts.data ?? [];
    const ids = shiftRows.map((s) => s.id);
    const logs = ids.length
      ? await sb.from("activity_logs").select("shift_id,mouse_clicks,keystrokes_count,status,interval_end").in("shift_id", ids).order("interval_end", { ascending: false }).limit(5000)
      : { data: [] as { shift_id: string; mouse_clicks: number; keystrokes_count: number; status: string; interval_end: string }[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameOf = new Map<string, string>((profiles.data ?? []).map((p: any) => [p.id, p.full_name || p.email || "Employee"]));
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: TrackerEmployeeRow[] = (profiles.data ?? []).map((p: any) => {
      const s = shiftRows.find((x) => x.employee_id === p.id && !x.check_out_at) ?? shiftRows.find((x) => x.employee_id === p.id);
      const l = (logs.data ?? []).filter((x) => s && x.shift_id === s.id);
      const last = l[0];
      let status: TrackerEmployeeRow["status"] = "offline";
      if (p.is_active === false) status = "deactive";
      else if (s && !s.check_out_at && last && now - new Date(last.interval_end).getTime() < 3 * 60_000)
        status = s.status === "on_break" || s.status === "break" ? "break" : last.status === "idle" ? "idle" : "active";
      return {
        id: p.id,
        name: nameOf.get(p.id) ?? "Employee",
        status,
        workedSeconds: s?.total_worked_seconds ?? 0,
        clicks: l.reduce((a, x) => a + (x.mouse_clicks ?? 0), 0),
        keys: l.reduce((a, x) => a + (x.keystrokes_count ?? 0), 0),
        lastSeen: last?.interval_end ?? s?.updated_at ?? null,
      };
    });
    const { createPresignedGetUrl } = await import("@/lib/r2.server");
    const screenshots: TrackerShot[] = await Promise.all(
      (shots.data ?? []).map(async (x) => ({
        id: x.id,
        employee: nameOf.get(x.employee_id) ?? "Employee",
        capturedAt: x.captured_at,
        sizeKb: x.file_size_kb,
        url: await createPresignedGetUrl({ key: x.storage_path, expiresInSeconds: 1800 }).catch(() => ""),
      })),
    );
    const perHour = settings.data?.[0]?.screenshots_per_hour ?? 3;
    return { intervalMinutes: Math.round(60 / Math.max(1, perHour)), employees, screenshots };
  });

export const saveScreenshotInterval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { minutes: number }) => z.object({ minutes: z.number().int().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { trackerAdmin } = await import("@/lib/tracker.server");
    const perHour = Math.max(1, Math.round(60 / data.minutes));
    const { error } = await trackerAdmin().from("employee_tracker_settings").update({ screenshots_per_hour: perHour }).not("id", "is", null);
    if (error) throw new Error("Could not save the screenshot interval.");
    return { ok: true, perHour };
  });
