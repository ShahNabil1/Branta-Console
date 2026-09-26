# Leads — Mobile-first Refactor (App-like Sales Console)

Goal: Sales team operates Leads mainly from phone; management and delivery see the same data. Simple, smooth, app-like. No existing feature is removed — Sheets sync, drafts, transfers, customers conversion, finance, permissions, notifications all keep working.

## 1. Leads list (/app/leads)

Mobile (default):
- Sticky top: title + search bar; below it a horizontally scrollable status chip row (All, New, Contacted, Proposal Sent, Converted, Lost …) with counts.
- Quick tabs: "My leads" / "All" (All only for users who already have view-all rights) + "Today's follow-ups" and "Overdue" chips.
- Lead cards: name (15px bold), company, status dot, priority tag, owner avatar, next follow-up ("Today 4:30 PM", red when overdue), one-tap Call / WhatsApp buttons.
- Floating orange "+" button (bottom-right) → New Lead.
- Pull-style refresh button, infinite "Load more" instead of page numbers on phone.
- Swipe-free, large tap targets (min 44px), skeleton loaders, fade/slide-in animations.

Tablet/Desktop: same data in a two-pane layout — list on left, selected lead opens on the right (desktop ≥1280px); table view kept as optional toggle for management.

## 2. New Lead — structured form

Opens as a full-screen bottom sheet on phone (slides up), centered dialog on desktop. Grouped steps with a progress bar, sticky "Save lead" button:

1. Client — Lead/Client Name*, Company/Brand, Contact Person, Mobile*, WhatsApp (toggle "same as mobile"), Email
2. Requirement — Lead Source*, Interested Service*, Project Requirement, Approximate Budget (BDT/USD), Expected Timeline
3. Follow-up — Lead Status (default New), Priority (Low/Medium/High/Urgent, default Medium), Next Follow-up Date + Time, Client Notes

Lead Source options: Facebook Group, Facebook Page, Facebook Inbox, LinkedIn, WhatsApp, Referral, Website, Other (Other asks for detail).

Validation: required fields, BD phone format (01XXXXXXXXX / +880), email format, budget numeric, follow-up not in the past; inline error under each field, duplicate phone/email warning (existing check reused). Draft autosave keeps working.

## 3. Automatic ownership

On create the system saves Lead Owner = creator, Employee Name, Employee ID (employee code), creation date + time (GMT+6). Shown as a read-only "Created by" card. Management/admins can Reassign (existing transfer flow reused); reassignments appear in the timeline.

## 4. Lead detail — Messenger-style timeline

Mobile layout:
- Compact header: name, company, status pill (tap to change), priority, owner, Call / WhatsApp / Email quick buttons.
- Segmented tabs: Timeline (default) · Details · More.
- Timeline: chat-style bubbles grouped by day ("Today", "Yesterday", date), each with time (10:15 AM), author avatar + name. Employee updates = right/left bubbles; system events (created, status changed, reassigned, converted, lost, follow-up set, proposal sent) = small centered pills.
- Sticky composer at bottom (like Messenger): text box + quick action chips — "Portfolio shared", "Proposal sent", "Client replied", "Set follow-up". Send animates bubble in.
- Updates are append-only: never deleted or edited; stored with text, author, date, exact time.
- Details tab: all form fields, editable inline with autosave.
- More tab: existing Meetings, Emails, Documents, Social links, Teammates — kept but tucked away (not removed).

## 5. Activity log

Every important action auto-recorded as Person + Action + Date + Time: Lead Created, Status Changed, Note Added, Follow-up Added/Changed, Proposal Sent, Lead Reassigned, Lead Converted, Lead Lost, Priority changed. Shown in timeline and filterable ("Updates only" / "All activity").

## 6. Follow-up reminders

Follow-up date/time shows on cards and in "Today"/"Overdue" chips. Existing Telegram notification system sends a reminder to the owner at follow-up time (reuses notify system, no new channel).

## 7. Feel & motion

Bottom sheets, slide transitions between list and detail, skeletons, haptic-like press states, safe-area padding for phone notches, no horizontal overflow at any width, brand orange only for primary actions (existing design rules).

## Out of scope now

Email sending and Docs generation are hidden from the main flow (still reachable under "More"); no project/task/delivery module in this phase — the structure leaves room for it next.

## Technical details

- DB migration (additive only): `leads` add `contact_person text`, `whatsapp text`, `requirement text`, `budget numeric`, `timeline text`, `priority text default 'medium'` (check low/medium/high/urgent), `next_follow_up_at timestamptz`, `created_by_name text`, `created_by_code text`; index on `(owner_id, next_follow_up_at)`. Existing `value_usd`/`currency` reused for budget where sensible (budget mirrors value_usd to keep Sheets sync and reports intact).
- Upsert `lead_source_options` rows for the 8 sources (data change via SQL; old keys deactivated, not deleted, so existing leads still display).
- Trigger on insert: set `owner_id = created_by`, stamp creator name/employee code from `profiles`.
- `lead_activities.kind` extended: `update`, `follow_up`, `proposal_sent`, `priority_change`, `reassigned`, `converted`, `lost`; `updateLead` logs these automatically; `addLeadActivity` accepts new kinds. No update/delete RLS on activities (append-only).
- New components under `src/components/leads/`: `lead-card.tsx`, `lead-form-sheet.tsx`, `lead-timeline.tsx`, `timeline-composer.tsx`, `lead-header.tsx`. `app.leads.index.tsx` and `app.leads.$slug.tsx` rebuilt around them; `lead-detail.tsx` sub-tabs (Meetings/Emails/Documents/Teammates) reused unchanged inside "More".
- Follow-up reminder: add `lead.follow_up_due` event to existing notify drain cron.
- Server-side filters for My/All/Today/Overdue/status in `listLeads`; permission checks unchanged.
- Verify: typecheck, build log, mobile/tablet/desktop screenshots of list + form + detail.
