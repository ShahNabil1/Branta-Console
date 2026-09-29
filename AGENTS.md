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
