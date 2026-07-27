
# Overview & Analytics — production-grade, per-employee

Right now `/app` renders mock data (`KPIS`, `LEADS`, `ACTIVITY` from `src/lib/mock-data.ts`) and the sidebar's "Analytics" link points to the same route. We'll turn these into two **real, employee-scoped** pages backed by the existing tables (leads, lead_activities, lead_emails, lead_meetings, lead_transfer_requests, invoices, invoice_installments, invoice_payouts, expenses, company_ledger, withdrawal_requests, inbox_messages, user_sessions, impersonation_events).

Guiding principle: **whatever an employee sees for themselves, a super-admin sees for anyone** — either by picking them from an "Acting as" selector at the top of both pages, or by using the existing impersonation flow (same effect, because the pages read `auth.uid()` on the server).

---

## 1. Split the two pages, clearly

- **Overview = "today"** — actionable, real-time, personal. What do I need to *do right now*.
- **Analytics = "over time"** — performance, trends, quality. How am I doing / how is the team doing.

Sidebar "Analytics" moves from `/app` → `/app/analytics` (new leaf route).

---

## 2. Shared scope selector (both pages)

Header strip on both pages:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Acting as: [ Me ▾ ]      Range: [Today] [7d] [30d] [90d] [YTD] │
└─────────────────────────────────────────────────────────────────┘
```

- Regular employee → selector locked to "Me".
- Admin / super-admin → selector lists all employees + "Whole team".
- Selector value + date range live in URL search params (`?u=<userId>&r=30d`) so links are shareable and the state survives refresh.
- If a super-admin is currently impersonating, the banner already switches `auth.uid()`; the pages need no extra logic — server functions read the effective user.

---

## 3. Overview `/app` — the "today" board

Row 1 — **6 KPI tiles** (all scoped to selected user + range, with delta vs previous period):

| Tile | Source |
|---|---|
| New leads assigned | `leads.owner_id`, `created_at` |
| Leads touched today | distinct `lead_activities.lead_id` where `actor_id = user` |
| Meetings today | `lead_meetings` where user is `created_by` or in `attendees`, `starts_at::date = today` |
| Emails sent (24h) | `lead_emails.direction='out'`, `sent_by = user` |
| Invoices awaiting my action | `invoices.created_by = user` and `status in ('draft','sent','overdue')` |
| My wallet available | `invoice_payouts.status='available'` sum minus pending withdrawals |

Row 2 — three columns:

- **My inbox (unread)** — `inbox_messages.handled_by = user OR handled_by IS NULL`, top 8, click → `/app/inbox`.
- **Today's meetings** — chronological list from `lead_meetings`, join link, "Open lead" button.
- **Follow-ups due** — leads owned by user with `next_action` non-null, sorted by `last_activity_at` ascending (stalest first). Also surface leads with `last_activity_at > 5 days` as "stalled" chip.

Row 3 — **My open leads pipeline** — horizontal funnel by `leads.status` (new/contacted/viewed/meeting/converted/lost) with counts + click-through to filtered leads list. Uses `lead_status_options` for labels/colors.

Row 4 — **Live activity feed** (real-time via Supabase Realtime on `lead_activities`, `invoice_activity_logs`, `lead_emails`) — 20 most recent events the user is involved in, with deep links to the lead/invoice/customer.

---

## 4. Analytics `/app/analytics` — the "over time" board

Route file: `src/routes/_authenticated/app.analytics.tsx`. Same scope selector.

### 4a. Pipeline health (charts)

- **Leads funnel** (bar) — counts per status inside date range, with conversion rate `converted / (converted + lost + open)`.
- **Lead velocity** (line) — new leads/day and conversions/day, dual-series.
- **Source mix** (donut) — `leads.source` grouping; helps see which channel actually converts.
- **Avg time-to-first-contact** — `min(lead_activities.created_at) - leads.created_at` per lead, averaged.
- **Avg lead cycle time** — `updated_at - created_at` for leads that reached `converted`.

### 4b. Activity & productivity (per-user)

- **Daily activity heatmap** (7×~12 grid) — count of `lead_activities` per day per hour → shows working pattern.
- **Emails: sent vs replied** — `lead_emails` out vs subsequent in on same thread; reply-rate %.
- **Meetings held vs scheduled** — from `lead_meetings.status`.
- **Response latency** — median hours between first inbound `inbox_messages`/`lead_emails` and first outbound reply by user.

### 4c. Finance impact (per-user)

- **Revenue attributed to me** — sum of paid `invoice_installments.paid_amount` for invoices where I'm a `invoice_stakeholder` (any role), grouped by month, split by currency (USD/BDT).
- **Pipeline value** — sum of `invoices.total_amount` for `status in ('sent','partially_paid','overdue')` scoped by stakeholder.
- **Payouts** — locked / available / paid over time, plus outstanding `withdrawal_requests`.
- **Collections aging** — buckets 0–7 / 8–30 / 31–60 / 60+ days for `installments.status='overdue'`.

### 4d. Leaderboard (admin only, whole-team scope)

Sortable table: leads created, leads converted, revenue booked, emails out, meetings held, avg response time, active days. Click a row → sets selector to that user and stays on Analytics (drill-down without impersonation).

### 4e. Compliance & security (admin only)

- **Session activity** — active `user_sessions` per user, last IP/city.
- **Impersonation log** — from `impersonation_events` (last 30 days), collapsible so it doesn't dominate the page.
- **Idle / never-logged-in employees** — profiles with no `user_sessions.last_seen_at` in 14 days.

---

## 5. Super-admin drill-down (no impersonation needed)

- Scope selector already returns any employee's view.
- On every widget for a specific user, header shows `Viewing: <name> · <employee_code>` + an "Impersonate this employee" button (uses existing `startImpersonation` flow) for cases where the admin needs to *act as* them, not just observe.
- Impersonation banner stays as-is; when active, the selector auto-locks to that user with a note "Locked by active impersonation".

---

## 6. Real-time + caching

- All widgets driven by TanStack Query with `staleTime: 30–60s`.
- Overview subscribes to Supabase Realtime for `lead_activities`, `invoice_activity_logs`, `inbox_messages` (filtered by user id where possible) to keep the activity feed and KPIs fresh.
- Analytics charts revalidate on scope/range change; no realtime (aggregations are heavier).

---

## 7. Technical notes (safe to skim)

- **New server functions** in `src/lib/analytics.functions.ts` (all `.middleware([requireSupabaseAuth])`, gated by `is_super_admin` / `is_finance_admin` when scope != self):
  - `getOverviewKpis({ userId, range })`
  - `getMyOverviewFeed({ userId, limit })`
  - `getPipelineFunnel({ userId?, range })`
  - `getActivityHeatmap({ userId, range })`
  - `getEmailPerformance({ userId, range })`
  - `getMeetingStats({ userId, range })`
  - `getFinanceAttribution({ userId, range })` (returns USD + BDT split)
  - `getCollectionsAging({ userId? })`
  - `getTeamLeaderboard({ range })` (admin-only)
  - `getSecurityOverview()` (admin-only: sessions + impersonation events)
- Server functions do aggregation in SQL (single query per widget) — no client-side row scans. For heavier metrics we add tiny `SECURITY DEFINER` SQL functions (e.g. `get_user_daily_activity(uid, from, to)`) so RLS-heavy joins stay fast.
- Any query that reads another user's data checks `has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR auth.uid() = targetUserId` and throws otherwise — never trusts the client-supplied `userId`.
- Charts use a lightweight lib already in the shadcn ecosystem (`recharts` — add to `package.json` if not present).
- Delete `KPIS`, `LEADS`, `ACTIVITY` mock exports once Overview is wired.
- Fix sidebar so "Analytics" points to `/app/analytics` and "Overview" stays on `/app`.

---

## 8. Delivery order

1. Analytics route skeleton + scope selector + `getOverviewKpis` + new Overview KPIs (kills mock data). Sidebar fix.
2. Overview row 2/3/4 (inbox, meetings, follow-ups, funnel, live feed).
3. Analytics 4a pipeline + 4b activity widgets.
4. Analytics 4c finance widgets.
5. Analytics 4d leaderboard + 4e security (admin gate).
6. Realtime wiring + polish (empty states, loading skeletons, mobile stacking).

Each step is independently shippable; you can stop after any step and still have a working, non-mock Overview.
