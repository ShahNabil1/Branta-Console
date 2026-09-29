# BRANTA FUND LEDGER

## Complete Additive Finance Management System

Build a new financial allocation and fund management layer called:

# BRANTA FUND LEDGER

This feature will be added on top of the existing Branta Tech Console.

The current production system is already actively used.

The highest priority is:

1. Protect existing data
2. Protect existing workflows
3. Maintain backward compatibility
4. Avoid duplicate financial transactions
5. Maintain complete financial traceability
6. Make all new financial calculations auditable
7. Never silently alter historical financial records

---

# 1. NON-NEGOTIABLE SAFETY RULE

DO NOT rebuild or replace the existing Finance system.

DO NOT delete existing tables.

DO NOT rename existing finance tables or columns unless absolutely unavoidable.

DO NOT modify historical financial data.

DO NOT rewrite old invoice, payout, salary, expense, income or wallet records.

DO NOT break existing:

- Leads
- Customers
- Projects
- Tasks
- Invoices
- Invoice installments
- Invoice stakeholders
- Invoice payouts
- Withdrawal requests
- Expenses
- Income vouchers
- Salary slips
- Company ledger
- Wallet calculations
- Finance reports
- Invoice PDFs
- Expense PDFs
- Income PDFs
- Salary PDFs
- Invoice email system
- Telegram notifications
- Gmail integration
- Google Calendar
- Google Docs
- Existing Google Sheets Lead Sync
- Authentication
- TOTP
- Passkeys
- Roles
- Permissions
- RLS
- Existing database triggers

The new Branta Fund Ledger must be an ADDITIVE layer.

---

# 2. CURRENT CRITICAL FINANCE CHAIN TO PROTECT

The following existing relationships must remain functional:

Invoice  
→ Installments  
→ Stakeholders  
→ Payouts  
→ Withdrawal Requests

Expense  
↔ Invoice Project Cost

Salary Slip  
→ Expense  
→ Existing Payout when applicable

Lead  
→ Customer  
→ Project  
→ Task

Existing Wallet  
→ Received Cash  
→ Ledger  
→ Expenses  
→ Employee Owed Amount

Do not alter these existing relationships unless adding safe references to the new system.

---

# 3. CORE BUSINESS CONCEPT

The system should NOT distribute money based on total invoice value.

The system must distribute only REAL CASH RECEIVED.

Example:

Invoice Total:  
৳100,000

First Installment Paid:  
৳40,000

Only ৳40,000 enters Branta Fund Ledger.

Second Installment Paid:  
৳60,000

The ৳60,000 is processed separately when received.

Every installment/payment must have its own:

- received amount
- deductions
- distributable amount
- allocation version
- fund percentages
- allocated amounts
- ledger records
- audit history

---

# 4. COMPLETE MONEY FLOW

The full financial workflow should be:

Client  
→ Project  
→ Invoice  
→ Installment  
→ Actual Payment Received  
→ Direct Deductions  
→ Company Distributable Amount  
→ Automatic Fund Allocation  
→ Individual Fund Balances  
→ Employee Payments / Expenses / Transfers  
→ Fund Ledger  
→ Reporting  
→ Reconciliation  
→ Google Sheets Reporting

---

# 5. DIRECT DEDUCTIONS

Before Company Fund Allocation, certain direct costs may be deducted.

Support two types of deduction configuration.

## A. Global / Default Deduction Rules

Examples:

- Payment gateway fee
- Bank processing fee
- Merchant fee
- Standard transaction fee

These may be percentage-based or fixed.

Example:

Payment Gateway Fee:  
2.5%

Received:  
৳100,000

Deduction:  
৳2,500

---

## B. Invoice / Installment Specific Deductions

Examples:

- External broker
- Referral commission
- External freelancer
- Model
- Location cost
- Printing
- External production
- Vendor payment
- Client-specific software/API usage
- Other direct external project cost

These do NOT apply to every project.

Finance/Admin must be able to add them manually when required.

Each deduction should store:

- deduction type
- description
- amount type
- fixed / percentage
- value
- calculated amount
- invoice
- installment
- project
- created by
- created at
- notes

---

# 6. IMPORTANT EMPLOYEE RULE

