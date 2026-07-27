# Telegram Notifications — Event & Role Matrix Plan

লক্ষ্য: প্রতিটি ইমপ্লয়ীর কানেক্টেড টেলিগ্রামে **তার role আর তার সাথে সম্পর্কিত event** এ real-time notification যাবে। Admin/Super Admin এর কাছে একটা central control panel থাকবে যেখানে প্রতিটা event কোন role এ যাবে সেটা on/off করা যাবে, আর প্রতিটা ইউজার নিজের preference থেকে তার allowed events গুলা mute/unmute করতে পারবে।

## 1. Event Catalog (কোন কোন ইভেন্টে notification যাবে)

### A. Leads

- `lead.created` — নতুন lead তৈরি (manual বা Google Sheet sync থেকে)
- `lead.assigned` — কোনো lead আপনাকে assign হলো
- `lead.transfer.requested` — কেউ আপনার lead চাইছে (owner + admin)
- `lead.transfer.approved` / `lead.transfer.rejected` — requester কে জানানো
- `lead.status_changed` — Won / Lost / Qualified ইত্যাদি
- `lead.meeting.scheduled` / `lead.meeting.reminder` (T-30min) — assignee কে
- `lead.sheet_sync.failed` — Google Sheet sync ব্যর্থ (admin/finance N/A)

### B. Inbox / Email (Brevo + Resend)

- `inbox.new_reply` — lead/customer আপনার mail এ reply দিয়েছে (assignee)
- `email.bounced` / `email.complained` — sender কে + admin কে
- `email.delivery_failed` — কোনো outbound mail fail (sender + admin)

### C. Finance (Invoice + Payout + Wallet)

- `invoice.created` — Finance role + creator
- `invoice.sent` — Finance role
- `invoice.viewed` — customer PDF দেখেছে (creator + Finance)
- `invoice.installment.paid` — creator + Finance + Super Admin
- `invoice.overdue` — Finance + creator (daily digest নয়, per-invoice)
- `invoice.reminder_sent` — Finance (summary)
- `payout.available` — ইমপ্লয়ীর wallet এ payout unlock হলো
- `payout.requested` — ইমপ্লয়ীর withdrawal request → Finance/Super Admin
- `payout.paid` — ইমপ্লয়ীকে (তার withdrawal complete)
- `payout.revoked` — যেই ইমপ্লয়ীর revoke হলো + Finance
- `expense.added` — Finance role (>= threshold হলে)
- `wallet.company.low_balance` — Super Admin + Finance (configurable threshold)

### D. Security / Account

- `auth.new_device_login` — নিজেকে (unknown device/IP)
- `auth.password_changed` — নিজেকে
- `auth.mfa_changed` / `passkey.added` / `passkey.removed` — নিজেকে + Super Admin
- `auth.session.revoked_by_admin` — target user কে
- `auth.impersonation.started` / `stopped` — target user কে + Super Admin
- `auth.suspicious` — 3+ failed login বা geo mismatch → user + Super Admin

### E. System / Admin

- `employee.onboarded` — Super Admin (নতুন ইমপ্লয়ী onboarding শেষ)
- `employee.role_changed` — target user + Super Admin
- `permission.changed` — target user (কোন permission add/remove হলো)
- `integration.disconnected` — Super Admin (Brevo/Resend/Telegram/R2/Sheets fail)
- `cron.failed` — Super Admin (reminder job / sync job fail)

## 2. Role-based Default Matrix

Rule: **event → default subscribed roles**। User চাইলে নিজের preference থেকে off করতে পারবে (কিছু critical security event বাদে, যেগুলো always-on থাকবে)।

```text
Event group        | Employee | Finance | Admin | Super Admin
-------------------+----------+---------+-------+------------
Own lead events    |   ✅     |   —     |  ✅*  |    ✅*
All leads          |   —      |   —     |  ✅   |    ✅
Own meetings       |   ✅     |   —     |  —    |    —
Own inbox reply    |   ✅     |   —     |  —    |    —
Email bounces      |   sender |   —     |  ✅   |    ✅
Invoice lifecycle  |  creator |   ✅    |  —    |    ✅
Payout available   |   self   |   —     |  —    |    —
Payout requested   |   —      |   ✅    |  —    |    ✅
Payout paid/revoked|   self   |   ✅    |  —    |    ✅
Expense added      |   —      |   ✅    |  —    |    ✅ (large)
Company low balance|   —      |   ✅    |  —    |    ✅
Security (self)    |   self (always-on for critical)
Impersonation      |   target |   —     |  —    |    ✅
Role/permission chg|   target |   —     |  —    |    ✅
Integration fail   |   —      |   —     |  —    |    ✅
```

