# Unified Employee Wallet Ledger Migration Plan

## Goal

পুরনো Wallet system replace করে একটি নতুন **single-source-of-truth Employee Wallet Ledger** তৈরি করতে হবে।

মূল উদ্দেশ্য:

- প্রতি employee-এর একটি wallet
- balance manual edit করা যাবে না
- সব earning/debit ledger transaction থেকে হিসাব হবে
- old wallet/history delete করা যাবে না
- old system read-only legacy হবে
- new wallet হবে active system

---

## Phase 1: Audit Existing Wallet System

Implementation শুরুর আগে existing wallet system audit করতে হবে।

Check:

- Old wallet balances
- Old available balances
- Locked amounts
- Old invoice payouts
- Paid payouts
- Requested payouts
- Old withdrawals
- Paid withdrawals
- Rejected withdrawals
- Salary slips
- Employee Fund Payments
- Existing wallet triggers
- Existing payout-to-wallet logic

প্রতি employee-এর জন্য একটি snapshot তৈরি করতে হবে।

### Special mismatch

বর্তমানে old wallet paid-out amount এবং actual paid withdrawals-এর মধ্যে mismatch আছে।

Example:

- Old wallet paid-out: ৳100
- Paid withdrawals: ৳1,100

এই mismatch silently fix করা যাবে না।

Finance review করতে হবে।

---

# Phase 2: Build New Wallet Ledger

Create:

`wallet_ledger`

প্রতিটি wallet transaction immutable হবে।

Fields:

- id
- employee_id
- currency
- transaction_type
- direction
- amount
- status
- project_id
- task_id
- invoice_id
- installment_id
- employee_payment_id
- salary_slip_id
- withdrawal_id
- source_type
- source_id
- reference
- description
- created_by
- created_at

### Transaction Types

Support:

- project_earning
- salary
- bonus
- incentive
- commission
- overtime
- adjustment_credit
- adjustment_debit
- withdrawal
- refund
- migration_opening_balance
- correction
- reversal

---

# Phase 3: Wallet Balance Logic

Do not store editable wallet balance.

### Ledger Balance

```
Ledger Balance
=
Posted Credits
-
Posted Debits
```

### Available Balance

```
Available Balance
=
Ledger Balance
-
Open Withdrawal Holds
```

Open withdrawal hold includes:

- Requested
- Approved

### Pending / Committed

Pending must stay separate from balance.

Pending includes:

- Committed Employee Fund Payments
- Legacy Pending amounts

Pending must NOT increase Available Balance.

---

# Phase 4: Employee Fund Integration

New wallet must connect directly with existing Employee Fund Payments.

Flow:

```
Client Payment
→ Fund Allocation
→ Employee Fund
→ Employee Distribution
→ Employee Payment
→ Wallet Credit
```

### Wallet effect

Draft:

- no wallet effect

Approved:

- no available balance effect

Committed:

- show as Pending

Paid:

- create wallet credit

Each Employee Payment can create only one wallet credit.

Use database-level duplicate protection.

---

# Phase 5: Salary and Other Earnings

New wallet should also support:

- Salary
- Bonus
- Incentive
- Commission
- Overtime
- Adjustment

Salary Slip marked paid should create one salary wallet credit.

Manual Finance earnings must require:

- employee
- amount
- type
- reason
- created_by

No manual balance adjustment directly.

---

# Phase 6: New Withdrawal System

Create:

`wallet_withdrawals`

Statuses:

- Requested
- Approved
- Paid
- Rejected
- Cancelled

### Withdrawal rules

Employee can request only:

```
Amount <= Available Balance
```

When Requested:

- create withdrawal hold
- reduce withdrawable Available

When Approved:

- hold remains

When Paid:

- post one wallet debit
- release hold

When Rejected/Cancelled:

- release hold
- no wallet debit

Important:

Withdrawal amount must never be deducted twice.

---

# Phase 7: Bank-Style Employee Wallet UI

Employee Profile → **Wallet**

Top cards:

- Available Balance
- Pending / Committed
- Today Earned
- This Week Earned
- This Month Earned
- Total Earned
- Total Withdrawn

Below:

## Wallet Statement

Columns:

- Date
- Description
- Client
- Project
- Invoice
- Installment
- Task
- Type
- Credit
- Debit
- Running Balance
- Status
- Reference

Filters:

- Today
- This Week
- This Month
- Last Month
- Custom Date
- All Time

Transaction filters:

- Project Earning
- Salary
- Bonus
- Commission
- Withdrawal
- Adjustment
- Other

Click transaction → full source details.

---

# Phase 8: Admin Employee Wallet Dashboard

Create:

**Finance → Employee Wallets**

Top company metrics:

- Total Employee Wallet Liability
- Total Available
- Total Pending
- Total Earned
- Total Withdrawn
- Total Employee Fund Committed

Employee table:

- Employee
- Available
- Pending
- Today
- This Week
- This Month
- Total Earned
- Total Withdrawn

Click employee → full statement.

Filters:

- Employee
- Date
- Client
- Project
- Payment Type
- Currency

---

# Phase 9: Legacy Wallet Migration

Old wallet must NOT be deleted.

