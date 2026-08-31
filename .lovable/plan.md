# Salary Management (Admin → Finance)

A new **Salary** page where an admin picks an employee, enters the amount, month and reason, and issues a salary slip. Issuing a slip automatically records a company expense and credits the employee's wallet, so it shows up on their dashboard.

## What gets built

### 1. Salary page (`/app/finance/salary`)
- New sidebar item under Finance, visible to finance/admin/super-admin only.
- Top KPIs: this month's total salary paid (BDT/USD), number of employees paid, pending/draft slips.
- "Issue salary" button opens a form:
  - Employee (searchable dropdown, same component used in invoices)
  - Salary month (month picker, e.g. August 2026)
  - Currency (BDT default) and base amount
  - Optional line components: bonus, overtime, allowance, deduction (label + amount), auto-computing the net payable
  - Payment method, transaction ID, payment date
  - Reason / purpose note ("kon karone deya hosse")
- Table of all issued slips: employee, month, net amount, status, date, actions (View slip, Download PDF, Print, Void).

### 2. Salary slip PDF
- A4 slip rendered server-side reusing the existing letterhead/branding geometry of the expense voucher (Digital and Print modes, amount in words, signature block).
- Public signed URL route, same HMAC signing pattern as invoice/expense PDFs.

### 3. Automatic linking
Issuing a slip does three things in one transaction-like flow:
- Creates an **expense** row with category `salary`, the net amount, payment method, txn id, department and the reason — so it appears in the Expenses page and in profit/loss reports.
- Creates a **manual employee payout** (`kind = salary`, status `available`) so the amount lands in the employee's wallet and their profile/wallet dashboard.
- Stores the slip record itself, linked to both, so View/Download always resolves to the right document.

Voiding a slip reverses both sides: the expense is removed and the payout is revoked using the existing clawback mechanism.

### 4. Employee-side visibility
- Employee's wallet/profile page gains a "Salary slips" list (own slips only) with view/download.
- Telegram notification to the employee when a slip is issued, using the existing notification system.

## Technical notes

- New table `public.salary_slips`: id, user_id, period_month (date, first of month), currency, base_amount, components jsonb, net_amount, reason, payment_method, txn_id, paid_on, status (issued/void), expense_id, payout_id, created_by, timestamps. GRANTs for `authenticated`/`service_role`, RLS: finance/admin full access via `is_finance_admin()`, employees SELECT their own rows.
- Unique guard on (user_id, period_month) for non-void slips to prevent double-paying a month; overriding requires voiding the old slip first.
- Server functions added to `src/lib/finance.functions.ts` (or a new `salary.functions.ts`): `listSalarySlips`, `issueSalarySlip`, `voidSalarySlip`, `listMySalarySlips`, `getSignedSalarySlipUrl`.
- PDF renderer in `src/lib/invoice-pdf.server.ts` style: new `renderSalarySlipPdf`, plus route `src/routes/api/public/salary.$slip[.]pdf.ts` with signature verification.
- Reuses `createExpense` and `addManualEmployeePayout` logic internally so ledger, notifications and reporting stay consistent.
