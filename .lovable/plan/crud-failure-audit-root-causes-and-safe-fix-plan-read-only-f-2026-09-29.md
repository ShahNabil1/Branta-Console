# CRUD failure audit — root causes and safe-fix plan (read-only findings)

## 1. Root causes (confirmed against the live database and code)

### Error A: `leads_slug_key` on Lead create and on Customer create
- Lead codes come from the trigger `assign_lead_slug` (BEFORE INSERT on `leads`). It picks the "lowest free number" and formats it with `lpad(n::text, 2, '0')`.
- The database holds exactly 99 leads, BTL-01 to BTL-99, with no gaps. The next number is 100, and `lpad('100', 2)` **cuts it down to `'10'`**. That produces `BTL-10`, which already exists, so every insert now fails.
- This is a count-based time bomb, not a concurrency race. The app never sets `slug` itself.
- The logic also has two secondary flaws:
  - The lowest-free-number reuse means that after a delete, a new lead takes an old lead's code.
  - Two inserts running at the same time can read the same gap, because the trigger reads the table and does not lock anything.
- **Why Customer create fails:** `createCustomer` (src/lib/customers.functions.ts, lines 153–191) first inserts a row into `leads`. It then sets `status = 'converted'`, and the trigger `convert_lead_to_customer` creates the customer. So every Customer create goes through the broken lead-code trigger.
- **When it started:** before Fund Ledger. It surfaced now only because the lead count reached 100.

### Same formatting bug in other code generators (not failing yet)
| Trigger | Format | Breaks at | Current |
|---|---|---|---|
| `assign_invoice_slug` (sequence) | `lpad(n,2)` | BT-100 → becomes "BT-10" | sequence at 20 |
| `assign_expense_voucher_no` | `lpad(n,3)` | 1000th voucher | — |
| `assign_income_voucher_no` | `lpad(n,3)` | 1000th | — |
| `assign_salary_slip_no` | `lpad(n,3)` | 1000th | — |

### Error B: `installment_allocations_installment_id_fkey` on BT-13
- `installment_allocations.installment_id` points to `invoice_installments` with **ON DELETE RESTRICT**. This was added by Fund Ledger Phase 1 on purpose, to keep allocation history.
- `invoice_installments.invoice_id` points to `invoices` with **ON DELETE CASCADE**, which is older.
- So **Invoice delete** (`deleteInvoice`, which hard-deletes the `invoices` row) cascades to the installments and hits RESTRICT. That is the error on the screen.
- **Invoice edit** (`updateInvoice`) deletes and recreates every installment, payout, stakeholder and cost row. It is guarded only by "no paid installment". Any installment with an allocation row that is no longer paid will fail with the same error.
- **Installment revert** (`revertInstallment`) only runs an UPDATE on status. That does not trip the foreign key. But it **does not reverse the Fund Ledger allocation**, so the 9 funds stay credited for money that was un-received.
  - The live data already shows **1 active allocation on an installment that is not paid**. That is accounting drift, and it will also block editing that invoice.
- A mitigation was added this session: `deleteInvoice` now refuses invoices that have allocations and shows a friendly message. That is a patch, not the architecture fix.
- **When it started:** introduced by the Fund Ledger layer, on top of the older delete-and-recreate edit and hard-delete invoice design.

### Employee delete
- `deleteEmployee` calls `auth.admin.deleteUser`. That runs through foreign keys to `auth.users`:
  - **Blocking (RESTRICT / NO ACTION):** `invoice_stakeholders.user_id`, `invoice_payouts.user_id`, `expenses.requested_by`. Any employee who was ever a stakeholder or requested an expense cannot be deleted, and Postgres shows its raw error.
  - **Silently destroying history (CASCADE):** `profiles`, `user_roles`, `user_permissions`, `profile_social_links`, `withdrawal_requests`. Wallet withdrawal history would be erased.
  - `employee_fund_payments.employee_id` and `salary_slips` people columns have **no foreign key**. They would be left pointing at a person who no longer exists.
- The external Supabase project reports that no service-role key is stored. The privileged delete call may also fail for that reason.
- **When it started:** before Fund Ledger. Fund Ledger added more records that point to employees without a foreign key.

### Other destructive paths
- **Customer delete:** blocked by `invoices` (RESTRICT, which is good). It CASCADE-deletes projects, tasks, task events and project activity, which loses history.
- **Invoice delete of a legacy invoice:** CASCADE-deletes `invoice_payouts`, including paid or requested ones. Wallet history would be lost.
- **Allocation children:** items and deductions are RESTRICT, `fund_ledger` is NO ACTION, and `employee_fund_payments` is NO ACTION. These are correct and should stay.
- **Lead delete:** CASCADEs contacts, activities and emails. There is a Recycle Bin flow; it needs checking to confirm it is a soft delete.

### Error display
- The server functions pass raw Postgres errors straight through (`throw new Error(error.message)`): 44 places in finance.functions.ts, 20 in leads, 14 in employee-detail, 12 in salary, 9 in client-tasks.
- The pages then show them with `toast.error((e as Error).message)`.
- There is no mapping layer for the codes 23505 (duplicate), 23503 (still referenced) or 42501 (no permission).

## 2. Dependency map for destructive actions

