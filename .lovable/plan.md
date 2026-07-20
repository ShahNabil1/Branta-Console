## Goal

Enable Telegram notification subscription for each employee. Now: only the plumbing (link/unlink + chat_id capture + admin unsubscribe + reusable send helper). Actual event triggers will be wired later at project end.

## Setup steps (one-time, I'll guide you)

1. Link the Telegram connector to this project (`standard_connectors--connect telegram` → pick "Branta Tech CRM Notifier"). This exposes `TELEGRAM_API_KEY` server-side.
2. I'll register the bot webhook via the gateway to:
   `https://console.brantatech.com/api/public/telegram/webhook`
   Secret token = SHA-256(base64url) of `telegram-webhook:${TELEGRAM_API_KEY}` (derived, not stored).
3. In BotFather, set bot commands (`/start`, `/unlink`) — I'll list exact text. No token needed from you (gateway holds it).

## Database (one migration)

Table `public.telegram_subscriptions`:
- `user_id uuid PK` (references profiles/auth via user_id)
- `chat_id bigint unique not null`
- `telegram_username text`, `telegram_first_name text`
- `link_token text unique` (nullable — set while pairing, cleared after link)
- `link_token_expires_at timestamptz`
- `linked_at timestamptz`, `unsubscribed_at timestamptz`
- `active boolean not null default true`
- standard timestamps + updated_at trigger

Grants: `authenticated` = SELECT own row only; all writes via service_role from server fns. RLS: user can read own row.

## Server functions (`src/lib/telegram.functions.ts`)

- `startTelegramLink()` — auth'd. Generates a short random `link_token` (16 chars, 15-min TTL), upserts a placeholder row for the user (chat_id null allowed → schema uses a separate `telegram_link_requests` table OR nullable chat_id). Returns `{ deepLink: "https://t.me/<BOT_USERNAME>?start=<token>" }`.
- `getMyTelegramStatus()` — auth'd. Returns `{ linked, chatId?, username?, linkedAt? }`.
- `unlinkMyTelegram()` — auth'd. Deletes the row, best-effort sends a "You've been unsubscribed" message to the old chat_id.
- `adminUnsubscribeTelegram({ userId })` — admin/super_admin gated. Same as unlink but for another user.

To keep chat_id `not null` clean, use two tables:
- `telegram_link_requests(user_id, token, expires_at)` — ephemeral.
- `telegram_subscriptions(user_id, chat_id, …)` — only exists once paired.

## Server helper (`src/lib/telegram.server.ts`)

- `sendTelegramToUser(userId, text, opts?)` — looks up active subscription, calls `/sendMessage` via gateway. Silent no-op if not linked/inactive. Returns `{ ok, skipped? }`.
- `sendTelegramToChatId(chatId, text, opts?)` — low-level.
- Uses existing `callGateway` pattern; adds `telegram` to `ConnectorId` union and `TELEGRAM_API_KEY` map in `src/lib/connector-gateway.server.ts`.

## Public webhook (`src/routes/api/public/telegram.webhook.ts`)

- Verifies `X-Telegram-Bot-Api-Secret-Token` (constant-time compare against derived secret from `TELEGRAM_API_KEY`).
- Handles `/start <token>`: finds matching `telegram_link_requests` row (unexpired), creates `telegram_subscriptions` row with the sender's chat_id/username, deletes the request, replies "✅ Linked to <email>. You'll get Branta Tech notifications here."
- Handles `/unlink`: deletes subscription for that chat_id, replies confirmation.
- Handles duplicate chat_id (someone else already used this Telegram account): overwrite the old subscription (per your requirement — new link replaces stale one).
- Ignores everything else (returns 200 to prevent retries).

## UI

### Security & Notification tab (`app.profile.security.tsx`)

Replace `NotificationsPlaceholder` with a real **"Notifications"** section containing a `TelegramConnectCard`:
- Not linked: Telegram-branded button "**Connect with Telegram**" (official blue #229ED9 + paper-plane logo). Click → calls `startTelegramLink`, opens `t.me` deep link in new tab, shows in-place instruction ("Press *Start* in Telegram, then this card will update"), polls `getMyTelegramStatus` every 3s (max 3 min).
- Linked: shows Telegram username / chat_id (masked), linked-at, and a red **"Unlink Telegram"** button (uses existing `useConfirm`).
- Below: muted note — "Notification events will be added later. Once configured, you'll receive them here in real time."

### Admin — Employee detail (`app.employees.$userId.tsx`)

Add a new **"Notifications"** row inside the security/actions area (near ban/reset password):
- Shows current Telegram link status for that employee.
- Red button "**Unsubscribe Telegram**" (only enabled if linked) → `useConfirm` → `adminUnsubscribeTelegram`.
- Post-unsubscribe: no further notifications go to that chat.

## Telegram branding

- Official Telegram logo SVG in `src/components/social/telegram-icon.tsx` (paper plane, brand blue #229ED9).
- Button style matches existing social buttons — solid Telegram blue, white icon+text, hover darken.

## Not in scope (deferred to project end)

- Wiring specific events (lead assigned, mail failed, etc.) to `sendTelegramToUser`. Only the reusable helper ships now.
- Per-event opt-in preferences UI.

## Files touched

New:
- `src/lib/telegram.functions.ts`
- `src/lib/telegram.server.ts`
- `src/routes/api/public/telegram.webhook.ts`
- `src/components/social/telegram-icon.tsx`
- `src/components/profile/telegram-connect-card.tsx`

Edited:
- `src/lib/connector-gateway.server.ts` (add `telegram`)
- `src/routes/_authenticated/app.profile.security.tsx` (replace placeholder)
- `src/routes/_authenticated/app.employees.$userId.tsx` (admin unsubscribe button)
- One migration for the two Telegram tables.

## Post-build checklist you'll do

1. Link Telegram connector (I'll prompt).
2. Confirm bot username with me (needed for the `t.me/<bot>?start=` deep link — I'll store it as `VITE_TELEGRAM_BOT_USERNAME` public env or hardcode after you tell me).
3. I run `setWebhook` via gateway from the sandbox.
4. You test Connect from your own profile.
