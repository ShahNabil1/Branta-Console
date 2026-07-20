## Scope

CRM ও Admin এর মাঝখানে **Finance** নামে একটা নতুন সেকশন যোগ করা হবে (sidebar-এ)। এটার আন্ডারে থাকবে:

1. **Dashboard** — P&L, income, expense, custom date range, PDF export
2. **Invoices** — dynamic invoice creation, milestones, payments, reminders
3. **Expenses** — company expense tracking
4. **Wallet** — প্রতি user এর locked/available balance, withdraw request
5. **Withdrawals** — Finance/Super-admin approval queue

Slug: **BT-01, BT-02, …** (invoice-wide sequence)
Payout: **Invoice-level %-split**, client payment এলে proportional unlock
Approver: `**finance` role + super-admin** (নতুন enum value)
Reminders: **3 দিন আগে + 1 দিন আগে + due day সকাল ৯টা + overdue হলে প্রতি ৩ দিন পর**, একটাই cron (`0 3 * * *` = 9AM BDT)

Everything realtime via Supabase Realtime on the relevant tables.

---

## Database

### Enum additions

```text
- app_role: add 'finance'
- new enum invoice_status: draft, sent, partially_paid, paid, overdue, void
- new enum installment_status: pending, invoiced, paid, overdue, cancelled
- new enum payout_status: locked, available, requested, paid, cancelled
- new enum withdrawal_status: pending, approved, rejected, paid
- new enum expense_category: salary, tools, ads, office, misc, tax, refund
```

### Tables (all with `created_at`, `updated_at`, RLS + service_role grants)

`**invoices**` — parent record

- `slug` (BT-XX, sequence-driven, unique)
- `customer_id → customers.id`
- `title`, `description`
- `project_type` ('one_time' | 'monthly_retainer')
- `starts_on`, `ends_on` (nullable, for retainer timeline)
- `currency` ('BDT' | 'USD', default 'BDT')
- `total_amount numeric(14,2)`
- `status invoice_status default 'draft'`
- `paid_amount numeric(14,2) default 0` (denormalized, updated by trigger)
- `notes`, `internal_notes`
- `created_by user_id`

`**invoice_stakeholders**` — Invoice-level %-split

- `invoice_id`
- `user_id → profiles.user_id`
- `role` ('outreach' | 'lead_closer' | 'worker' | 'company')
- `percent numeric(5,2)` (0-100, sum per invoice = 100)
- `unique(invoice_id, user_id, role)`
- Check: `SUM(percent) = 100` per invoice enforced via trigger

`**invoice_installments**` — client-side payment milestones

- `invoice_id`
- `sequence smallint` (1,2,3…)
- `label` (e.g. "Advance", "Mid", "Final")
- `amount numeric(14,2)` OR `percent numeric(5,2)` (one required)
- `due_date date`
- `status installment_status default 'pending'`
- `paid_at timestamptz`, `paid_amount`, `payment_ref`, `payment_method`
- On mark-paid trigger → recomputes stakeholder payout unlocks

`**invoice_payouts**` — auto-generated per (installment × stakeholder)

- `installment_id`, `invoice_id`, `user_id`, `role`
- `amount numeric(14,2)` (installment.amount × stakeholder.percent)
- `status payout_status default 'locked'`
- `unlocked_at`, `paid_at`
- Trigger: when installment→`paid`, all its payouts→`available`

`**wallet_balances**` — materialized view refreshed per payout change

- `user_id`, `locked`, `available`, `requested`, `paid_total`, `currency`

`**withdrawal_requests**`

- `user_id`, `amount`, `currency`, `payment_method_id` (from profile.payment_methods)
- `status withdrawal_status default 'pending'`
- `requested_at`, `decided_at`, `decided_by`, `paid_at`, `paid_by`
- `admin_note`, `transfer_ref`
- Trigger: on approve → linked payouts → `requested`; on paid → `paid`; on reject → `available`

`**expenses**`

- `category expense_category`, `amount`, `currency`
- `spent_on date`, `paid_by user_id`, `vendor`, `receipt_url` (R2)
- `notes`, `linked_invoice_id` (optional)

`**invoice_reminder_log**` — idempotent reminder tracking

- `installment_id`, `kind` ('t-3','t-1','due','overdue-3d')
- `sent_at`, unique(installment_id, kind, day_bucket)

### Sequence & trigger

- `CREATE SEQUENCE invoice_slug_seq START 1;`
- `assign_invoice_slug()` BEFORE INSERT → `'BT-' || lpad(nextval(...), 2, '0')`

