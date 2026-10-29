import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron drain for deferred (quiet-hours / digest) and retry-queued
 * notifications. Idempotent: rows transition status only after send.
 * Recommended cadence: every 5 minutes.
 */
export const Route = createFileRoute("/api/public/hooks/notifications-drain")({
  server: {
    handlers: {
      POST: async ({ request }) => wrap(request),
      GET: async ({ request }) => wrap(request),
    },
  },
});

// Queue Telegram reminders for lead follow-ups due in the next 10 minutes.
// notify() dedupes per lead + follow-up timestamp, so repeated runs are safe.
async function queueFollowUpReminders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { notify } = await import("@/lib/notify.server");
  const now = Date.now();
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id, slug, name, owner_id, next_follow_up_at")
    .not("owner_id", "is", null)
    .gte("next_follow_up_at", new Date(now - 30 * 60_000).toISOString())
    .lte("next_follow_up_at", new Date(now + 10 * 60_000).toISOString())
    .limit(200);
  for (const l of (data ?? []) as Array<{ id: string; slug: string | null; name: string; owner_id: string; next_follow_up_at: string }>) {
    const time = new Date(l.next_follow_up_at).toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit" });
    await notify({
      event: "lead.follow_up_due",
      recipients: [l.owner_id],
      vars: { name: l.name, slug: l.slug ?? l.id.slice(0, 8), time },
      dedupeKey: `lead:${l.id}:followup:${l.next_follow_up_at}`,
    }).catch(() => {});
  }
}

