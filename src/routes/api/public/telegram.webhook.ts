import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import {
  deriveTelegramWebhookSecret,
  sendTelegramToChatId,
} from "@/lib/telegram.server";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}
interface TgChat {
  id: number;
}
interface TgMessage {
  chat: TgChat;
  from?: TgUser;
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let expected: string;
        try {
          expected = deriveTelegramWebhookSecret();
        } catch {
          return new Response("Not configured", { status: 503 });
        }
        const provided =
          request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as {
          message?: TgMessage;
          edited_message?: TgMessage;
        };
        const message = update.message ?? update.edited_message;
        if (!message?.chat?.id) return Response.json({ ok: true });

        const text = (message.text ?? "").trim();
        const chatId = message.chat.id;
        const from = message.from;

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // /start <token> — pair this chat with the user who created the token.
        if (text.startsWith("/start")) {
          const parts = text.split(/\s+/);
          const token = parts[1]?.trim();
          if (!token) {
            await sendTelegramToChatId(
              chatId,
              "👋 Welcome to Branta Tech. Open your Branta console → Profile → Security & Notifications → <b>Connect with Telegram</b> to link this chat.",
            );
            return Response.json({ ok: true });
          }

          const { data: req } = await supabaseAdmin
            .from("telegram_link_requests")
            .select("user_id, expires_at")
            .eq("token", token)
            .maybeSingle();

          if (!req) {
            await sendTelegramToChatId(
              chatId,
              "❌ This link is invalid or has already been used. Please generate a new one from your Branta profile.",
            );
            return Response.json({ ok: true });
          }
          if (new Date(req.expires_at).getTime() < Date.now()) {
            await supabaseAdmin
              .from("telegram_link_requests")
              .delete()
              .eq("token", token);
            await sendTelegramToChatId(
              chatId,
              "⌛ This link has expired. Please generate a new one from your Branta profile.",
            );
            return Response.json({ ok: true });
          }

          // If this Telegram chat is already linked to a different user, or the
          // user already has a stale subscription, upsert overwrites it.
          await supabaseAdmin
            .from("telegram_subscriptions")
            .delete()
            .eq("chat_id", chatId);

          await supabaseAdmin.from("telegram_subscriptions").upsert(
            {
              user_id: req.user_id,
              chat_id: chatId,
              telegram_username: from?.username ?? null,
              telegram_first_name: from?.first_name ?? null,
              active: true,
              linked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

          await supabaseAdmin
            .from("telegram_link_requests")
            .delete()
            .eq("user_id", req.user_id);

          // Clear onboarding flag & check if onboarding is now complete.
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("must_change_password, must_link_telegram, full_name")
            .eq("user_id", req.user_id)
            .maybeSingle();
          const wasBlocking =
            !!(prof as { must_link_telegram?: boolean } | null)?.must_link_telegram;
          if (wasBlocking) {
            await supabaseAdmin
              .from("profiles")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .update({ must_link_telegram: false } as any)
              .eq("user_id", req.user_id);
          }
          const stillNeedsPwd =
            !!(prof as { must_change_password?: boolean } | null)?.must_change_password;
          if (wasBlocking && !stillNeedsPwd) {
            try {
              const { notify } = await import("@/lib/notify.server");
              await notify({
                event: "employee.onboarded",
                recipientRoles: ["super_admin", "admin"],
                vars: {
                  name:
                    (prof as { full_name?: string } | null)?.full_name ??
                    "New employee",
                },
                dedupeKey: `onboarded:${req.user_id}`,
                actorId: req.user_id,
              });
            } catch (e) {
              console.error("[telegram.webhook] onboarded notify failed:", e);
            }
          }

          // Look up the employee email for a friendlier confirmation.
          let email = "";
          try {
            const { data: userRes } =
              await supabaseAdmin.auth.admin.getUserById(req.user_id);
            email = userRes.user?.email ?? "";
          } catch {
            /* ignore */
          }

          await sendTelegramToChatId(
            chatId,
            `✅ <b>Connected to Branta Tech</b>${email ? ` as <code>${email}</code>` : ""}.\n\nYou'll start receiving your Branta notifications here. Send /unlink any time to stop.`,
          );

          // Verification test message so the employee can immediately confirm
          // notifications actually reach this chat.
          const linkedAt = new Date().toLocaleString("en-GB", {
            timeZone: "Asia/Dhaka",
            hour12: true,
            dateStyle: "medium",
            timeStyle: "short",
          });
          await sendTelegramToChatId(
            chatId,
            `🔔 <b>Test notification</b>\nThis is a verification message from Branta Tech to confirm your Telegram is linked successfully.\n\n<b>Chat ID:</b> <code>${chatId}</code>\n<b>Linked at:</b> ${linkedAt} (BDT)\n\nIf you can read this, notifications are working. ✅`,
          );
          return Response.json({ ok: true });

        }

        // /unlink — user-initiated unsubscribe from the Telegram side.
        if (text.startsWith("/unlink") || text.startsWith("/stop")) {
          const { data: sub } = await supabaseAdmin
            .from("telegram_subscriptions")
            .select("user_id")
            .eq("chat_id", chatId)
            .maybeSingle();
          if (sub) {
            await supabaseAdmin
              .from("telegram_subscriptions")
              .delete()
              .eq("chat_id", chatId);
            await sendTelegramToChatId(
              chatId,
              "🔕 Unsubscribed. You won't receive any more Branta Tech notifications on this chat.",
            );
          } else {
            await sendTelegramToChatId(
              chatId,
              "This chat isn't linked to a Branta Tech account.",
            );
          }
          return Response.json({ ok: true });
        }

        // Anything else: friendly hint, silent 200 to avoid Telegram retries.
        await sendTelegramToChatId(
          chatId,
          "🤖 Branta Tech notifier. Use the <b>Connect with Telegram</b> button in your Branta profile to link this chat, or /unlink to stop notifications.",
        );
        return Response.json({ ok: true });
      },
    },
  },
});