### RLS summary

- **invoices, installments, stakeholders, payouts**: SELECT for `finance`/`super_admin` (all), plus stakeholder can SELECT their own payouts + parent invoice header; INSERT/UPDATE only `finance`/`super_admin`
- **wallet_balances**: SELECT own row + finance/super_admin all
- **withdrawal_requests**: INSERT own; SELECT own + finance/super_admin all; UPDATE only finance/super_admin
- **expenses**: only finance/super_admin

---

## Server functions (`src/lib/finance/*.functions.ts`)

- `listInvoices({ filter, dateRange })` / `getInvoice({ slug })`
- `createInvoice(payload)` — creates invoice + installments + stakeholders + payouts (transactional via one server fn hitting an RPC)
- `updateInvoice`, `updateInstallment`, `markInstallmentPaid`, `voidInvoice`
- `quickCreateCustomer(payload)` — inline customer creation from invoice modal
- `listMyPayouts()` / `getMyWallet()`
- `requestWithdrawal({ amount, payment_method_id })`
- `listWithdrawals({ status })` (finance/super_admin)
- `decideWithdrawal({ id, action:'approve'|'reject'|'paid', note, ref })`
- `listExpenses`, `createExpense`, `updateExpense`, `deleteExpense`
- `getFinanceReport({ from, to, currency })` — aggregates income/expense/profit/loss per bucket
- `generateInvoicePdf({ slug, audience: 'client'|'stakeholder' })` — returns PDF blob URL (see PDF section)

Privileged mutations use `requireSupabaseAuth` + role check via `has_role`.

---

## Reminders (cron)

- One `pg_cron` job at `0 3 * * *` UTC (= 9:00 AM BDT) hitting `/api/public/hooks/invoice-reminders`
- Handler for each unpaid installment computes days-to-due and picks the right template (`t-3`, `t-1`, `due`, `overdue-3d` cadence)
- Sends via Resend (`hello@brantatech.com`, "Branta Tech" sender) to all primary lead_contacts of that customer + CC to owner employee
- Records into `invoice_reminder_log` for idempotency

---

## PDF generation

- Server function using `**pdf-lib**` (pure JS, Cloudflare Worker-safe — verified in `mem://constraints/ssr-safe-imports.md` guidance)
- Two templates:
  - **Client invoice** — Branta Tech header, customer, line items = installments, totals, due dates, payment methods (from company config)
  - **Stakeholder statement** — same slug, but shows per-stakeholder payout table with role labels
- Uploaded to R2 (`invoices/{slug}/{audience}-{ts}.pdf`), signed URL returned
- Dashboard report PDF: aggregated P&L for the picked date range, same generator

---

## UI

### Sidebar

Insert **"Finance"** group between CRM and ADMIN in `src/components/branta/app-sidebar.tsx`:

- Dashboard (`/app/finance`)
- Invoices (`/app/finance/invoices`)
- Wallet (`/app/finance/wallet`) — visible to everyone
- Withdrawals (`/app/finance/withdrawals`) — finance/super_admin only
- Expenses (`/app/finance/expenses`) — finance/super_admin only

### Routes

```text
src/routes/_authenticated/
├── app.finance.tsx                        (layout w/ Outlet)
├── app.finance.index.tsx                  (Dashboard: KPI tiles, charts, date-range picker, "Download PDF")
├── app.finance.invoices.index.tsx         (grid, filters, "+ New invoice")
├── app.finance.invoices.$slug.tsx         (full detail: header, installments, stakeholders, payouts, activity, PDF download client+stakeholder)
├── app.finance.wallet.tsx                 (my locked/available balance, my payouts table, "Request withdrawal")
├── app.finance.withdrawals.tsx            (approval queue for finance/super_admin)
└── app.finance.expenses.tsx               (table + add/edit modal)
```

### Invoice detail page sections

- Header: slug (BT-01), customer link, status pill, total, paid, outstanding, "Download PDF" (client / stakeholder)
- Timeline strip for retainers
- **Installments** table — inline "Mark paid" (finance/super_admin), amount, due, status, payment ref
- **Stakeholders** panel — role, name, % (color-coded chips)
- **Payouts** panel (auto) — grouped by installment, locked/available badges
- Activity log
- Delete → typed-slug confirmation (reuse `useConfirm`)

### Create-invoice modal (multi-step)

