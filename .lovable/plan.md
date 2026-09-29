# Branta Fund Ledger — additive finance layer

Nothing existing is removed or rewritten. Invoices, installments, payouts, wallet, expenses, salary, PDFs, and Leads Sheets sync keep working exactly as they do today. The ledger is a new layer placed on top of them.

## Delivery in 4 phases (each ships independently)

**Phase 1 — Core ledger (built first)**
- Funds: the 9 default funds (35/10/8/8/7/5/7/5/15), plus support for custom funds.
- Allocation versions: saved snapshots with an effective-from date. Past records never change.
- Direct deduction rules (percentage or fixed): gateway fee, broker, external cost, other.
- Auto allocation when an installment becomes **paid**. It uses only the cash actually received and saves a per-payment snapshot (received, deductions, distributable, and each fund's amount and %).
- Append-only fund ledger. Balances are always calculated from ledger rows and can never be edited by hand.
- Finance → **Fund Ledger** dashboard: overview totals and fund cards (Balance / Allocated / Spent / Committed / Borrowed / Lent / Available).
- Finance → **Fund Settings**: create, rename, reorder, activate or deactivate funds, and save a new version only when the total equals exactly 100%.
- Invoice detail gets a **Finance Allocation** section for each paid installment.

**Phase 2 — Spending**
- Expenses get an optional "Paying fund". An insufficient-balance dialog shows Required / Available / Shortfall with three choices: Transfer, Borrow, or Cancel.
- Inter-fund transfers, and loans with repayments (open / partially_repaid / repaid / cancelled).
- Employee Fund payments (project, salary, bonus, incentive, commission, overtime, adjustment), with committed (pending) vs paid.
- Optional links to an existing salary slip, expense, or invoice payout. A unique link prevents paying anyone twice.
- Owner/Director withdrawal from the Profit Fund.

**Phase 3 — Insight**
- Fund detail page: money in by project, client, invoice, and installment; money out; transfers and loans; date filter.
- Project profitability: collected, deductions, employee allocation vs actual paid (surplus or deficit), other allocations, and net contribution.
- Distribution analytics: This Month / Last Month / Custom / All Time.
- Reconciliation screen: real cash vs ledger total, committed, loans, unallocated eligible cash, and the difference. It shows a warning and never auto-corrects.

**Phase 4 — Legacy & Sheets**
- Past payments show as "Not allocated / Legacy". A manual **Generate Historical Allocation** option shows a preview first.
- A separate Finance Google Sheets export. The Leads sheet sync is not touched.

## Access
Only Super Admin, Admin, and Finance can see or change anything in the ledger, both on the server and in database rules. Everyone else gets nothing.

## Technical details
- New tables: `finance_funds`, `fund_allocation_versions` + `fund_allocation_version_items`, `fund_deduction_rules`, `installment_allocations` (snapshot, UNIQUE installment_id), `installment_allocation_deductions`, `fund_ledger` (append-only: no UPDATE or DELETE policy; a trigger blocks changes), `fund_transfers`, `fund_loans` + `fund_loan_repayments`, `employee_fund_payments` (UNIQUE payout_id / salary_slip_id when set).
- `expenses.fund_id` is a nullable additive column. No existing column is renamed or dropped.
- The trigger on `invoice_installments` fires when status changes to `paid` and calls an idempotent SECURITY DEFINER function, `allocate_installment(id)`. If it errors, it logs the problem and never blocks the payment.
- A `fund_balances` view gives derived balances. The insufficient-fund check runs server-side in the spend function.
- Every table uses GRANT + RLS with `is_finance_admin(auth.uid())`. Server functions live in `src/lib/fund-ledger.functions.ts` and use requireSupabaseAuth.
- Routes: `app.finance.funds.tsx`, `app.finance.funds.$code.tsx`, `app.finance.fund-settings.tsx`, `app.finance.reconciliation.tsx`.
- Existing payouts stay as they are. Phase 2 only links them.
