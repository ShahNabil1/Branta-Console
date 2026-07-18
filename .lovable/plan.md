# Inbox Page — Plan

সব ইনকামিং মেইল ([hello@brantatech.com](mailto:hello@brantatech.com) → Cloudflare routing → [brantatech@gmail.com](mailto:brantatech@gmail.com)) সরাসরি Gmail connector দিয়ে fetch করা হবে, DB-তে full body store না করে হালকা metadata cache রাখা হবে, আর reply যাবে existing Resend/Brevo queue দিয়ে।

## 1. Routing & Sidebar

- নতুন route: `src/routes/_authenticated/app.inbox.tsx` (list) এবং `app.inbox.$id.tsx` (thread view)।
- `app-sidebar.tsx`-এ Inbox item-এর `to` `/app` থেকে `/app/inbox` করা।

## 2. Gmail data flow (no heavy DB mirroring)

Gmail-ই source of truth। আমরা শুধু lightweight metadata cache রাখব যাতে lead-linking, notification, unread badge কাজ করে।

Server functions (`src/lib/inbox.functions.ts`, gateway = `google_mail`):

- `listInbox({ pageToken, q })` → `users/me/messages?q=to:hello@brantatech.com -from:me` (+ user filter) → `messages.get(format=metadata)` batched → returns thread list (subject, from, snippet, date, unread, labelIds, lead link)।
- `getThread(threadId)` → `users/me/threads/{id}?format=full` → parse MIME parts (text/plain + text/html), attachments metadata, headers (Message-ID, References, In-Reply-To)।
- `markRead(threadId)` → `messages/{id}/modify` removing `UNREAD` (needs `gmail.modify` scope; reconnect flow if 403)।
- `archiveThread`, `trashThread` — একই modify endpoint।

Client: TanStack Query + Supabase Realtime channel (নিচের cache table)। Auto-poll প্রতি 60s ও tab focus-এ refetch।

## 3. Metadata cache + lead linking

New table `public.inbox_messages` (Gmail message-id primary key):

```
gmail_message_id text pk, gmail_thread_id text, from_email citext,
from_name text, subject text, snippet text, received_at timestamptz,
is_unread bool, lead_id uuid null → leads(id), lead_contact_id uuid null,
handled_by uuid null (auto = lead.owner_id), created_at, updated_at
```

- GRANT authenticated select/update; service_role all; RLS: super_admin bypass + `handled_by = auth.uid()` OR lead-owner পড়তে/আপডেট করতে পারবে।
- Realtime publication-এ যুক্ত।

**Auto-linking logic** (server fn `syncInboxMessage`):

1. `listInbox` যেকোনো message আগে না দেখলে upsert row।
2. `from_email` দিয়ে `lead_contacts` + `leads.email/alt_email`-এ match খুঁজি → পেলে `lead_id`, `lead_contact_id`, `handled_by = lead.owner_id` সেট।
3. Match পেলে:
  - Gmail-এ label apply (`Lead/BT-XX`) — `users/me/labels` তে না থাকলে তৈরি → `messages.modify` addLabelIds।
  - `lead_activities`-এ `type='inbound_email'` row।
  - `leads.last_activity_at = received_at` (bumps to top)।
  - Owner-এর জন্য notification: existing `notifications_store` pattern-এ push + Realtime toast (নতুন component `InboxReplyNotifier` `EmailFailureNotifier`-এর মতো)।

Sync trigger:

- Inbox page open হলে ও প্রতি 60s এ background sync।
- (Optional Phase 2) Gmail push notification/pub-sub — এখন বাদ, polling যথেষ্ট।

## 4. Thread viewer (Gmail-like UI)

- Left: thread list (from, subject, snippet, time, unread bold, lead badge `BT-12` clickable → `/app/leads/$slug`)।
- Right: selected thread — collapsible messages, sanitized HTML iframe (DOMPurify) with plaintext fallback, attachment chips (download via Gmail `attachments.get`)।
- Filters: All / Unread / Linked to lead / Unlinked / by lead-owner (default = me)।
- Search box → passes as Gmail `q`।

## 5. Reply — Resend/Brevo (existing infra reuse)

Reply composer একই `lead-email` pipeline ব্যবহার করবে যাতে queue, chunking, plain+html dual, webhook tracking সব identical থাকে।

- `src/lib/inbox-reply.functions.ts` → internally reuse `sendLeadEmail` helper থেকে core send/enqueue logic (refactor করে `sendTrackedEmail({ leadId?, provider, to, subject, html, text, headers })` বানানো)।
- Reply message-এ Gmail থেকে original headers pass করে RFC threading maintain: `In-Reply-To: <original-Message-ID>`, `References: ...` — Resend/Brevo দুই provider-ই custom headers accept করে।
- Provider selector + fallback toggle Lead compose থেকেই clone।
- Tags: `lead_id`, `lead_slug`, `lead_email_id`, `inbox_thread_id` — Resend/Brevo webhook-এ existing sheet routing কাজ করবে; inbox thread-এর পাশে delivery status timeline দেখাব।
- Sent copy Gmail-এ দেখা যাবে না (SMTP নয়, API); তাই send success-এ Gmail `users/me/messages/send` না করে thread-এ আমাদের own record কার্ড দেখাব "Sent via Resend/Brevo · delivered/opened" — Gmail-এ mirroring optional Phase 2।

## 6. Scopes & setup guide

Gmail connector-এ প্রয়োজনীয় scopes: `gmail.readonly` (list/get), `gmail.modify` (mark read, apply Lead labels)। 403 `insufficient scopes` এলে `reconnect` prompt দেখাব।

## Technical Summary

- New files: `src/routes/_authenticated/app.inbox.tsx`, `app.inbox.$id.tsx`, `src/lib/inbox.functions.ts`, `src/lib/inbox-reply.functions.ts`, `src/components/inbox/*` (ThreadList, ThreadView, ReplyComposer, InboxReplyNotifier)।
- Refactor: `src/lib/lead-email.functions.ts` — extract `sendTrackedEmail` core।
- Migration: `inbox_messages` table + GRANTs + RLS + realtime publication।
- Sidebar route fix।
- No new secrets; uses existing `GOOGLE_MAIL_API_KEY`, `RESEND_API_KEY`, `BREVO_API_KEY`, webhook secrets।

## Open questions (ধরে নিয়েছি, ভুল হলে বলো)

1. Inbox filter: ধরে নিলাম শুধুই `to:hello@brantatech.com`-এর incoming (আমাদের নিজের পাঠানো মেইল বাদ)। Sent tab দরকার? - না, ইমেইল তো সেন্ড হবে আমাদের এ্যাক্সিস্টিং রিসেন্ড আর ব্রেভো দিয়ে আর লিড এর মতোই ওইটা ওইটার সব স্ট্যাটাস, ভিউ তে ক্লিক করলে ওইটার কী মেইল সব দেখা যাবে। 
2. সব employee পুরো inbox দেখবে, নাকি default view "assigned to me" + super_admin সব? আমি ২য়টা ধরেছি। - [hello@brantatech.com](mailto:hello@brantatech.com) এর পুরো ইনবক্স ই দেখুক সব ইমপ্লয়ী 
3. Notification: শুধু in-app bell/toast, নাকি email/push-ও? - in-app bell/toast আপাতত 