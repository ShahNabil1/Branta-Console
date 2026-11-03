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
- Admin password recovery uses server-owned auth app_metadata.password_reset_pending plus the existing required-change gate; it never changes Telegram flags and only removes TOTP factors on explicit request — why: recovery must not restart employee onboarding or reset unrelated app access.
- Project/task money lives in client_project_finance (RLS: is_finance_admin only); list APIs null out budget/work_value/monthly_fee for others — why: financial data must never reach non-finance users.
- Read access to projects/tasks/customers/profiles goes through the SECURITY DEFINER predicates can_view_project, can_view_task, can_view_customer and is_active_employee; never re-add USING (true) policies — why: only involved or management employees may see delivery and client data.
- Today’s Operations aggregates existing task records in a management-gated server function without finance fields — why: one secure daily view must not duplicate workflow state.
- Fund balances are derived only from append-only fund_ledger; allocation snapshots per installment with one active row (partial unique) — why: history must never change.
- New expenses are created only via the create_expense_atomic RPC (expense + items + receipt rows + fund debit in one transaction, idempotency_key per form submit) — why: a failed child write must never leave the Fund Ledger wrong or double-charged.
- Phase 3 Fund reports live only in src/lib/fund-reports.functions.ts and are read-only (finance-gated); running balances come from the fund_ledger_running view ordered by created_at,id — why: reports must never alter or re-derive accounting differently from fund_balances.
- Historical allocation only via historical_allocate RPC (Finance, BDT, idempotent) — why: Console is the only source of truth; Finance Sheets sync was removed, do not re-add.
- Destructive actions never hard-delete history: invoices go through archive_invoice (hard delete only when clean), customers archive_customer, employees deactivate_employee, installment revert via revert_installment_payment (reverses fund allocation atomically) — why: Fund Ledger/payout/audit rows must stay intact.
- Auto codes use sequences/advisory locks + code_pad() (never lpad truncation); server errors go through dbError() in src/lib/db-errors.ts — why: BTL-100 truncated to BTL-10 and raw Postgres errors reached users.
- Employee wallet = append-only wallet_ledger (unique source_type+source_id+direction); balances via wallet_balances_v2, withdrawals via wallet_withdrawals holds; wallet_migrate once per employee; invoice_payouts/withdrawal_requests are legacy read-only — why: one auditable source, no double credits.
- Invoice PDFs measure wrapped rows, keep the signature with the final block and fixed letterhead margins; the BDT-only merchant QR is embedded from the cropped upload in a server-only brand module — why: no orphan signature pages, no network dependency.
- Project teams live in project_members (one row per user, roles text[]; deactivate, never delete); permission checks use has_project_role/can_manage_project and project recipients resolve via project-recipients.server.ts — why: one employee can hold several roles and must get each alert exactly once.
- Expense reports export only via src/lib/expense-report.server.ts (category-grouped, read-only) and category labels only via formatCategory() in src/lib/expense-categories.ts — why: DB keeps lowercase enum values; every screen/export must show the same capitalized label.
- All sign-outs go through signOutWithLog() in src/lib/sign-out.ts and sessions silent >35 min are auto-ended with logout_reason — why: ended sessions must never show as active; only a read-only logout log remains.
- Tracker SSO only via tracker-sso.functions.ts + /sso/tracker; server-only tracker.server.ts upserts one Tracker auth user per email; connected_apps revoke, never delete — why: one auditable path, no duplicates.
- Tracker employee mirror runs through the shared employee-app sync hooks and src/lib/tracker.server.ts (auth user + profiles + default settings; inactive = is_active false + Tracker ban) — why: Console is the only employee source of truth and a Tracker outage must never block Console changes.
- Employee mutation hooks use syncEmployeeAppsSafe() in src/lib/employee-app-sync.server.ts to run independent Tracker and Admakai mirrors — why: one app outage must not block the other mirror or Console changes.
- Admakai SSO: authenticated /sso/admakai + admakai-sso.functions.ts; server-only admakai.server.ts does email matching, profile/role mirroring and session revocation; callback/role rules in admakai-policy.ts — why: credentials stay server-only, inactive access fails closed.
- Sister-app access is explicit per employee via profiles.allowed_apps (admin-only, DB-guarded); Super Admins always pass; Hub only sets Admakai owner for super_admin and inserts member if no role exists — why: Admakai manages its own internal roles and staff must be granted, not implied.
- Lead email/meeting recipient allow-lists share lead-recipient-policy.ts (incl. alt_email, lead_contacts) — why: stored alternates work, arbitrary recipients don't.
- Retired Lead Docs has no UI/RPC module; preserve its database history and shared connectors — why: feature removal must not destroy history or other integrations.
- External services (Telegram, Resend, Brevo, Google) go through callGateway() in connector-gateway.server.ts: direct provider secrets when set, else Lovable connectors — why: workspace transfers must not break integrations.
- Employee removal runs stepwise via employee-offboard.functions.ts (preflight blockers → Cloudflare → destination → sign-in block → delete-or-deactivate → mirrors), each step reporting its state — why: real progress; history-bearing employees are deactivated.
- Companies: company_members (CEO/COO = company super_admin); company pages/setup/integrations gated by global admins via group-admin.ts; sisters see only the /app overview (no finance) plus shared routes — why: companies never self-configure.
- Company email: service-only providers/tests/events, AES-GCM, group-admin gate, signed ?company receivers. Tests correlate company/provider/tag/message with safe details and confirmed progress. Defaults use atomic RPC. Disconnect rechecks owned hooks, hides tokens, retains keys on failure — why: isolation and safe retries.
- Subdirectories (tracker-extension/, src/lib/mcp/) have their own AGENTS.md; read before changes.
- Per-company Gmail/Calendar: separate OAuth client (COMPANY_GOOGLE_*) in company-google.server.ts; leads/meetings/inbox carry company_id and resolve the mailbox via company-mailbox.server.ts (sisters never use shared Gmail) — why: main sign-in untouched, no cross-company mail.
- Leads/customers resolve the company via lead-company.server.ts (sister = membership checked; customers inherit lead company_id); sister lead mail uses only that company's verified provider; no Leads Sheets sync — why: no cross-company data or senders.
- Console inbox replies (Resend/Brevo) persist in inbox_replies and merge into getInboxThread — why: they never reach Gmail Sent.
- Company identity uses companies.logo_url/brand_kit, company-identity.ts and local pointers; PDF images embed server-only; no editor. Prefixes use companies.functions.ts + company_code_prefix() in all code triggers (holding keeps BT-/EXP-) — why: unique per-company codes.
- Company invoice branding resolves server-side via company-invoice-template.server.ts with immutable snapshots; no in-app editor — why: sisters never show Branta logos/contacts, issued documents never change. renderInvoicePdf forces PAYMENT INFORMATION (bank, note, QR) to Branta Tech for all companies — why: one group bank account.
- WebMCP uses screen-owned hooks, shared actions and static telemetry — why: agents only use visible controls.
- Workspace access = explicit company_members rows (profiles.id; predicates join profiles.user_id), set via setEmployeeWorkspace; no implicit holding access — why: staff see only granted companies.
