# Leads Email + Lead Page Overhaul

বড় কাজ, 6 ফেইজে ভাগ করলাম। প্রতিটা ফেইজ merge-ready state — আগেরটা শেষ না হলে পরেরটায় যাবো না।

---

## Phase 1 — Lead slug + full page route

**DB migration**

- `leads` এ নতুন column `slug text unique` (format: `BT-01`, `BT-02`, ...)
- Sequence `lead_slug_seq` (starts 1)
- Trigger `before insert`: যদি slug null হয় → `'BT-' || lpad(nextval('lead_slug_seq')::text, 2, '0')` (2 digit min, 100+ হলে ন্যাচারালি 100, 1000)
- Existing rows-এর জন্য backfill: `lead_code` অর্ডারে slug assign (BT-01, BT-02...)
- `lead_code` field রেখেই দেবো (legacy display), কিন্তু route/UI-এ slug primary
- `lead_contacts` new table: `id, lead_id, email citext, label text, is_primary bool, created_at` — এক leadে multiple recipient email support (তোমার multi-email requirement)
- Migrate existing `leads.email` → `lead_contacts` row (is_primary=true)

**Route**

- নতুন file: `src/routes/_authenticated/app.leads.$slug.tsx`
- `app.leads.tsx` toolbar থেকে row-click → `navigate({ to: '/app/leads/$slug', params: { slug } })`
- Sheet drawer সম্পূর্ণ remove; list page শুধু grid + filters
- Full page layout: left column (lead meta + contacts CRUD), right column tabs (Overview / Emails / Meetings / Docs / Activity)
- URL হবে `/app/leads/bt-01` (case-insensitive lookup)

---

## Phase 2 — Resend-only compose (Gmail removed)

**UI (Emails tab, full page)**

- Provider selector সরানো — শুধু Resend badge
- **Recipient multi-select**: lead_contacts থেকে checkbox list, প্রতিটার পাশে email visible; selected যতগুলা, প্রত্যেকের কাছে আলাদা send (per-recipient email row → per-recipient webhook tracking)
- **Format toggle**: Plain Text / HTML (radio)
- **Personalization variable chips** — এক click-এ cursor position-এ insert:
  - `{{lead.name}}`, `{{lead.company}}`, `{{lead.first_name}}`
  - `{{contact.email}}`, `{{contact.label}}`
  - `{{sender.name}}`, `{{sender.email}}` (logged-in employee)
  - `{{date.today}}`, `{{date.tomorrow}}`
  - `{{lead.value_usd}}`, `{{lead.next_action}}`
  - Variables server-side render হবে send time-এ (client-side just preview)
- **Preview button** (HTML mode-এ): modal opens with rendered HTML in sandboxed iframe, variables substituted with actual lead data, exact final email দেখাবে
- Plain mode-এ Preview button hidden, textarea-ই enough

**Server (`sendLeadEmail` refactor)**

- Input: `{ leadId, contactIds[], format: 'html'|'text', subject, body }`
- Loop over contactIds → 1 lead_email row per recipient (initial status: `queued`)
- Variable interpolation server-side (never trust client-rendered body)
- Resend call per row; response `id` (Resend email id) saved in `provider_message_id`

---

## Phase 3 — Send queue (concurrency guard)

**Concept**: burst-safe без Redis (Supabase-only)

- `lead_emails.status` values: `queued | sending | sent | failed | ...webhook statuses`
- `lead_email_queue` view: `count(*) where status='sending'`
- Send flow (server fn `enqueueLeadEmails`):
  1. Insert all recipient rows as `queued` (atomic)
  2. Advisory lock via `pg_try_advisory_xact_lock(hashtext('resend_send_slot'))`
  3. Count current `sending` rows
  4. If total (sending + this batch) ≤ 10 → mark this batch `sending`, fire Resend calls in parallel
  5. If > 10 → mark first (10 − sending) as `sending`, rest stay `queued`
- **Drain worker**: `processQueue` server fn called after every send completion + on webhook receive; picks up `queued` rows FIFO in chunks of 10, respects same 10-concurrent cap
- Client polls `/api/public/queue-status` OR uses Supabase realtime on `lead_emails` for status transitions
- UI thread badge: `queued` → "In queue" chip; `sending` → spinner; `sent` → Resend chip with delivery events

**Why not Sheets as source of truth (তোমার প্রশ্নের উত্তর)**:

- Google Sheets API: 60 write/min per user, 300/min per project — 10 employee × burst webhooks সহজে quota trip করবে
- Sheets-এ কোনো true realtime push নেই; polling দরকার = latency + quota burn
- Row-level concurrent writes race condition prone
- **Recommendation**: primary write Supabase-এ (fast, realtime built-in), Sheets-এ background mirror হিসেবে append (existing `pushLeadsToSheet`-এর মতো on-demand)। এতে DB load actually কম কারণ realtime subscription indexed table থেকে সরাসরি push করে, তোমার webhook-এর জন্য extra table scan নেই।

---

## Phase 4 — Resend webhook + per-event tracking

**Webhook URL (আগেই generate করে দিলাম, তুমি Resend-এ paste করবে)**:

```
https://console.brantatech.com/api/public/resend/webhook
```

(secret optional — Resend Svix-signature verify করবো header থেকে; তুমি Resend dashboard-এ webhook create করার পর signing secret দাও, আমি form-এ যোগ করব)

**DB**

- `lead_email_events` table: `id, lead_email_id fk, event_type, occurred_at, payload jsonb, created_at`
- Event types (Resend থেকে যা আসে): `email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.opened, email.clicked, email.failed, email.scheduled, email.suppressed`
- Realtime enable
- RLS: read authenticated, write service_role only
- Unique index (`lead_email_id, event_type, occurred_at`) — idempotent replay