After migration:

**Old Wallet = Legacy Read Only**

## Migration Strategy

Use one opening balance transaction per employee.

Transaction type:

`migration_opening_balance`

Migration balance should come from verified old Available balance.

Do not migrate every historical payout individually unless necessary.

This avoids duplicate counting.

---

# Phase 10: Migration Preview

Before migration, Finance must see:


| Employee | Old Balance | Migration Balance | Legacy Payouts | Withdrawals | Difference |
| -------- | ----------- | ----------------- | -------------- | ----------- | ---------- |


Migration cannot proceed if there is an unexplained difference.

Finance must enter:

- migration reason
- mismatch resolution if needed

---

# Phase 11: Migration Mismatch Resolution

If historical numbers do not reconcile, show a detailed breakdown.

Show:

- Old Wallet Balance
- Old Available
- Old Paid-Out
- Paid Withdrawal Total
- Paid withdrawal records
- Legacy payout totals
- Locked amount
- Difference

Finance must explicitly choose migration basis:

### Option A

Use verified legacy wallet balance

### Option B

Use recalculated balance from transaction history

Require reason.

Store decision in migration audit.

Do not alter historical tables.

---

# Phase 12: Legacy Pending

Old Locked amounts must NOT be mixed with normal new Pending.

Create separate label:

**Legacy Pending**

For each Legacy Pending item, Finance can choose:

- Convert to Wallet Credit
- Cancel Legacy Pending
- Link to Employee Fund Payment
- Keep Pending

Any action must have:

- reason
- user
- timestamp
- audit record

Legacy Pending must never automatically become Available.

---

# Phase 13: Migration Cutover

Migration must happen employee-by-employee.

After employee migration:

- old wallet becomes read-only
- old withdrawal flow disabled
- old payout-to-wallet flow disabled
- new wallet receives all new earnings
- new wallet handles all new withdrawals

Employees not yet migrated continue using legacy system until migrated.

This makes partial migration safe.

---

# Phase 14: Duplicate Protection

Each wallet transaction must have unique:

```
source_type + source_id + direction
```

Prevent duplicate credits from:

- retry
- repeated API call
- repeated migration
- Employee Payment trigger retry
- Salary trigger retry
- Legacy payout
- new Employee Fund Payment

Migration must also be idempotent.

One employee + currency = one migration.

---

# Phase 15: Immutable Ledger

Wallet ledger entries cannot be edited or deleted.

Mistakes must use:

- correction
- reversal

Example:

Wrong credit:

```
Original:
+৳5,000

Correction:
-৳5,000
```

Original history remains visible.

---

# Phase 16: Reconciliation

Create:

**Finance → Employee Wallets → Reconciliation**

Per employee:

- Opening Balance
- Ledger Credits
- Ledger Debits
- Ledger Balance
- Pending Employee Payments
- Pending Withdrawals
- Total Earned
- Total Withdrawn
- Expected Balance
- Difference

Target:

```
Difference = 0
```

Company-wide:

- Total Wallet Liability
- Total Employee Fund committed
- Total Pending
- Total Available
- Total Withdrawn

---

# Phase 17: Legacy Wallet History

Employee Wallet page should include:

**Legacy Wallet History**

Read-only.

Show:

- old payouts
- old withdrawals
- old wallet balance
- locked amounts
- legacy references

Clearly label:

**Legacy**

Do not mix legacy transactions with new wallet running balance after migration unless they were included in the opening balance.

---

# Phase 18: Security

### Employee

Can see:

- own wallet
- own statement
- own withdrawal requests

Cannot see another employee wallet.

### Finance/Admin/Super Admin

Can see:

- all wallets
- migration
- reconciliation
- adjustments
- withdrawal approval

### Manager

No access unless explicit wallet permission exists.

Enforce both:

- server-side
- RLS/database

---

# Phase 19: Audit Trail

Audit:

- migration
- adjustment
- reversal
- withdrawal request
- withdrawal approval
- withdrawal payment
- legacy pending conversion
- legacy pending cancellation
- manual finance credit/debit

Store:

- action
- employee
- amount
- reason
- performed_by
- timestamp
- source

---

# Phase 20: Testing

Before global cutover, test:

1. Project earning
2. Partial invoice payment
3. Employee Payment committed
4. Employee Payment paid
5. Wallet credit
6. Duplicate trigger retry
7. Salary credit
8. Bonus
9. Commission
10. Withdrawal request
11. Withdrawal approval
12. Withdrawal paid
13. Withdrawal rejected
14. Available balance validation
15. Running balance
16. Legacy migration
17. Migration rerun blocked
18. Mismatch employee blocked
19. Legacy Pending handling
20. Employee permission
21. Admin permission
22. Reconciliation
23. Wallet liability total
24. Employee Fund integration

---

# Final Cutover Rule

Only enable the new Wallet globally when:

- migration completed
- each migrated employee reconciles
- unexplained Difference is zero
- duplicate protection tested
- withdrawals tested
- Employee Fund credit tested
- old wallet is confirmed read-only

Final architecture:

```
OLD WALLET
= Legacy Read Only

NEW WALLET LEDGER
= Active Source of Truth
```