*Admin/Super Admin এর "all leads" scope থাকলে তারা সব lead event পাবে, নাহলে শুধু নিজের।

## 3. User Control (Profile → Notifications)

Profile পেইজে নতুন **"Telegram Notifications"** সেকশন:

- প্রতিটা event group এর জন্য toggle (Leads, Meetings, Inbox, Finance, Security, System)
- Quiet hours (start–end, timezone: Asia/Dhaka) — শুধু non-critical events silence হবে
- Digest mode (optional): কিছু event realtime না হয়ে দৈনিক 9AM summary হিসাবে যাবে (bounce summary, reminder summary)
- "Send test notification" বাটন

Critical events (`auth.suspicious`, `auth.session.revoked_by_admin`, `wallet.company.low_balance` for Super Admin) always-on, toggle disabled।

## 4. Admin Control (Settings → Notification Rules)

Super Admin only পেইজ:

- Event catalog table: event × role matrix, প্রতিটা cell এ default on/off toggle
- Per-event threshold (e.g. expense >= 5000 BDT, low balance <= 20000 BDT)
- Template editor (Handlebars variables) — সব event এর message template edit করা যাবে
- "Broadcast" button — custom message পাঠানো selected roles/users এ

## 5. Delivery Infrastructure

- নতুন table `notification_events` — audit log (event_type, user_id, payload, sent_at, tg_message_id, status)
- নতুন table `notification_preferences` — per-user toggles + quiet hours + digest choices
- নতুন table `notification_rules` — admin-controlled role×event matrix + thresholds + templates
- Central dispatcher `src/lib/notify.server.ts`:
  - `notify(event, payload, { actorId, resourceId })`
  - রুলস অনুযায়ী recipient resolve → preference check → quiet-hour check → template render → `sendTelegramToUser` → log
- Digest worker: pg_cron daily 09:00 Asia/Dhaka → `/api/public/hooks/notification-digest` → aggregated messages
- Idempotency key per event (e.g. `invoice.installment.paid:<installment_id>`) — duplicate suppress
- Failure handling: TG send fail হলে retry queue (max 3, exponential); permanent fail → mark subscription inactive + email fallback

## 6. Wiring (কোথায় trigger বসবে)

- `src/lib/leads.functions.ts` — create/assign/status change এ `notify(...)`
- `src/lib/lead-transfers.functions.ts` — request/approve/reject
- `src/lib/lead-meetings.functions.ts` — schedule + cron reminder
- `src/lib/inbox.functions.ts` + `brevo-events.server.ts` + `resend-events.server.ts` — inbound reply / bounce / complaint
- `src/lib/finance.functions.ts` — invoice create/paid/overdue, payout request/paid/revoked, expense add
- `src/lib/invoice-email.functions.ts` — viewed webhook থেকে
- `src/lib/user-sessions.functions.ts` + auth flow — new device / revoke / impersonation
- `src/lib/employee-detail.functions.ts` — role/permission change
- `src/lib/onboarding.functions.ts` — onboarding complete

## 7. Rollout Phases

1. **Phase 1 — Core infra**: tables, dispatcher, preferences UI, admin rules UI, test button। কোনো event wire না, শুধু "Broadcast" দিয়ে verify।
2. **Phase 2 — Finance events** (আপনার সবচেয়ে recent module): invoice + payout + expense + low balance।
3. **Phase 3 — Lead + Inbox events**: create/assign/transfer/meeting/reply/bounce।
4. **Phase 4 — Security + System events**: new device, impersonation, role change, integration fail, cron fail।
5. **Phase 5 — Digest + quiet hours + retry queue**।

---

### Questions before I build

1. Phase 1 (infra + preferences + admin rules UI) দিয়ে শুরু করবো, নাকি সরাসরি একটা specific group (যেমন Finance events) আগে wire করবো? Phase 1,2,3,4,5 এভাবেই আগাও 
2. Default matrix (section 2) ঠিক আছে, নাকি কোনো role এ কোনো event add/remove করতে চান?
3. Quiet hours + digest mode Phase 1 এ চাই, নাকি Phase 5 এই থাক?