**Webhook handler** (`src/routes/api/public/resend.webhook.ts`)

- Svix signature verify (svix package + `RESEND_WEBHOOK_SECRET`)
- Payload-এ Resend email id → lookup `lead_emails.provider_message_id` → insert event row
- **Burst protection**: webhook হ্যান্ডলার সরাসরি insert করে return (fast ack), heavy processing (queue drain, notification fanout) supabase trigger + separate `processWebhookQueue` fn দিয়ে batched
- Insert `lead_emails.status` update trigger: latest event → status column sync

**UI — Resend chip on each thread row**

- Small pill with actual Resend logo (SVG from Resend brand kit) + colored dot based on latest event
- Colors: sent gray, delivered green, opened blue, clicked purple, bounced/failed red, complained/suppressed dark red, delayed amber
- Hover (Tooltip): full event history reverse-chronological with timestamps (`Delivered · 12 Nov 2026 03:42:11`, `Opened · 12 Nov 2026 03:45:02`)
- Chip click → drawer with raw event JSON (debug)

**Thread row also shows**: sender employee name + avatar + "sent at" timestamp

---

## Phase 5 — Failure notifications + retry

**DB**

- `notifications` table: `id, user_id, type, title, body, link_url, read_at, created_at`
- RLS: users read own only

**Flow**

- Lead email failed OR bounced OR complained → trigger inserts notification for `leads.owner_id` (or sender if no owner)
- Notification bar (top bar existing component) shows unread count + dropdown
- Single failure click → `/app/leads/{slug}` (Emails tab, failed row highlighted, error reason visible)
- Multiple pending failures (>1 unread failure) click → `/app/leads/failures` page

**Failures page** (`src/routes/_authenticated/app.leads.failures.tsx`)

- Server-side paginated list of failed/bounced emails
- Page size selector: 20 (default) / 40 / 60 / 80 / 100 — persisted in `localStorage` key `failures_page_size` + URL search param (survives refresh)
- Columns: lead slug, recipient, subject, failure reason, sender, failed_at, retry button
- Manual **Retry** button per row → re-enqueues via Phase 3 queue with same subject/body/format/contact
- Bulk select + bulk retry

---

## Phase 6 — Polish

- Remove all Gmail-related code paths (`pullGmailForLead`, gmail provider branch, GMAIL_FROM_HEADER)
- Update `.lovable/plan.md` to reflect Resend-only
- Route tree regen
- Realtime subscriptions on: `lead_emails`, `lead_email_events`, `notifications`

---

## Technical notes

- Slug format: `BT-` + `lpad(seq, 2, '0')` — 1→BT-01, 99→BT-99, 100→BT-100, 1000→BT-1000, 10000→BT-10000 (natural growth, no truncation)
- Advisory lock scope: transaction-level, so no leaked locks
- Preview iframe: `sandbox="allow-same-origin"` only, no scripts, srcDoc-এ interpolated HTML
- Variable interpolation: simple `{{path.to.value}}` regex, missing values → empty string, HTML-escape by default in HTML mode

---

## Open questions (কাজ শুরুর আগে confirm করো)

1. **Slug uniqueness cross-workspace**: single tenant assumption ঠিক তো? (এখন multi-tenant না, তাই sequence global — নাকি per-owner চাই?) - এটা কোনো মাল্টি টেনেন্ট SAAS না, এটা Branta Tech এর নিজস্ব সম্পূর্ণ Internal System এটা শূধু আমরা Branta Tech এর ইমপ্লয়ীরাই ইউজ করবো তাই ওয়ার্কস্পেস অনুযায়ী কোনো Slug Uniqueness কেন কিছুই থাকবেনা, সবাই সেইম সবকিছুই দেখবে। 
2. **Contact primary email**: existing `leads.email` column রেখেই দেবো (backward compat, primary display), নাকি সম্পূর্ণ drop করে শুধু `lead_contacts` থেকে fetch? - এইটা যেই এ্যাপ্রোচ সবচেয়ে ভালো, ক্লিন আর ফিউচারপ্রুফ হয় সেইটাই করো যেহেতু ভবিষ্যতে Audit হবে এসকল কিছু তাই যেইটা বেস্ট প্র্যাক্টিস সেইভাবেই করবা। 
3. **Failure notification threshold**: "একের বেশি failed" মানে exactly 2+? নাকি 5+ hit করলে aggregate page-এ redirect? 1+ হইলেই আলাদা পেইজ, সেই পেইজ থেকে একটার পর একটাতে ঢুকে ফিক্স করে আবার ব্যাক করলে আগের পেইজে যাবে, ফিক্স হইলে ওই পেইজ থেকে চলে যাবে আর ফিক্স না হইলে ওইটা ওইখানেই থাকবে। 
4. **Retry limit**: manual retry কতবার পর্যন্ত allow? (unlimited নাকি max 3?) - একটা সিংগেল ইমেইলের ক্ষেত্রে একদিনে ম্যাক্সিমাম ৩বারই ঠিক আছে, মানে প্রতিদিন ৩বার করে করা যাবে আর কী। 
5. **Queue chunk timing**: 10 concurrent limit hit করলে next batch immediately drain হবে (as slots free) — কোনো minimum delay লাগবে (Resend rate limit protection)? - যেইটা বেস্ট হ্যান্ডেল হবে, ফেইল/ড্রপ এর চান্স থাকবেনা, সিস্টেম ভাঙ্গবেনা সবকিছু স্মুথলি চলবে সেইভাবেই করো। 

উত্তরগুলা confirm করলে Phase 1 থেকে শুরু করবো।