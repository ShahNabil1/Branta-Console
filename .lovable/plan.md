# Unified Employee Wallet Ledger (replaces old wallet)

## What changes for users
- Every employee has one wallet. Its balance is always worked out from a list of money-in and money-out entries. No one can type in a balance.
- Employee Profile → Wallet shows: Available, Pending/Committed, Today / This Week / This Month earned, Total Earned, Total Withdrawn, then a bank-style statement with a running balance, date and type filters.
- New page Finance → Employee Wallets lists every employee's totals, with filters. Click a row to open their statement.
- Withdrawals move onto the new wallet: Requested → Approved → Paid, or Rejected / Cancelled. An employee can never request more than Available.
- The old wallet, old payouts and old withdrawals stay untouched. They become read-only and appear under "Legacy Wallet History".

## Current data (checked)
- Old wallet: 7 employees, 37 old payouts, 4 withdrawals (2 paid = ৳1,100, 2 rejected), 3 Employee Fund payments (all Approved, ৳2,730, so no wallet effect yet), 3 salary slips.
- Found a mismatch: the old wallet shows only ৳100 "paid out", but ৳1,100 of withdrawals are marked paid. The preview will flag this. Migration stays blocked for any employee whose numbers don't add up until Finance confirms the right figure.

## Migration strategy: Option A (safer)
- For each employee, one "opening balance" entry equal to their checked old Available balance. Old Locked amounts from payouts that were never paid out come across as "Pending (legacy)", not as Available.
- Why Option A: old payouts mix auto-generated stakeholder shares with manual edits, and old withdrawals don't link cleanly to payouts. Copying them one by one would risk counting the same money twice.
- Preview screen (Finance only): Employee, Old Balance, Migration Balance, Legacy Payout count, Legacy Withdrawal count, Difference. Needs a reason and a confirmation. Running it a second time is blocked in the database.
- Audit row for each employee: old value, new opening balance, date, who ran it, reason, and a snapshot of the source data.

## Wallet formulas
- Wallet Balance = sum of credits − sum of debits (Posted entries only)
- Available = Wallet Balance − open withdrawal holds (Requested or Approved)
- Pending = Employee Fund payments in Committed status, plus legacy Locked amounts, shown separately and never counted in Available
- Withdrawals are subtracted once only: the request holds the amount, and Paid posts one debit and releases the hold. Rejected or Cancelled just releases the hold.

## Where money comes from (after the switch)
- Employee Fund payment reaches Paid → one wallet credit tagged `project_earning`, with client, project, invoice, installment and task attached.
- Salary slip marked paid → one `salary` credit. Bonus, incentive, commission, overtime and adjustments are added by Finance with a reason.
- Old payouts are no longer credited for new Fund Ledger invoices. The old wallet-credit trigger for Employee Fund payments is switched off.

## Duplicate protection
- Each entry records where it came from (source type + source ID) and that pair must be unique. This blocks double credits from retries, re-running the migration, and the same payment being counted twice.
- Entries can never be deleted or edited. Mistakes are fixed with a correction or reversal entry.

## Security
- Employees see only their own wallet. Finance, Admin and Super Admin see all. Managers see all only with an explicit permission. Enforced in the database and on the server.

## Reconciliation
- Per employee: Ledger Balance, Expected balance (opening + credits from paid sources − paid withdrawals), Pending Withdrawals, Earned, Withdrawn, Difference.
- Company total: Total Employee Wallet Liability, compared with Employee Fund payments that are Committed or Paid.

## Technical details
- New tables: `wallet_ledger` (employee_id=user_id, transaction_type enum with 13 values, direction, amount, currency, project/task/invoice/installment/employee_payment/salary_slip/withdrawal ids, source_type, source_id, reference, description, status, created_by; UNIQUE(source_type, source_id, direction)); `wallet_withdrawals` (statuses requested/approved/paid/rejected/cancelled); `wallet_migrations` (unique per employee+currency). GRANTs, RLS, immutability triggers.
- Views/RPCs: `wallet_balances_v2`, `wallet_statement_v2(_user)`, `wallet_request_withdrawal` (row lock + available check), `wallet_withdrawal_set_status`, `wallet_post_adjustment` (finance-only), `wallet_migration_preview()`, `wallet_migrate(_rows, _reason)`, `wallet_reconciliation()`.
- Triggers: EFP → Paid posts credit (replaces `efp_wallet_credit` target); salary slip paid posts credit.
- Legacy lock: old `requestWithdrawal` and payout-to-wallet paths refuse new writes after migration (flag in `integration_sync_state`); old tables get no changes to existing rows.
- UI: rewrite `my-wallet-panel.tsx` and `wallet-statement.tsx` on v2 functions; new `app.finance.employee-wallets.tsx` (+ migration preview and reconciliation tabs); `app.finance.withdrawals.tsx` switches to v2; Legacy Wallet History tab reuses the old tables read-only; add to sidebar under Team Payments.
- Tests: rolled-back SQL transactions for the 18 listed cases; typecheck/build.

## Risks
- The ৳100 vs ৳1,100 mismatch must be settled before those employees are migrated.
- Old Locked amounts (about ৳17.9k) belong to unpaid old invoices. After the switch they show as legacy pending and won't unlock on their own unless Finance posts a credit.