```text
Delete invoice ──CASCADE──> installments ──RESTRICT──> installment_allocations ──> fund_ledger / items / deductions / employee_fund_payments
              ──CASCADE──> invoice_payouts (legacy wallet history lost)
Edit invoice  ──delete+recreate installments──> same RESTRICT
Revert installment ──UPDATE only──> allocation stays active (funds overstated)
Delete employee (auth user) ──RESTRICT──> invoice_stakeholders, invoice_payouts, expenses.requested_by
                            ──CASCADE──> profiles, roles, permissions, withdrawal_requests
                            ──no FK──> employee_fund_payments, salary_slips (orphans)
Delete customer ──RESTRICT──> invoices ; CASCADE──> projects, tasks, events
Create customer ──inserts lead──> assign_lead_slug (broken at 100)
```

## 3. Recommended safe-fix architecture

1. **Codes:** use a dedicated sequence for every generator, with `nextval` only. No reuse of gaps and no reads of the table. Format with `lpad(n, 2)` below 100 and the plain number from 100 up, so codes never get cut short. Existing codes stay unchanged.
2. **Invoices:** replace hard delete with **Void / Archive**. Existing `void` status plus `archived_at`.
   - A hard delete stays possible only for invoices with no paid installment, no allocation, no payout and no linked expense or income.
3. **Invoice edit:** update installments in place, matched by ID. Never delete a row that has payments, allocations or payouts.
   - Allow structural edits only on unpaid, unallocated installments.
4. **Installment revert:** in one database transaction, reverse the active allocation (the existing reversal RPC), then set the installment back to pending.
   - Block the revert if the employee payments linked to that allocation are Committed or Paid; they must be cancelled first.
5. **Employees:** replace `deleteUser` with **Deactivate**. Set `profiles.status = inactive`, remove roles and sessions, ban the auth user, and keep all history.
   - Hard delete only for an account that has no references (checked in a pre-flight query).
6. **Customers:** Archive instead of delete, and never cascade projects.
7. **Friendly errors:** one shared server-side helper maps 23505, 23503, 42501 and P0001 to plain-language messages. All server functions throw through it.

## 4. Migration changes required
- Fix the lead code generator: create `lead_slug_seq` set to max(number), switch `assign_lead_slug` to `nextval`, and use format-safe padding.
- Apply the same padding fix to the invoice, expense, income and salary code generators.
- Add `archived_at` and `archived_by` to `invoices` and `customers`. Add a `status`/`deactivated_at` column on `profiles` if it does not already exist.
- New RPC `revert_installment_payment(installment_id, reason)`, which reverses the allocation and resets the status atomically.
- New RPC `archive_invoice(id, reason)`, plus a pre-flight function `invoice_delete_blockers(id)`.
- New RPC `deactivate_employee(user_id, reason)`, plus a pre-flight function `employee_delete_blockers(user_id)`.
- Leave every existing foreign key unchanged. Use no new CASCADE.

## 5. App / server changes required
- src/lib/finance.functions.ts: rewrite `deleteInvoice` to archive or void; rewrite `updateInvoice` to change installments in place; make `revertInstallment` call the new RPC.
- src/lib/employees.functions.ts: `deleteEmployee` becomes Deactivate with a blocker list.
- src/lib/customers.functions.ts: archive instead of delete.
- New file src/lib/db-errors.ts, the shared error mapper, applied across all `*.functions.ts` files.
- UI: rename Delete to Void/Archive where needed, add confirmation dialogs with a required reason, and show the blocker lists.

## 6. Data repair / backfill
- Set the sequences to the current maximum numbers: leads 99, invoices 20 (already correct).
- **1 active allocation on an unpaid installment:** identify it, then have Finance run a reversal with a reason. No silent edit.
- No existing codes are renamed and no rows are deleted.

## 7. Risks
- Changing edit to in-place updates affects legacy stakeholder payout syncing. Legacy invoices must keep their current behaviour.
- Reversing an allocation when revert is pressed can fail if the Employee Fund money is already committed or paid. That case must be blocked with a clear message.
- Deactivating an employee must not break login gating, the mail queue, or ownership of their leads and tasks. Lead reassignment may be needed.
- The service-role key is missing on the external Supabase project. Any auth-admin action (ban or delete) needs that key re-linked.

## 8. Regression test matrix

| Area | Create | Edit | Delete / Archive | Revert / Recover |
|---|---|---|---|---|
| Leads | #100, #101 created; concurrent create | field edit, status change | recycle bin | recover keeps code |
| Customers | create (goes through a lead) | edit | archive; blocked if invoices exist | — |
| Lead to Customer | convert creates 1 customer, idempotent | — | — | — |
| Employees | create | edit | deactivate; hard delete blocked if referenced | reactivate |
| Projects | create | edit finance (finance user only) | archive only | — |
| Invoices | create BT-21 to BT-100+ | edit unpaid; blocked on allocated | void/archive; hard delete only when clean | — |
| Installments | add | edit unpaid | remove unpaid only | revert reverses allocation; blocked if payments committed |
| Expenses | atomic create + fund debit | edit with reason | recycle bin | recover restores fund debit |
| Salary | slip create | edit | cancel | — |
| Fund Ledger | auto allocate on paid | correction | never deleted | reversal, then re-allocate; balances reconcile |
| Errors | duplicate, still-referenced and permission errors show friendly text | | | |

After approval, implementation starts with the lead/customer code fix, because those two workflows are fully blocked right now. Then installment revert and invoice delete, then employee deactivation, then friendly errors.
