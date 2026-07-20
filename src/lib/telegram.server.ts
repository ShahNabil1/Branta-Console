// Server-only Telegram helpers. Never import from browser code.
import { callGateway } from "@/lib/connector-gateway.server";
export { TELEGRAM_BOT_USERNAME } from "@/lib/telegram-constants";

export interface SendTelegramOptions {
  parseMode?: "HTML" | "MarkdownV2";
  disableNotification?: boolean;
  disableWebPagePreview?: boolean;
}

export async function sendTelegramToChatId(
  chatId: number | string,
  text: string,
  opts: SendTelegramOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  try {
    await callGateway({
      connector: "telegram",
      path: "/sendMessage",
      method: "POST",
      body: {
        chat_id: chatId,
        text,
        parse_mode: opts.parseMode ?? "HTML",
        disable_notification: opts.disableNotification ?? false,
        disable_web_page_preview: opts.disableWebPagePreview ?? true,
      },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] sendMessage failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

export async function sendTelegramToUser(
  userId: string,
  text: string,
  opts: SendTelegramOptions = {},
): Promise<{ ok: boolean; skipped?: true; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("telegram_subscriptions")
    .select("chat_id, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.active) return { ok: true, skipped: true };
  return sendTelegramToChatId(data.chat_id as unknown as number, text, opts);
}

// SHA-256(base64url) of `telegram-webhook:${TELEGRAM_API_KEY}` — used as the
// Telegram X-Telegram-Bot-Api-Secret-Token header. Derived so we don't have to
// persist a separate secret.
import { createHash } from "node:crypto";
export function deriveTelegramWebhookSecret(): string {
  const key = process.env.TELEGRAM_API_KEY;
  if (!key) throw new Error("TELEGRAM_API_KEY is not configured");
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}
