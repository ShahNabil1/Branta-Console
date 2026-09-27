# Work Updates, Work Submission, Project Type and Project Finance

Everything that already works (leads, clients, projects, tasks, team, tracking timeline, invoices, expenses) stays as it is. Only additions.

## 0. Blank preview fix (first step)
- The server has no build errors and the app answers normally. The blank screen most likely happened while the preview was reloading after the last update (it also shows blank when the sign-in session is missing inside the preview).
- Step 1 in build mode: open the preview in a test browser, capture any error on screen, and fix the real cause. Add a friendly "Something went wrong — Reload" screen on the main app pages so a crash never shows a plain white page again.

## 1. Work Updates (activity feed)
- New **Updates** tab inside every task (next to Tracking / Team / Details), and a combined feed on the project.
- Messenger-style feed, newest at the bottom: avatar, name, exact time ("2:15 PM — Naimul"), text, date separators (Today / Yesterday).
- Assigned members and managers can post; optional "items completed" number that also updates that member's progress.
- Managers' comments are highlighted (e.g. revision notes). Updates are never deleted; edit within 10 minutes only, with an "edited" mark.
- Assigned members get a notification when a manager posts.

## 2. Work Submission
- **Submit Work** button for assigned members (bottom sheet on phone):
  Google Drive link, Folder link, File link (several links allowed, checked to be real web links), Notes, Number of completed items. Time saved automatically.
- Each submission shows as a card: number (#1, #2...), who, when, links as tap-to-open chips, status badge.
- Manager options on each submission: **Approve**, **Request Revision** (note required), **Reject** (reason required), **Mark Completed**.
- These actions automatically move the task tracking timeline (Submitted for Review → Revision Requested / Approved → Completed) and post to the Updates feed, so history stays in one place.

## 3. Project Type
- When creating a project, first choose: **Daily / One-Time Job** or **Monthly Contract** (two big tappable cards). The form then shows only the matching fields.
- Daily / One-Time: Date, Task name, Instructions, Assigned team, Start time, Deadline, Work value, Status; Submission and Completion time filled automatically from submissions.
- Monthly Contract: Contract start, Contract end, Monthly fee, Billing date (day of month), Services included, Monthly deliverables, Assigned team, Client manager.
- Existing projects become "Daily / One-Time" by default; nothing is lost. Project cards show a type badge, and monthly contracts show "Next billing: 5 Oct".

## 4. Payment / Project Value
- Finance section on each project and task: Project value, Payment status, Paid amount, Due amount (calculated automatically = value − paid), Payment date.
- Payment status: Not Invoiced, Invoice Sent, Partial Paid, Paid, Due. Suggested automatically from paid amount, can be changed.
- If an invoice is linked to the project, paid amount can pull from that invoice.
- **Only management/accounts** (Super Admin, Admin, Finance) can see or edit it. For everyone else the section is hidden completely, and the server never sends those numbers to them.

## Screens
```text
Task sheet:  [Tracking] [Updates] [Submissions] [Team] [Details]
Project:     type badge | team | finance (authorised only) | tasks | feed
```
Mobile-first bottom sheets, sticky action buttons, smooth animations, same brand look.

## Technical details
- New tables: `client_task_updates` (task_id, author_id, body, items_done, edited_at), `client_task_submissions` (task_id, submitted_by, links jsonb, notes, items_completed, status submitted/approved/revision_requested/rejected/completed, reviewed_by, review_note, reviewed_at). Append-only style; grants + RLS using `is_task_assignee` / `can_manage_task`.
- `client_projects` add: project_type ('one_time'|'monthly', default 'one_time'), start_time, work_value, contract_start/end, monthly_fee, billing_day, services_included, monthly_deliverables, client_manager_id. Validation trigger for type.
- Finance kept in a separate table `client_project_finance` (project_id/task_id, value, paid_amount, payment_status, payment_date) readable/writable only by `is_finance_admin()` so non-finance users cannot read it even directly.
- Server functions in `client-tasks.functions.ts` / `client-projects.functions.ts` with zod validation; review actions call existing `addTaskStatus`; notifications via `notify` (task.update_posted, task.submitted, task.reviewed).
- Error boundary component on authenticated routes for the blank-screen safety net.