async function wrap(request: Request): Promise<Response> {
  // Only the scheduler holding the dedicated cron secret may trigger the drain.
  const providedKey =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const expected = process.env.NOTIFICATIONS_DRAIN_CRON_SECRET ?? "";
  if (!expected || providedKey !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    await queueFollowUpReminders().catch((e) => console.warn("[drain] follow-ups", e));
    const result = await drain();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "cron.failed",
        recipientRoles: ["super_admin"],
        vars: { job: "notifications-drain", error: msg.slice(0, 400) },
        dedupeKey: `cron:notifications-drain:${new Date().toISOString().slice(0, 16)}`,
      });
    } catch {
      /* ignore */
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

interface Row {
  id: string;
  recipient_user_id: string;
  message: string | null;
  attempt_count: number;
  status: string;
}

async function drain() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendTelegramToChatId } = await import("@/lib/telegram.server");
  const { retryDelayMs, MAX_ATTEMPTS } = await import("@/lib/notify-scheduling");
  const nowIso = new Date().toISOString();

  // 1) Deferred rows whose window elapsed.
  const { data: deferredRows } = await supabaseAdmin
    .from("notification_events")
    .select("id, recipient_user_id, message, attempt_count, status")
    .eq("status", "deferred")
    .lte("deferred_until", nowIso)
    .limit(500);

  // 2) Retry rows that are due.
  const { data: retryRows } = await supabaseAdmin
    .from("notification_events")
    .select("id, recipient_user_id, message, attempt_count, status")
    .eq("status", "retry")
    .lte("next_attempt_at", nowIso)
    .lt("attempt_count", MAX_ATTEMPTS)
    .limit(500);

  const all = [...((deferredRows ?? []) as Row[]), ...((retryRows ?? []) as Row[])];
  if (all.length === 0) return { deferred: 0, retried: 0, sent: 0, failed: 0, dropped: 0 };

  // Fetch chat_ids + digest flag per unique user.
  const userIds = Array.from(new Set(all.map((r) => r.recipient_user_id)));
  const [subs, prefs] = await Promise.all([
    supabaseAdmin
      .from("telegram_subscriptions")
      .select("user_id, chat_id, active")
      .in("user_id", userIds),
    supabaseAdmin
      .from("notification_preferences")
      .select("user_id, digest_mode")
      .in("user_id", userIds),
  ]);
  const chatIdByUser = new Map<string, number>();
  for (const s of subs.data ?? []) {
    if (s.active) chatIdByUser.set(s.user_id as string, Number(s.chat_id));
  }
  const digestByUser = new Map<string, boolean>();
  for (const p of prefs.data ?? []) {
    digestByUser.set(p.user_id as string, Boolean(p.digest_mode));
  }

  // Group deferred rows per user for digest bundling.
  const deferredByUser = new Map<string, Row[]>();
  for (const r of (deferredRows ?? []) as Row[]) {
    const arr = deferredByUser.get(r.recipient_user_id) ?? [];
    arr.push(r);
    deferredByUser.set(r.recipient_user_id, arr);
  }

  let sent = 0;
  let failed = 0;
  let dropped = 0;

  // Deferred: digest or individual.
  await Promise.all(
    Array.from(deferredByUser.entries()).map(async ([uid, rows]) => {
      const chatId = chatIdByUser.get(uid);
      if (!chatId) {
        dropped += rows.length;
        await supabaseAdmin
          .from("notification_events")
          .update({ status: "skipped", reason: "no_telegram" } as never)
          .in("id", rows.map((r) => r.id));
        return;
      }
      const isDigest = digestByUser.get(uid) === true && rows.length > 1;
      if (isDigest) {
        const body =
          `🗂 <b>Digest — ${rows.length} update${rows.length > 1 ? "s" : ""}</b>\n\n` +
          rows.map((r) => `• ${r.message ?? ""}`).join("\n\n");
        const r = await sendTelegramToChatId(chatId, body, { parseMode: "HTML" });
        if (r.ok) {
          sent++;
          await supabaseAdmin
            .from("notification_events")
            .update({ status: "sent", sent_at: new Date().toISOString() } as never)
            .in("id", rows.map((row) => row.id));
        } else {
          failed++;
          await scheduleRetry(supabaseAdmin, rows, r.error, retryDelayMs, MAX_ATTEMPTS);
        }
      } else {
        for (const row of rows) {
          const r = await sendTelegramToChatId(chatId, row.message ?? "", {
            parseMode: "HTML",
          });
          if (r.ok) {
            sent++;
            await supabaseAdmin
              .from("notification_events")
              .update({ status: "sent", sent_at: new Date().toISOString() } as never)
              .eq("id", row.id);
          } else {
            failed++;
            await scheduleRetry(supabaseAdmin, [row], r.error, retryDelayMs, MAX_ATTEMPTS);
          }
        }
      }
    }),
  );

  // Retry rows individually.
  for (const row of (retryRows ?? []) as Row[]) {
    const chatId = chatIdByUser.get(row.recipient_user_id);
    if (!chatId) {
      dropped++;
      await supabaseAdmin
        .from("notification_events")
        .update({ status: "failed", reason: "no_telegram" } as never)
        .eq("id", row.id);
      continue;
    }
    const r = await sendTelegramToChatId(chatId, row.message ?? "", {
      parseMode: "HTML",
    });
    if (r.ok) {
      sent++;
      await supabaseAdmin
        .from("notification_events")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempt_count: row.attempt_count + 1,
        } as never)
        .eq("id", row.id);
    } else {
      failed++;
      await scheduleRetry(supabaseAdmin, [row], r.error, retryDelayMs, MAX_ATTEMPTS);
    }
  }

  return {
    deferred: (deferredRows ?? []).length,
    retried: (retryRows ?? []).length,
    sent,
    failed,
    dropped,
  };
}

type AdminClient =
  typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

async function scheduleRetry(
  admin: AdminClient,
  rows: Row[],
  error: string | undefined,
  retryDelayMs: (n: number) => number,
  maxAttempts: number,
): Promise<void> {
  for (const row of rows) {
    const attempts = (row.attempt_count ?? 0) + 1;
    if (attempts >= maxAttempts) {
      await admin
        .from("notification_events")
        .update({
          status: "failed",
          reason: error ?? "send_failed",
          attempt_count: attempts,
        } as never)
        .eq("id", row.id);
    } else {
      await admin
        .from("notification_events")
        .update({
          status: "retry",
          reason: error ?? "send_failed",
          attempt_count: attempts,
          next_attempt_at: new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
        } as never)
        .eq("id", row.id);
    }
  }
}