Internal employee payments are NOT direct deductions.

Employee compensation comes from the Employee Fund.

This applies to:

- project-based employee payments
- monthly salary
- bonus
- incentive
- internal commission
- overtime
- performance reward

External freelancers or vendors may remain direct project deductions if they are not part of the internal employee structure.

---

# 7. COMPANY DISTRIBUTABLE AMOUNT

Formula:

# Company Distributable Amount

Actual Cash Received  
− Direct Deductions

Example:

Received:  
৳100,000

Gateway Fee:  
৳2,500

External Broker:  
৳5,000

External Production:  
৳2,500

Company Distributable Amount:

৳90,000

This ৳90,000 becomes the base for Fund Allocation.

---

# 8. DEFAULT FUND ALLOCATION

Create these 9 default funds.


| Fund                         | Default Allocation |
| ---------------------------- | ------------------ |
| Employee Fund                | 35%                |
| Office & Operations Fund     | 10%                |
| Software & Subscription Fund | 8%                 |
| Sales Fund                   | 8%                 |
| Marketing Fund               | 7%                 |
| Tax & Compliance Fund        | 5%                 |
| Emergency Reserve Fund       | 7%                 |
| Growth & Equipment Fund      | 5%                 |
| Company Profit Fund          | 15%                |


TOTAL:

100%

These percentages must NOT be permanently hardcoded.

They must be configurable.

---

# 9. FUND PURPOSES

## Employee Fund

Used for:

- Project payment
- Salary
- Bonus
- Incentive
- Commission
- Overtime
- Adjustment
- Performance reward

---

## Office & Operations Fund

Used for:

- Office rent
- Internet / Wi-Fi
- Electricity
- Water
- Cleaning
- Tea / refreshments
- Office supplies
- Printing
- Furniture maintenance
- General office administration
- Small repairs

Internet and electricity are expense subcategories.

They should NOT become separate top-level funds by default.

---

## Software & Subscription Fund

Used for:

- ChatGPT
- Gemini
- Adobe Creative Cloud
- ElevenLabs
- Suno
- Google Workspace
- Hosting
- Domain
- Cloud storage
- AI tools
- API credits
- CRM tools
- Automation software
- Other SaaS subscriptions

---

## Sales Fund

Used for internal sales operations:

- Sales team payments
- Sales incentives
- Calling costs
- Sales tools
- Client meetings
- Client visits
- Travel
- Proposal expenses
- Sales operations

External broker payments remain separate direct deductions when applicable.

---

## Marketing Fund

Used for:

- Facebook Ads
- Instagram Ads
- Boosting
- Lead generation
- Promotional content
- Brand campaigns
- Portfolio campaigns
- Branta Tech marketing videos
- Website promotion
- Personal branding campaigns
- Marketing production costs

---

## Tax & Compliance Fund

Used for:

- Tax
- VAT
- Accounting
- Legal expenses
- Trade license
- Government fees
- Compliance
- Professional fees

---

## Emergency Reserve Fund

Used only for exceptional situations:

- Revenue shortage
- Emergency employee payment
- Office cash shortage
- Unexpected operating expenses
- Business continuity emergencies

This fund should normally remain untouched.

---

## Growth & Equipment Fund

Used for:

- Laptop
- Desktop
- GPU
- Camera
- Light
- Microphone
- Hard drive
- Workstation
- Furniture
- Office expansion
- Training
- New service investment
- Business expansion

---

## Company Profit Fund

This represents retained company profit.

Do NOT treat it as a normal operating fund.

Money can leave the Profit Fund only through:

- Owner / Director Withdrawal
- Explicit approved inter-fund transfer
- Exceptional approved transaction requiring a reason

Normal expense forms should not automatically allow Profit Fund selection.

---

# 10. ALLOCATION VERSIONING

Create Allocation Versions.

Example:

Version:  
September 2026

Effective From:  
2026-09-01

Employee:  
35%

Office:  
10%

Subscription:  
8%

...

Then later:

October 2026

Employee:  
40%

Office:  
8%

...

Changing current allocation rules must NEVER recalculate past allocations.

Every installment allocation must store a complete snapshot of:

