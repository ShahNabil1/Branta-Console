import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { TELEGRAM_BOT_USERNAME } from "@/lib/telegram-constants";

function randomToken(len = 20): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += chars[buf[i]! % chars.length];
  return out;
}

export const getMyTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data } = await supabaseAdmin
      .from("telegram_subscriptions")
      .select("chat_id, telegram_username, telegram_first_name, linked_at, active")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data || !data.active) return { linked: false as const };
    return {
      linked: true as const,
      chatId: String(data.chat_id),
      username: data.telegram_username ?? null,
      firstName: data.telegram_first_name ?? null,
      linkedAt: data.linked_at,
    };
  });

export const startTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Clear stale pending requests for this user.
    await supabaseAdmin
      .from("telegram_link_requests")
      .delete()
      .eq("user_id", context.userId);

    const token = randomToken(20);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("telegram_link_requests")
      .insert({ token, user_id: context.userId, expires_at: expiresAt });
    if (error) throw new Error(error.message);

    return {
      deepLink: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`,
      botUsername: TELEGRAM_BOT_USERNAME,
      expiresAt,
    };
  });

async function unlinkForUser(userId: string) {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { data: sub } = await supabaseAdmin
    .from("telegram_subscriptions")
    .select("chat_id")
    .eq("user_id", userId)
    .maybeSingle();

  await supabaseAdmin
    .from("telegram_subscriptions")
    .delete()
    .eq("user_id", userId);
  await supabaseAdmin
    .from("telegram_link_requests")
    .delete()
    .eq("user_id", userId);

  if (sub?.chat_id) {
    const { sendTelegramToChatId } = await import("@/lib/telegram.server");
    await sendTelegramToChatId(
      sub.chat_id as unknown as number,
      "🔕 You've been unsubscribed from Branta Tech notifications. You won't receive further messages from this bot until you reconnect.",
    );
  }
  return { ok: true as const };
}

export const unlinkMyTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => unlinkForUser(context.userId));

export const adminUnsubscribeTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [su, ad] = await Promise.all([
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "super_admin",
      }),
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
    ]);
    if (!su.data && !ad.data) throw new Error("Forbidden: admin role required");
    return unlinkForUser(data.userId);
  });

export const getEmployeeTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [su, ad] = await Promise.all([
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "super_admin",
      }),
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
    ]);
    if (!su.data && !ad.data) throw new Error("Forbidden: admin role required");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: sub } = await supabaseAdmin
      .from("telegram_subscriptions")
      .select("chat_id, telegram_username, telegram_first_name, linked_at, active")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!sub || !sub.active) return { linked: false as const };
    return {
      linked: true as const,
      chatId: String(sub.chat_id),
      username: sub.telegram_username ?? null,
      firstName: sub.telegram_first_name ?? null,
      linkedAt: sub.linked_at,
    };
  });
