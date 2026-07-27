import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EVENT_KEYS,
  NOTIFICATION_ROLES,
} from "@/lib/notification-events";

const PREF_SCHEMA = z.object({
  group_leads: z.boolean().optional(),
  group_meetings: z.boolean().optional(),
  group_inbox: z.boolean().optional(),
  group_finance: z.boolean().optional(),
  group_security: z.boolean().optional(),
  group_system: z.boolean().optional(),
  quiet_hours_enabled: z.boolean().optional(),
  quiet_hours_start: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  quiet_hours_end: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  timezone: z.string().max(64).optional(),
  digest_mode: z.boolean().optional(),
});

async function assertSuperAdmin(
  ctx: { supabase: { rpc: (...args: unknown[]) => Promise<{ data: unknown }> }; userId: string },
): Promise<void> {
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (!data) throw new Error("Forbidden: super_admin required");
}

export const getMyNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data } = await supabaseAdmin
      .from("notification_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      prefs: data ?? {
        user_id: context.userId,
        group_leads: true,
        group_meetings: true,
        group_inbox: true,
        group_finance: true,
        group_security: true,
        group_system: true,
        quiet_hours_enabled: false,
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
        timezone: "Asia/Dhaka",
        digest_mode: false,
      },
    };
  });

export const updateMyNotificationPreferences = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PREF_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("notification_preferences")
      .upsert(
        { user_id: context.userId, ...data, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const sendTestTelegramNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { notify } = await import("@/lib/notify.server");
    const now = new Date().toLocaleString("en-GB", {
      timeZone: "Asia/Dhaka",
      hour12: true,
      dateStyle: "medium",
      timeStyle: "short",
    });
    const r = await notify({
      event: "auth.password_changed", // alwaysOn so it bypasses group toggles
      recipients: [context.userId],
      message: `🔔 <b>Test notification</b>\nThis is a test from Branta Tech at ${now} (BDT). Notifications are working. ✅`,
      dedupeKey: `test:${Date.now()}`,
    });
    return r;
  });

// ---------- Admin: rules matrix ----------

export const listNotificationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data } = await supabaseAdmin
      .from("notification_rules")
      .select("*")
      .order("event_key");
    return { rules: data ?? [] };
  });

const RULE_UPDATE = z.object({
  event_key: z.enum(EVENT_KEYS as [string, ...string[]]),
  enabled: z.boolean().optional(),
  role_super_admin: z.boolean().optional(),
  role_admin: z.boolean().optional(),
  role_finance: z.boolean().optional(),
  role_employee: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const updateNotificationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RULE_UPDATE.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { event_key, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("notification_rules")
      .update({
        ...patch,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("event_key", event_key);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const BROADCAST = z.object({
  message: z.string().min(1).max(2000),
  roles: z.array(z.enum(NOTIFICATION_ROLES)).min(1),
});

export const broadcastTelegramMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BROADCAST.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { notify } = await import("@/lib/notify.server");
    return notify({
      event: "auth.suspicious", // reuse alwaysOn security event so recipients can't mute broadcasts
      recipientRoles: data.roles,
      message: data.message,
      actorId: context.userId,
      dedupeKey: `broadcast:${Date.now()}`,
    });
  });
