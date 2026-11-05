// Admin-only editor for an employee's Tracker Shift schedule.
// Stored in the Tracker auth user's app_metadata.shift_schedule (employees can't edit app_metadata),
// so the extension reads it from its own verified session.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_SCHEDULE, shiftScheduleSchema, type ShiftSchedule } from "@/lib/tracker-schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string, target?: string) {
  if (target && (await (await import("@/lib/company-scope.server")).managesEmployee(supabase, userId, target))) return;
  const [su, ad] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!su.data && !ad.data) throw new Error("Only admins can manage Shift schedules.");
}

export const getTrackerSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.userId);
    const { trackerAdmin, trackerUserIdFor } = await import("@/lib/tracker.server");
    const id = await trackerUserIdFor(data.userId);
    if (!id) return { linked: false, schedule: DEFAULT_SCHEDULE, saved: false };
    const { data: u } = await trackerAdmin().auth.admin.getUserById(id);
    const parsed = shiftScheduleSchema.safeParse(u.user?.app_metadata?.shift_schedule);
    return { linked: true, schedule: parsed.success ? parsed.data : DEFAULT_SCHEDULE, saved: parsed.success };
  });

export const saveTrackerSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; schedule: ShiftSchedule }) =>
    z.object({ userId: z.string().uuid(), schedule: shiftScheduleSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.userId);
    const { trackerAdmin, trackerUserIdFor, syncTrackerEmployee } = await import("@/lib/tracker.server");
    let id = await trackerUserIdFor(data.userId);
    if (!id) {
      await syncTrackerEmployee(data.userId);
      id = await trackerUserIdFor(data.userId);
    }
    if (!id) throw new Error("This employee is not linked to Branta Tracker yet.");
    for (const slots of Object.values(data.schedule.days)) {
      const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i++)
        if (sorted[i].start < sorted[i - 1].end) throw new Error("Shifts on the same day must not overlap.");
    }
    const sb = trackerAdmin();
    const { data: u, error: getErr } = await sb.auth.admin.getUserById(id);
    if (getErr || !u.user) throw new Error("Could not load the Tracker account.");
    const { error } = await sb.auth.admin.updateUserById(id, {
      app_metadata: { ...(u.user.app_metadata ?? {}), shift_schedule: data.schedule },
    });
    if (error) throw new Error("Could not save the Shift schedule. Please try again.");
    await sb
      .from("employee_tracker_settings")
      .update({ break_limit_minutes: data.schedule.break_minutes, grace_period_minutes: data.schedule.grace_minutes })
      .eq("employee_id", id);
    return { ok: true };
  });