- version id
- fund id
- fund name
- percentage
- allocated amount

Historical values must remain unchanged forever.

---

# 11. FUND SETTINGS

Create:

Finance  
→ Fund Settings

Accessible only to:

- Super Admin
- Admin
- Finance

Features:

- Create custom fund
- Rename fund
- Add description
- Change display order
- Activate fund
- Deactivate fund
- Change future allocation percentage
- Create new allocation version

Validation:

Active fund percentages must equal exactly:

100%

If total is not 100%, do not allow saving.

Show:

Current Total:  
XX%

---

# 12. FUND BALANCE ARCHITECTURE

Never store an editable balance.

Fund balance must always be derived from Fund Ledger transactions.

Core formula:

# Ledger Balance

Total Credits  
− Total Debits

# Committed Amount

Approved / committed but unpaid obligations

# Available Balance

Ledger Balance  
− Committed Amount

Display separately:

- Ledger Balance
- Total Allocated
- Total Spent
- Committed
- Borrowed
- Lent
- Available

Avoid all forms of double counting.

---

# 13. FUND LEDGER

Create an append-only financial ledger.

Possible transaction types:

- allocation
- expense
- employee_payment
- salary_payment
- bonus
- incentive
- commission
- overtime
- adjustment
- transfer_in
- transfer_out
- loan_in
- loan_out
- loan_repayment
- refund
- owner_withdrawal
- reversal
- correction

Each ledger row should contain:

- id
- fund_id
- amount
- direction: credit / debit
- transaction_type
- customer_id
- project_id
- invoice_id
- installment_id
- employee_id
- salary_slip_id
- invoice_payout_id
- expense_id
- transfer_id
- loan_id
- reference
- description
- notes
- created_by
- created_at

Fund Ledger rows must not be hard deleted.

Prefer no normal UPDATE permission.

Financial corrections should use reversal/correction records.

---

# 14. AUTOMATIC ALLOCATION

When an invoice installment changes to PAID:

Automatically call:

allocate_installment(installment_id)

The function should:

1. Check whether allocation already exists
2. Read actual paid amount
3. Load applicable deduction rules
4. Calculate deductions
5. Calculate distributable amount
6. Determine active allocation version
7. Calculate fund allocations
8. Save allocation snapshot
9. Insert Fund Ledger credits
10. Write audit record
11. Mark allocation success

---

# 15. IDEMPOTENCY

Critical requirement.

Repeated events must NOT create duplicate allocation.

Possible causes:

- webhook retry
- page refresh
- server retry
- trigger retry
- repeated status update

Use:

- idempotency keys
- unique active allocation enforcement
- transaction boundaries
- database constraints

There must never be two active allocations for the same financial event.

---

# 16. ALLOCATION REVERSAL AND CORRECTION

Do not use a design where financial mistakes can only be fixed by overwriting history.

Allow allocation reversal.

Possible fields:

- status
- active
- reversed_at
- reversed_by
- reversal_reason
- replaces_allocation_id

When reversed:

Do not edit original Fund Ledger entries.

Create matching reversal entries.

Then optionally create a new corrected allocation.

Historical financial trail must remain visible.

There must be only one active allocation per installment.

---

# 17. ALLOCATION PREVIEW

Manual allocation and historical allocation should show a preview.

Show:

Payment Received  
Direct Deductions  
Distributable Amount  
Allocation Version

Then:

Fund  
Percentage  
Amount

Require confirmation.

Automatic standard allocations can run without manual confirmation.

---

# 18. ALLOCATION FAILURE

If Fund Allocation fails:

DO NOT block the original client payment.

The existing installment payment must remain valid.

Instead:

Create:

Allocation Required

status.

Finance Dashboard must display:

Unallocated Paid Installments: X

Clicking opens:

- Invoice
- Installment
- Client
- Received Amount
- Error
- Retry button

Retry must be idempotent.

---

# 19. EMPLOYEE FUND PAYMENT SYSTEM

Create Employee Fund Payments.

Supported types:

- Project Payment
- Salary
- Bonus
- Incentive
- Commission
- Overtime
- Adjustment

---

# 20. PROJECT-BASED EMPLOYEE PAYMENT

