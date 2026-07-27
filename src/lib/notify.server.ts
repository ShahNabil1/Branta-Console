// Central Telegram notification dispatcher. Server-only.
//
// Usage:
//   import { notify } from "@/lib/notify.server";
//   await notify({
//     event: "invoice.installment.paid",
//     recipients: [ownerId],           // explicit user IDs
//     recipientRoles: ["finance"],     // AND/OR expand to all users in these roles
//     vars: { slug, amount, label },
//     dedupeKey: `inst:${installmentId}:paid`,
//     actorId,
//   });
//
// The dispatcher enforces: rule enabled → recipient role gate → user
// preference (unless alwaysOn) → idempotency → send via Telegram.

import {
  EVENT_CATALOG,
  findEvent,
  renderTemplate,
  type EventGroup,
  type NotificationRole,
} from "@/lib/notification-events";
import { sendTelegramToChatId } from "@/lib/telegram.server";

export interface NotifyInput {
  event: string;
  recipients?: string[];
  recipientRoles?: NotificationRole[];
  vars?: Record<string, unknown>;
  /** Custom rendered message (overrides template). */
  message?: string;
  /** Uniqueness key (per-recipient); prevents duplicate sends. */
  dedupeKey?: string;
  actorId?: string;
}

const GROUP_PREF_COL: Record<EventGroup, string> = {
  leads: "group_leads",
  meetings: "group_meetings",
  inbox: "group_inbox",
  finance: "group_finance",
  security: "group_security",
  system: "group_system",
};

const ROLE_COL: Record<NotificationRole, string> = {
  super_admin: "role_super_admin",
  admin: "role_admin",
  finance: "role_finance",
  employee: "role_employee",
};

interface RoleRow {
  user_id: string;
  role: "super_admin" | "admin" | "finance" | "manager" | "user";
}

function highestRoleFor(roles: string[]): NotificationRole {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("finance")) return "finance";
  return "employee";
}

export async function notify(input: NotifyInput): Promise<{
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const def = findEvent(input.event);
  if (!def) {
    console.warn(`[notify] unknown event: ${input.event}`);
    return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );

  // Rule row.
  const { data: rule } = await supabaseAdmin
    .from("notification_rules")
    .select("*")
    .eq("event_key", input.event)
    .maybeSingle();

  if (rule && rule.enabled === false) {
    return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  }

  // Resolve recipients (explicit ∪ role expansion), dedup.
  const set = new Set<string>(input.recipients ?? []);
  if (input.recipientRoles && input.recipientRoles.length > 0) {
    const mappedRoles = input.recipientRoles.flatMap((r) =>
      r === "employee" ? (["user", "manager"] as const) : ([r] as const),
    ) as Array<"admin" | "finance" | "manager" | "super_admin" | "user">;
    const { data: rows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", mappedRoles);
    for (const r of (rows ?? []) as RoleRow[]) set.add(r.user_id);
  }

  const recipients = Array.from(set);
  if (recipients.length === 0) {
    return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  }

  // Fetch each recipient's role + preferences + subscription in bulk.
  const [subsRes, prefsRes, rolesRes] = await Promise.all([
    supabaseAdmin
      .from("telegram_subscriptions")
      .select("user_id, chat_id, active")
      .in("user_id", recipients),
    supabaseAdmin
      .from("notification_preferences")
      .select("*")
      .in("user_id", recipients),
    supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", recipients),
  ]);

  const subs = new Map<string, { chat_id: number; active: boolean }>();
  for (const s of subsRes.data ?? []) {
    subs.set(s.user_id as string, {
      chat_id: Number(s.chat_id),
      active: Boolean(s.active),
    });
  }
  const prefs = new Map<string, Record<string, unknown>>();
  for (const p of prefsRes.data ?? []) {
    prefs.set(p.user_id as string, p as Record<string, unknown>);
  }
  const rolesByUser = new Map<string, string[]>();
  for (const r of (rolesRes.data ?? []) as RoleRow[]) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r.role);
    rolesByUser.set(r.user_id, arr);
  }

  const alwaysOn = def.alwaysOn === true;
  const groupCol = GROUP_PREF_COL[def.group];
  const rendered =
    input.message ?? renderTemplate(def.template, input.vars ?? {});

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  await Promise.all(
    recipients.map(async (uid) => {
      const role = highestRoleFor(rolesByUser.get(uid) ?? []);
      // Role gate on the rule row.
      if (rule) {
        const gate = (rule as Record<string, unknown>)[ROLE_COL[role]];
        if (gate === false) {
          skipped++;
          await logEvent(supabaseAdmin, {
            input,
            recipient: uid,
            status: "skipped",
            reason: "role_disabled",
            message: rendered,
          });
          return;
        }
      }
      // Preference gate.
      if (!alwaysOn) {
        const p = prefs.get(uid);
        if (p && p[groupCol] === false) {
          skipped++;
          await logEvent(supabaseAdmin, {
            input,
            recipient: uid,
            status: "skipped",
            reason: "user_disabled",
            message: rendered,
          });
          return;
        }
      }
      const sub = subs.get(uid);
      if (!sub || !sub.active) {
        skipped++;
        await logEvent(supabaseAdmin, {
          input,
          recipient: uid,
          status: "skipped",
          reason: "no_telegram",
          message: rendered,
        });
        return;
      }

      // Idempotency: insert first, only send if fresh row.
      const dedupe = input.dedupeKey ? `${input.dedupeKey}:${uid}` : null;
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("notification_events")
        .insert({
          event_key: input.event,
          recipient_user_id: uid,
          dedupe_key: dedupe,
          status: "queued",
          message: rendered,
          payload: input.vars ?? {},
          actor_user_id: input.actorId ?? null,
        })
        .select("id")
        .maybeSingle();

      if (insertErr) {
        // Unique violation → already sent for this dedupe key.
        skipped++;
        return;
      }
      const rowId = inserted?.id as string | undefined;

      const res = await sendTelegramToChatId(sub.chat_id, rendered, {
        parseMode: "HTML",
      });
      if (res.ok) {
        sent++;
        if (rowId) {
          await supabaseAdmin
            .from("notification_events")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", rowId);
        }
      } else {
        failed++;
        if (rowId) {
          await supabaseAdmin
            .from("notification_events")
            .update({ status: "failed", reason: res.error ?? "send_failed" })
            .eq("id", rowId);
        }
      }
    }),
  );

  return { attempted: recipients.length, sent, skipped, failed };
}

async function logEvent(
  admin: Awaited<
    ReturnType<
      typeof import("@/integrations/supabase/client.server").getSupabaseAdmin
    >
  > extends never
    ? never
    : ReturnType<
        typeof import("@/integrations/supabase/client.server") extends {
          supabaseAdmin: infer T;
        }
          ? () => T
          : never
      >,
  args: {
    input: NotifyInput;
    recipient: string;
    status: "skipped" | "failed";
    reason: string;
    message: string;
  },
): Promise<void> {
  // Best-effort audit row for skipped/failed; ignore unique-constraint
  // violations when dedupeKey collides with a prior send.
  const dedupe = args.input.dedupeKey
    ? `${args.input.dedupeKey}:${args.recipient}`
    : null;
  await admin
    .from("notification_events")
    .insert({
      event_key: args.input.event,
      recipient_user_id: args.recipient,
      dedupe_key: dedupe,
      status: args.status,
      reason: args.reason,
      message: args.message,
      payload: args.input.vars ?? {},
      actor_user_id: args.input.actorId ?? null,
    })
    .then(() => undefined, () => undefined);
}

export function allEventKeys(): string[] {
  return EVENT_CATALOG.map((e) => e.key);
}
