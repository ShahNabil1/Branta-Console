# Roadmap

## Lead detail cleanup
- [x] Remove the Docs tab and its exclusive generation/list/delete functions; preserve saved history.
- [x] Remove the duplicate detail Status editor while retaining the workspace header status action.
- [x] Verify no remaining Docs callers, valid changed-file syntax, clean build and two lead company tests.
- [ ] Verify signed-in lead screen and retained header status change; external unmanaged auth provides no test session.

## Company email test tracking
- [x] Remove the duplicate Inbox routing tile; retain the verified Inbox address flow.
- [x] Track test sends with company-scoped correlation and real provider/webhook milestones and event details; retain real default selection and make its save atomic.
- [x] Run six delivery/default/correlation/detail tests plus three disconnect regressions; build OK.
- [ ] Verify authenticated send → signed webhook → UI end-to-end; blocked by external unmanaged auth without a test session and unpublished updated webhook receivers.

## Admakai source branding
- [x] Transfer authentic logo, inverse logo and square icon from the Admakai project.
- [x] Apply company-owned identity globally and prepare the branded invoice, preserving Branta payment information and existing invoice history.
- [x] Verify asset responses, one-page PDF visually and 14 identity/snapshot/render tests; login loads without runtime errors.
- [ ] Verify signed-in company profile/switcher and actual invoice download; external unmanaged auth has no available test session.

## Agent integrations
- [x] Add OAuth-protected, caller-scoped lead/customer read tools and consent with safe login return handling; no contact or finance values.
- [x] Add WebMCP read/search tools on the Leads screen with shared controls and telemetry; authenticated runtime registration is unverified without an available session.
- [x] Extract the two-tool MCP catalog; 13 access/return/company tests pass; preview confirms missing-request error, preserved login return and anonymous MCP 401.
- [ ] Verify hosted OAuth and approve/deny end-to-end; requires Supabase OAuth activation at republish (discovery currently feature_disabled) and an authenticated session.

## Phase 2 — Company Invoice Studio
- [x] Add company-owned, versioned invoice templates and immutable new-invoice snapshots.
- [x] Add real PDF preview with live editing controls, logo conversion, payment/signature/section settings and save/cancel/download. Free-position canvas editing is not implemented.
- [x] Apply shared renderer/settings to preview, signed PDF and email attachments; 13 tests pass; PDF.js renders a one-page sister-brand fixture without Branta assets.
- [ ] Verify authenticated save → invoice → PDF end-to-end; blocked by external unmanaged auth without a session.

## Provider disconnect confirmation
- [x] Show live company-owned webhook addresses/count for Resend and Brevo; hide private tokens, require confirmation and recheck IDs; ownership tests pass.
- [ ] Verify authenticated provider preview in the company page; blocked by external unmanaged auth without an available session.

## Company People & Access
- [ ] Build company-scoped teams, member assignments, reporting hierarchy and protected access management.
- [ ] Build the interactive organization chart, people directory and team editors using real employees.
- [ ] Test hierarchy rules and company isolation; verify available live flows.

## Employee password reset
- [x] Preserve Telegram and existing MFA; offer explicit MFA reset and one-time temporary password copy fallback.
- [x] Separate password-only change from initial onboarding; run password-reset and existing policy regression tests.
- [ ] Verify authenticated employee reset → temporary login → password change end-to-end; blocked by external unmanaged auth with no available admin test session.

## Admakai SSO
- [x] Add authenticated Admakai SSO with exact callback allowlist and role mapping (20 policy tests pass).
- [x] Implement employee-change mirrors and inactive-access revocation; live removal/session revocation remains unverified.
- [x] Configure secrets and confirm Admakai auth connection and target schema.
- [ ] Verify authenticated callback and removal end-to-end after publishing; blocked by external unmanaged Hub auth (no test session available). Admakai must enforce inactive profiles in its own access rules.

## Monitoring fixes
- [x] Verify and correct project title references in wallet/earnings database reports; preserve accounting and access checks.
- [x] Apply payment-status filtering to expense exports and run regression tests.

- [x] Salary slip v2: invoice-linked pay lines, barcode + dual signature blocks, sealed copy upload, bank/wallet field
- [x] Re-link connectors in new workspace: Brevo, Gmail, Google Calendar, Google Docs, Google Sheets, Resend, Telegram
- [x] Make Employee directory, Create Employee, and full employee profile responsive across phone, tablet, laptop, desktop, and TV
- [x] Lead dashboard menu position swap (Lead Dashboard above Leads)
- [x] Real WhatsApp logo + brand-coloured Call / WhatsApp / Email actions on lead cards and lead workspace header
- [x] Add management-only Today’s Operations dashboard for daily client, task, assignee, progress, review, revision, and completion tracking

## Connectors (new workspace)
- [x] Re-link Brevo, Gmail, Google Calendar, Google Docs, Google Sheets, Resend, Telegram

## Branta Fund Ledger
- [x] Phase 1: core ledger, auto allocation, versions, settings, invoice allocation, failure retry
- [x] Phase 2: spending (expense fund, transfers, loans, employee payments, owner withdrawal)
- [x] Phase 3: fund detail, profitability, analytics, reconciliation (read-only; awaiting review before Phase 4)
- [x] Phase 4: historical allocation + one-way Finance Sheets (user must connect a spreadsheet and run first sync)

- [x] Reconnect integrations in new workspace: Brevo, Gmail, Google Calendar, Google Docs, Google Sheets, Resend, Telegram (+ re-register Telegram webhook)
- [x] Fund Ledger base fix: allocation UI, correction report, employee payout pool
- [x] Invoice form: cost types (fixed/%), live 9-fund preview, planned Employee Fund Distribution linked to Employee Payments
- [x] CRUD safety: code generators fixed, archive/deactivate/revert RPCs, friendly DB errors
- [x] Reorganize Finance sidebar into collapsible route groups with active-page expansion

## Project & Delivery Management
- [x] Phase 1: multi-role project team, project/QC fields, team-aware task permissions, Telegram events (role assigned, submission → QC/Lead/Head)
- [x] Phase 2: /app/projects hub, service tracks + track links, SOW/requirement docs, multi-role team manager, internal projects without client
- [x] Phase 3: two-tier QC (internal QC + client revisions, feedback doc, deadlines, rounds) with role-based Telegram alerts; tasks on internal projects
- [x] Phase 4: handover dossier (checklist, final links, notes), linked invoice codes, completion + team Telegram alert; project leads can edit projects

- [x] Reconnect 7 integrations in new workspace (Brevo, Gmail, Calendar, Docs, Sheets, Resend, Telegram)

- [x] Restyle employee profile tabs, logs, dialogs + Workspaces access