When paying based on project:

Select:

- Employee
- Project
- Invoice, optional
- Task / work reference, optional
- Amount
- Description
- Payment status
- Payment method
- Transaction reference
- Notes

Example:

Project:  
Gentle Park AI Commercial

Employee Fund Balance:  
৳100,000

Nasrin:  
৳8,000

Ridwan:  
৳6,000

Nabil:  
৳5,000

Total:  
৳19,000

Employee Fund decreases by:

৳19,000

---

# 21. EMPLOYEE PAYMENT STATUS

Use workflow:

Draft  
→ Approved  
→ Committed  
→ Paid

Also:

Cancelled

Rules:

Draft:  
does not affect balance.

Approved / Committed:  
reduces Available Balance through committed amount.

Paid:  
creates Fund Ledger debit.

Cancelled:  
removes commitment if not paid.

A paid financial transaction should not simply be deleted.

Use reversal if correction is required.

---

# 22. EMPLOYEE FUND COMMITTED BALANCE

Example:

Employee Fund Ledger Balance:  
৳50,000

Committed Employee Payments:

Nasrin:  
৳10,000

Nabil:  
৳15,000

Committed:  
৳25,000

Available:

৳25,000

Dashboard should clearly display:

Balance  
Committed  
Available

---

# 23. SALARY COMPATIBILITY

Do NOT remove the existing salary_slips system.

Employee Fund should support linking to:

Existing Salary Slip

If Salary Slip is paid using Employee Fund:

Employee Fund  
→ Existing Salary Slip  
→ Existing Expense  
→ Existing Payout when applicable

Do not create duplicate salary records.

Historical salary records remain untouched.

---

# 24. EXISTING PAYOUT COMPATIBILITY

The existing system already has:

invoice_stakeholders  
invoice_payouts

Do not replace them.

Before creating an Employee Fund project payment, check whether an existing invoice payout already represents the same employee compensation.

Prevent duplicate payment.

Employee Fund Payment may LINK to existing invoice_payout.

Use unique constraints when linking:

- invoice_payout_id
- salary_slip_id

If an existing payout is already linked, do not allow another active Employee Fund Payment for it.

---

# 25. DUPLICATE COMPENSATION DETECTION

Do more than simple ID duplication.

When possible, warn if:

Same employee  
+  
Same project  
+  
Same invoice  
+  
Same payment purpose  
+  
same or similar amount

already exists.

Finance user should clearly see:

Potential Duplicate Payment

Hard-block exact duplicate links.

Use warnings for suspicious but non-identical duplicates.

---

# 26. EXPENSE INTEGRATION

Keep the existing Expense system.

Add:

