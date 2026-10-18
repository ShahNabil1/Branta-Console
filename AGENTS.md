<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Project/task money lives in client_project_finance (RLS: is_finance_admin only); list APIs null out budget/work_value/monthly_fee for others — why: financial data must never reach non-finance users.
- Today’s Operations aggregates existing task records in a management-gated server function without finance fields — why: one secure daily view must not duplicate workflow state.
- Fund balances are derived only from append-only fund_ledger; allocation snapshots per installment with one active row (partial unique) — why: history must never change.
- New expenses are created only via the create_expense_atomic RPC (expense + items + receipt rows + fund debit in one transaction, idempotency_key per form submit) — why: a failed child write must never leave the Fund Ledger wrong or double-charged.
- Phase 3 Fund reports live only in src/lib/fund-reports.functions.ts and are read-only (finance-gated); running balances come from the fund_ledger_running view ordered by created_at,id — why: reports must never alter or re-derive accounting differently from fund_balances.
- Historical allocation only via historical_allocate RPC (explicit Finance action, BDT only, idempotent); Finance Sheets sync is one-way Console→Sheets in src/lib/finance-sheets.functions.ts, upserting by stable ID in column A, reusing Phase 3 compute functions — why: Console is the only source of truth and Sheets must never compute or write back finance data.
- Destructive actions never hard-delete history: invoices go through archive_invoice (hard delete only when clean), customers archive_customer, employees deactivate_employee, installment revert via revert_installment_payment (reverses fund allocation atomically) — why: Fund Ledger/payout/audit rows must stay intact.
- Auto codes use sequences/advisory locks + code_pad() (never lpad truncation); server errors go through dbError() in src/lib/db-errors.ts — why: BTL-100 truncated to BTL-10 and raw Postgres errors reached users.
- Employee wallet = append-only wallet_ledger (unique source_type+source_id+direction); balances derived via wallet_balances_v2, withdrawals via wallet_withdrawals holds; migration per employee (wallet_migrate, once); old invoice_payouts/withdrawal_requests are legacy read-only for migrated employees — why: one auditable source of truth with no double credits.
- Invoice PDFs measure wrapped payment-detail rows and reserve signature space with the final content block; retain fixed letterhead margins — why: short invoices must not produce orphan signature pages or overlap printed stationery.
- Invoice merchant QR is embedded from the uploaded, cropped image in a server-only brand module and displayed only for BDT; retain original and cropped CDN pointers — why: payment PDFs must preserve the actual merchant QR and render without a network dependency.
- Project teams live in project_members (one row per user, roles text[]; deactivate, never delete); permission checks use has_project_role/can_manage_project and project recipients resolve via project-recipients.server.ts — why: one employee can hold several roles and must get each alert exactly once.
