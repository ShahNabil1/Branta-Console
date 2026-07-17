# Phase 3 — Leads Integrations

চারটা connector Leads module-এ deeply wire করবো। সব shared workspace account (hello@brantatech.com) use করবে।

---

## 1. Google Sheets দুইমুখী sync

**DB migration:**
- `leads` table-এ `sheet_row_id text`, `synced_at timestamptz` columns
- `integration_sync_state` table (kind, resource_id, cursor, last_sync_at) — Sheets/Calendar/Docs sync-এর জন্য shared

**Server functions (`src/lib/leads-sheets.functions.ts`):**
- `getOrCreateLeadsSheet()` — Sheet ID user profile-এর `settings jsonb`-এ persist, না থাকলে create করে header row বসাই
- `pushLeadsToSheet()` — সব leads Sheet-এ overwrite (values.update)
- `pullLeadsFromSheet()` — Sheet থেকে read করে DB upsert (sheet_row_id key ধরে)
- `fullSyncLeads()` — pull → merge → push

**UI:** Leads page-এ toolbar-এ "Sync sheet" button (dropdown: Push / Pull / Full sync), status pill + last synced relative time।

---

## 2. Gmail / Resend email compose (shared inbox)

**DB migration:**
- `lead_emails` table — lead_id, direction (outbound/inbound), provider (gmail/resend), message_id, thread_id, subject, body_html, body_text, from_email, to_emails[], cc_emails[], status (draft/sent/failed), sent_at, sent_by
- Realtime enable, RLS: read সবাই, write authenticated

**Server (`src/lib/lead-email.functions.ts`):**
- `sendLeadEmail({ leadId, provider, subject, body, cc })` — provider=gmail হলে Gmail API `users/me/messages/send` (RFC2822 base64url), provider=resend হলে Resend gateway। Response থেকে message_id + thread_id save, lead_activities-এ `email` type row insert
- `listLeadEmails(leadId)` — full thread history
- `pullGmailThread(leadId)` — Gmail থেকে `q=to:<email> OR from:<email>` search করে messages sync (inbound replies দেখানোর জন্য)

**UI:** Lead drawer-এ নতুন "Emails" tab
- Compose form: provider toggle (Gmail personal thread / Resend branded), subject, rich textarea, cc, Send button
- Thread view: chronological messages, direction indicator, timestamps
- "Refresh from Gmail" button

---

## 3. Google Calendar meeting scheduler

**DB migration:**
- `lead_meetings` table — lead_id, google_event_id, title, description, starts_at, ends_at, meeting_link, attendees[], status (scheduled/completed/cancelled), created_by
- Realtime + RLS

**Server (`src/lib/lead-meetings.functions.ts`):**
- `scheduleLeadMeeting({ leadId, title, startsAt, endsAt, attendees, description })` — Calendar API `events.insert` with `conferenceData` (auto Meet link), `sendUpdates=all`
- `cancelLeadMeeting(meetingId)` — `events.delete`
- `listLeadMeetings(leadId)`
- Meeting create হলে lead.status auto → `meeting_scheduled`, activity log

**UI:** Lead drawer-এ "Meetings" tab
- Upcoming/past sections, "Schedule meeting" button → modal (datetime picker, duration, description, attendees pre-filled with lead email)
- Meet link copy button, cancel action

---

## 4. Google Docs — proposal/contract generator

**DB migration:**
- `lead_documents` table — lead_id, doc_id, title, doc_url, template_kind (proposal/contract/nda), created_by

**Server (`src/lib/lead-docs.functions.ts`):**
- `generateLeadDoc({ leadId, templateKind, title })` — Docs API `documents.create` → `batchUpdate` দিয়ে template content (lead name, company, value inject করা structured requests) → return url
- Templates hardcoded server-side (proposal/contract/nda 3টা basic)
- `listLeadDocs(leadId)`

**UI:** Lead drawer-এ "Documents" tab
- Template picker → Generate → new tab-এ open হবে
- Existing docs list with open links

---

## Technical notes

- সব gateway calls `https://connector-gateway.lovable.dev/<connector>/...` — `LOVABLE_API_KEY` + connector-specific `X-Connection-Api-Key` header
- Lead drawer এখন 4 tabs হবে: **Overview** (existing) / **Emails** / **Meetings** / **Documents**
- সব connector errors user-friendly toast + server log
- Realtime subscriptions সব new table-এ
- Route tree regenerate

---

## Deferred (পরের phase)

- Bulk email campaigns (marketing — Lovable Emails limitation)
- Doc template visual editor (এখন hardcoded)
- Two-way Calendar sync (কেবল push, external edits pull করবেনা)
- Gmail label/folder management