[expenses.fund](http://expenses.fund)_id

as a nullable additive field.

Existing expenses remain valid with null fund_id.

For new expenses:

Select:

- Expense Category
- Amount
- Paying Fund

Example:

Expense:  
Internet Bill

Amount:  
৳5,000

Fund:  
Office & Operations

Then create Fund Ledger debit.

---

# 27. INSUFFICIENT FUND RULE

If Available Balance is lower than required expense:

Do not silently allow it.

Show:

Insufficient Fund Balance

Required:  
৳30,000

Available:  
৳20,000

Shortfall:  
৳10,000

Actions:

1. Transfer From Another Fund
2. Borrow From Another Fund
3. Cancel

Do not automatically move money.

---

# 28. INTER-FUND TRANSFER

Support permanent transfers.

Example:

Emergency Reserve  
→ Office Fund  
৳10,000

Fund Ledger:

Reserve:  
-৳10,000 transfer_out

Office:  
+৳10,000 transfer_in

Transfer record must include:

- from fund
- to fund
- amount
- reason
- date
- created by
- linked expense, optional
- notes

Transfers require Finance/Admin authorization.

---

# 29. INTER-FUND LOAN

Support temporary borrowing.

Example:

Office needs:  
৳10,000

Reserve lends:  
৳10,000

Create loan record:

From Fund:  
Emergency Reserve

To Fund:  
Office

Principal:  
৳10,000

Repaid:  
৳0

Outstanding:  
৳10,000

Status:  
open

Possible status:

- open
- partially_repaid
- repaid
- cancelled

---

# 30. LOAN DISPLAY

Fund Dashboard should show:

Office Fund:

Borrowed:  
৳10,000

Reserve Fund:

Lent:  
৳10,000

Do not double-count loan values in Fund Balance.

Ledger movements determine cash balance.

Loan records track receivable/liability separately.

---

# 31. LOAN REPAYMENT

Allow:

Partial Repayment

and:

Full Repayment

Example:

Office repays Reserve:  
৳4,000

Office ledger:  
-৳4,000

Reserve ledger:  
+৳4,000

Loan:

Principal:  
৳10,000

Repaid:  
৳4,000

Outstanding:  
৳6,000

Status:  
partially_repaid

---

# 32. OWNER / DIRECTOR WITHDRAWAL

Profit Fund should support:

Owner / Director Withdrawal

Fields:

- Amount
- Owner / Director
- Date
- Payment method
- Transaction reference
- Reason
- Notes
- Approved by

Create Profit Fund ledger debit.

Do not mix owner withdrawal with Office Expense.

---

# 33. PROJECT PROFITABILITY

Build a new Project Finance / Profitability view.

Do not replace existing client_project_finance.

Show:

- Project Value
- Total Invoiced
- Total Collected
- Outstanding
- Direct Deductions
- Company Distributable Amount
- Employee Fund Allocation
- Actual Employee Payments
- Employee Committed
- Other Fund Allocations
- Project-Specific Expenses
- Net Company Contribution

---

# 34. EMPLOYEE FUND PROJECT SURPLUS / DEFICIT

Example:

Employee Fund Allocation From Project:  
৳31,500

Actual Employee Payment:  
৳23,000

Project Employee Fund Surplus:  
৳8,500

The surplus remains in the global Employee Fund.

Do NOT create isolated Employee wallets per project.

If:

Actual Employee Cost:  
৳35,000

Allocation:  
৳31,500

Show:

Employee Fund Project Deficit:  
৳3,500

The global Employee Fund covers the difference.

---

# 35. INVOICE FINANCE ALLOCATION SECTION

Inside existing Invoice Detail add:

Finance Allocation

For each paid installment display:

Received Amount  
Direct Deductions  
Distributable Amount  
Allocation Version

Then:

Employee Fund  
Office Fund  
Subscription Fund  
Sales Fund  
Marketing Fund  
Tax Fund  
Reserve Fund  
Growth Fund  
Profit Fund

Show both:

Percentage  
Amount

Historical values remain immutable.

---

# 36. FUND DETAIL PAGE

Create:

Finance  
→ Fund Ledger  
→ Fund Detail

Each Fund page shows:

Current Ledger Balance  
Total Allocated  
Total Spent  
Committed  
Borrowed  
Lent  
Available

---

# 37. FUND MONEY-IN TABLE

Show where the Fund received money from.

Columns:

- Date
- Client
- Project
- Invoice
- Installment
- Allocation Version
- Percentage
- Amount

---

# 38. FUND MONEY-OUT TABLE

Show:

- Date
- Expense / Employee
- Project
- Category
- Transaction Type
- Reference
- Amount

---

# 39. FUND TRANSFER AND LOAN HISTORY

Fund detail must also show:

Transfers In  
Transfers Out  
Loans Received  
Loans Given  
Loan Repayments  
Manual Adjustments  
Reversals

---

# 40. FUND LEDGER DASHBOARD

Create:

Finance  
→ Fund Ledger

Overview cards:

- Total Invoiced
- Total Collected
- Total Outstanding
- Total Direct Deductions
- Total Distributable Income
- Total Allocated
- Total Employee Payments
- Total Operating Expenses
- Total Fund Balance
- Total Available Balance
- Total Committed
- Total Borrowed
- Total Lent
- Profit Fund Balance
- Unallocated Paid Installments

---

# 41. FUND CARDS

Each Fund card shows:

Fund Name

Ledger Balance

Allocated

Spent

Committed

Borrowed

Lent

Available

Click Fund to open full Fund Detail page.

---

# 42. DISTRIBUTION ANALYTICS

Create analytics for:

- Fund allocation distribution
- Actual spending by fund
- Remaining balance
- Monthly fund growth
- Fund allocation by project
- Fund allocation by client
- Employee Fund allocation
- Employee actual cost
- Office cost
- Sales cost
- Marketing cost
- Subscription cost
- Tax reserve
- Emergency reserve
- Profit retained

Filters:

- This Month
- Last Month
- Custom
- All Time

---

# 43. FINANCE RECONCILIATION

Create:

Finance  
→ Reconciliation

Show:

Real Company Cash

Fund Ledger Balance

Committed Employee Payments

Inter-Fund Loan Receivables

Inter-Fund Loan Liabilities

Unallocated Eligible Cash

Legacy Cash

Difference

If difference is not zero:

Show a warning.

Do not automatically correct discrepancies.

---

# 44. REAL CASH VS ACCOUNTING FUNDS

Clearly separate:

REAL COMPANY CASH

from:

ACCOUNTING FUND ALLOCATION

Fund values are accounting allocations of company money.

They are not necessarily separate physical bank accounts.

Add explanatory UI where appropriate.

---

# 45. LEGACY DATA

Existing payments before Branta Fund Ledger deployment should NOT automatically be allocated.

Mark them:

Legacy / Not Allocated

Existing data remains untouched.

---

# 46. HISTORICAL ALLOCATION

Finance/Admin can optionally run:

Generate Historical Allocation

Before creating records:

Show Preview.

Include:

Payment  
Date  
Deductions  
Distributable  
Allocation Version  
Fund Amounts

Only after confirmation create new Fund Ledger records.

Do not alter original Invoice / Installment records.

---

# 47. GOOGLE SHEETS FINANCE EXPORT

Existing Leads Google Sheets integration must remain untouched.

Create separate Finance Google Sheets integration.

Direction:

Branta Console  
→ Google Sheets

One-way reporting only.

Google Sheets must not modify financial data in Console.

---

# 48. GOOGLE SHEETS TABS

Suggested tabs:

1. Finance Summary
2. Fund Balances
3. Fund Ledger
4. Invoice Allocation
5. Employee Payments
6. Expenses
7. Fund Transfers
8. Fund Loans
9. Project Profitability
10. Monthly Report

---

# 49. SHEETS SECURITY

Do not expose:

- service keys
- secrets
- Supabase service role
- Google credentials

in frontend/client code.

Use secure server-side integration.

---

# 50. ACCESS CONTROL

Branta Fund Ledger must be visible only to:

- Super Admin
- Admin
- Finance

Manager and normal User get no access unless future permissions explicitly allow it.

---

# 51. NEW PERMISSIONS

Suggested:

- fund_view
- fund_manage
- fund_allocate
- fund_employee_payment
- fund_transfer
- fund_borrow
- fund_adjust
- fund_settings
- fund_reports
- fund_historical_allocate
- fund_owner_withdrawal

Enforce permissions server-side and with RLS.

Frontend hiding alone is not sufficient.

---

# 52. AUDIT LOG

Every sensitive financial action must create audit history.

Record:

- user
- action
- timestamp
- record type
- record id
- previous value
- new value
- reason
- IP/session context if already available

Actions requiring reason:

- manual adjustment
- reversal
- correction
- historical allocation
- transfer
- loan
- loan cancellation
- allocation percentage change
- owner withdrawal
- exceptional Profit Fund spending

---

# 53. NO HARD DELETE

Financial data should not be hard deleted through normal UI.

Use:

- reversal
- void
- correction transaction
- cancellation before payment where appropriate

Preserve historical trail.

---

# 54. SUGGESTED NEW TABLES

Create additive tables such as:

finance_funds

fund_allocation_versions

fund_allocation_version_items

fund_deduction_rules

installment_allocations

installment_allocation_deductions

installment_allocation_items

fund_ledger

fund_transfers

fund_loans

fund_loan_repayments

employee_fund_payments

fund_audit_logs

Optional:

fund_commitments

if commitments should be separated from employee payments.

---

# 55. INSTALLMENT ALLOCATION UNIQUENESS

Do NOT use a simplistic design where installment_id can never have another historical allocation.

An installment can have multiple historical allocation records due to correction/reversal.

But only one ACTIVE allocation may exist.

Use a safe partial unique constraint or equivalent logic.

Example concept:

Only one record where:

installment_id = X  
AND status = active

Historical reversed allocations remain stored.

---

# 56. EXISTING EXPENSE TABLE

Safely add:

[expenses.fund](http://expenses.fund)_id

nullable.

Existing expenses must remain valid.

Do not backfill unless explicitly requested.

---

# 57. FUND BALANCE VIEW

Create derived view:

fund_balances

Possible fields:

- fund_id
- total_credits
- total_debits
- ledger_balance
- committed
- available
- borrowed
- lent
- allocation_total
- expense_total

Do not use editable balance columns.

---

# 58. SERVER FUNCTIONS

Suggested server/business functions:

allocate_installment(id)

reverse_installment_allocation(id, reason)

create_fund_expense(...)

create_employee_fund_payment(...)

commit_employee_payment(...)

pay_employee_fund_payment(...)

create_fund_transfer(...)

create_fund_loan(...)

repay_fund_loan(...)

create_owner_withdrawal(...)

generate_historical_allocation(...)

reconcile_fund_ledger(...)

All sensitive actions require authenticated user and permission checks.

---

# 59. DATABASE TRIGGER

When invoice_installments status becomes:

paid

attempt automatic allocation.

If allocation fails:

- do not block payment
- log error
- mark Allocation Required
- surface on dashboard

Do not silently ignore failures.

---

# 60. TRANSACTION SAFETY

All financial functions should use database transactions.

For example:

Fund Transfer must either:

1. create transfer record
2. debit source
3. credit destination
4. write audit record

ALL succeed

or

ALL fail.

Never allow half-completed financial operations.

---

# 61. RLS

Every new table must use RLS.

Use existing finance access helpers such as:

is_finance_admin(auth.uid())

where appropriate.

Do not weaken existing RLS.

---

# 62. UI STYLE

Use the existing Branta Console design system.

Do not redesign the entire application.

Reuse existing:

- typography
- cards
- tables
- badges
- spacing
- forms
- modal patterns
- filters
- mobile layout

Must work on:

- Desktop
- Tablet
- Mobile

Use consistent BDT money formatting.

---

# 63. ROUTES

Suggested routes:

/app/finance/funds

/app/finance/funds/$code

/app/finance/fund-settings

/app/finance/reconciliation

/app/finance/fund-transfers

/app/finance/fund-loans

/app/finance/employee-payments

Keep routing aligned with the existing app's route structure.

---

# 64. DELIVERY PHASES

Implement in safe phases.

## PHASE 1: CORE LEDGER

Build:

- finance_funds
- allocation versions
- allocation version items
- deduction rules
- installment allocation
- allocation snapshots
- fund ledger
- automatic paid-installment allocation
- idempotency
- reversal architecture
- Fund Ledger Dashboard
- Fund Settings
- Invoice Finance Allocation section
- Unallocated Payment alert

Phase 1 must be independently usable.

---

## PHASE 2: SPENDING

Build:

- Expense Paying Fund
- Insufficient Balance checks
- Employee Fund payments
- Committed employee amounts
- Salary linking
- Existing payout linking
- Duplicate compensation protection
- Inter-Fund Transfer
- Inter-Fund Loan
- Loan repayment
- Profit Fund withdrawal

---

## PHASE 3: INSIGHT

Build:

- Fund Detail
- Project Profitability
- Distribution Analytics
- Employee Fund surplus/deficit
- Reconciliation
- Financial warnings
- Detailed filters

---

## PHASE 4: LEGACY & SHEETS

Build:

- Legacy payment status
- Manual historical allocation
- Allocation Preview
- One-way Finance Google Sheets export

Do not modify existing Leads Sheets sync.

---

# 65. TEST CASES

Before completion test:

1. New full invoice payment
2. Partial payment
3. Multiple installments
4. Gateway fee
5. External broker deduction
6. External project cost
7. Correct 100% fund distribution
8. Allocation version change
9. Historical allocation remains unchanged
10. Duplicate installment event
11. Allocation failure
12. Allocation retry
13. Allocation reversal
14. Corrected reallocation
15. Employee project payment
16. Employee commitment
17. Employee cancellation
18. Employee final payment
19. Existing stakeholder payout linking
20. Duplicate employee compensation prevention
21. Salary slip linking
22. Office expense
23. Subscription expense
24. Insufficient fund
25. Fund transfer
26. Fund loan
27. Partial loan repayment
28. Full loan repayment
29. Profit Fund protection
30. Owner withdrawal
31. Project profitability
32. Reconciliation
33. Legacy invoice
34. Historical allocation
35. Role restrictions
36. RLS
37. Mobile UI
38. Existing Wallet
39. Existing invoice PDFs
40. Existing expense PDFs
41. Existing salary PDFs
42. Existing withdrawal workflow
43. Existing notification flow
44. Existing Leads Google Sheets sync

---

# 66. MIGRATION SAFETY

Before executing Phase 1:

Inspect:

- current schema
- all finance foreign keys
- invoice triggers
- payout triggers
- salary triggers
- expense triggers
- wallet formulas
- RLS
- functions
- constraints
- indexes

All migrations must be additive.

No destructive migration.

All backfills must be idempotent.

Use safe production migrations.

---

# 67. BACKUP SAFETY

Before production database changes:

Ensure current production schema and important finance data are backed up according to the project's existing deployment process.

Do not rely on an unverified destructive migration rollback.

---

# 68. FINAL DELIVERY REPORT

After each phase provide:

1. Tables created
2. Columns added
3. Functions added
4. Triggers added
5. RLS policies added
6. Indexes / constraints added
7. Existing files changed
8. New pages/components
9. Business logic added
10. Existing functionality preserved
11. Tests performed
12. Test results
13. Migration safety notes
14. Known limitations
15. Remaining work

---

# 69. MOST IMPORTANT ACCOUNTING PRINCIPLES

Always preserve these rules:

## Rule 1

Only received cash is allocated.

## Rule 2

Direct deductions happen before Fund Allocation.

## Rule 3

Internal employees are paid from Employee Fund.

## Rule 4

Employee Fund supports both project-based and salary-based models.

## Rule 5

Allocation percentages are versioned.

## Rule 6

Past allocations never change when future percentages change.

## Rule 7

Fund balances cannot be manually overwritten.

## Rule 8

Every financial movement creates a traceable ledger record.

## Rule 9

Insufficient funds cannot be silently ignored.

## Rule 10

Transfers and loans are different.

## Rule 11

Committed employee money is not freely available.

## Rule 12

Existing stakeholder payouts cannot be duplicated.

## Rule 13

Financial corrections use reversal/correction, not deletion.

## Rule 14

Profit Fund has stronger withdrawal restrictions.

## Rule 15

Automatic allocation failures must be visible.

## Rule 16

Existing production finance functionality must remain unchanged.

---

# 70. FINAL EXPECTED FINANCIAL FLOW

The completed system should behave like this:

Client Payment Received  
↓  
Invoice Installment Paid  
↓  
Direct Deductions  
↓  
Company Distributable Amount  
↓  
Allocation Version Selected  
↓  
Automatic Fund Distribution

Employee Fund  
Office Fund  
Subscription Fund  
Sales Fund  
Marketing Fund  
Tax Fund  
Reserve Fund  
Growth Fund  
Profit Fund

Then:

Employee Fund  
→ Project Payment / Salary / Bonus / Incentive

Office Fund  
→ Rent / Internet / Electricity / Office Costs

Subscription Fund  
→ Software / AI Tools / SaaS

Sales Fund  
→ Sales Team / Sales Operations

Marketing Fund  
→ Advertising / Promotion

Tax Fund  
→ Tax / Compliance

Reserve  
→ Emergency Use

Growth Fund  
→ Equipment / Expansion

Profit Fund  
→ Retained Profit / Director Withdrawal

Every amount must remain traceable from:

Client  
→ Project  
→ Invoice  
→ Installment  
→ Allocation  
→ Fund  
→ Expense / Employee / Transfer / Loan / Withdrawal

That full money trail is the core requirement of Branta Fund Ledger.

Build this as a safe, production-ready financial layer on top of the existing Branta Tech Console without breaking historical data or existing business workflows.