1. Customer picker (search existing) OR "Quick create" inline form (name, company, primary email, phone)
2. Project details (title, type, timeline, currency BDT default, total amount, notes)
3. Installments builder (rows: label + amount OR % + due date; running validation sum = total)
4. Stakeholders builder (add employee rows; role dropdown; % — running validation sum = 100; live payout preview per installment)
5. Review → create

### Wallet page (everyone)

- Balance card (available/locked/requested/paid) — Bangla ৳ formatting, JetBrains Mono numerics
- "Request withdrawal" button → modal picks amount ≤ available and payment method from own profile
- My payouts table with invoice slug, role, installment, status, expected date

### Withdrawals queue (finance/super_admin)

- Rows with employee, amount, method, requested date
- Actions: Approve / Reject (with note) / Mark paid (with transfer ref)
- Realtime updates

### Dashboard

- KPI tiles: Total income (paid installments), Total expense, Net profit, Outstanding, Wallet locked, Wallet available (Company scope) — reuses `KpiTile`
- Charts: monthly income vs expense bar; category expense donut; top 5 customers by revenue
- Date range: presets (This month, Last month, Q, Year) + custom range
- "Download PDF report"

### Employee profile — Finance tab

Existing `app.profile.finance.tsx` gets a new **"Wallet snapshot"** card on top that links to `/app/finance/wallet` (Payment Methods block stays). No duplicate wallet UI — canonical wallet lives under Finance.

---

## Notifications (integrate with existing plumbing)

Wire via existing `sendTelegramToUser` + Resend for these events (helper only; user can toggle later):

- Invoice sent (to stakeholders)
- Installment paid → payout unlocked (to each stakeholder)
- Withdrawal approved / rejected / paid (to requester)
- Overdue installment (to owner + finance role)

---

## Technical Details

- **DB transactions**: create-invoice uses a single Postgres function `public.create_invoice(payload jsonb)` returning the new slug — atomic across invoices/installments/stakeholders/payouts.
- **Payout math**: at installment-paid time, trigger inserts/updates `invoice_payouts` rows = `installment.amount × stakeholder.percent / 100`, rounded HALF_EVEN, remainder assigned to the highest-percent stakeholder to avoid drift.
- **Wallet balances**: computed on the fly via a view `public.v_wallet_balances` grouping `invoice_payouts`; RLS via `security_invoker` view.
- **Currency**: BDT default; USD invoices tracked separately, no auto-conversion.
- **Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE invoices, invoice_installments, invoice_payouts, withdrawal_requests, expenses;`
- **PDF**: `pdf-lib` (Worker-safe, no fonts fetch); embed a base64 Inter subset in `src/lib/finance/pdf-fonts.ts`.
- **Cron**: `pg_cron` calls `https://console.brantatech.com/api/public/hooks/invoice-reminders` with `apikey` header.
- **Idempotency**: reminder log ensures one email per (installment, kind, day).

---

## Files touched

**New migrations** (one big migration for schema, one insert-tool call to set up cron after route lives).

**New source files:**

```text
src/lib/finance/
  invoices.functions.ts
  installments.functions.ts
  payouts.functions.ts
  withdrawals.functions.ts
  expenses.functions.ts
  reports.functions.ts
  pdf.server.ts
  pdf-fonts.ts
src/routes/_authenticated/
  app.finance.tsx
  app.finance.index.tsx
  app.finance.invoices.index.tsx
  app.finance.invoices.$slug.tsx
  app.finance.wallet.tsx
  app.finance.withdrawals.tsx
  app.finance.expenses.tsx
src/routes/api/public/hooks/
  invoice-reminders.ts
src/components/finance/
  invoice-form-modal.tsx
  installments-builder.tsx
  stakeholders-builder.tsx
  withdraw-request-modal.tsx
  wallet-balance-card.tsx
  finance-report-charts.tsx
```

**Edited:**

- `src/components/branta/app-sidebar.tsx` (add Finance group)
- `src/routes/_authenticated/app.profile.finance.tsx` (add Wallet snapshot linking to canonical page)

---

## Rollout / gaps confirmed

- Only plumbing + first-cut UI ships this round; **event triggers for Telegram** notifications are enabled but reuse existing helper.
- Company-side "Branta Tech" business info for the PDF header (address, VAT/BIN, logo) — currently hardcoded from `branta-credentials`. If you want it editable via a Settings page, that's a small follow-up.
- No FX conversion between BDT/USD (invoices are silo'd by currency).
- Withdrawal payments are marked manually — no real bank/MFS API integration.