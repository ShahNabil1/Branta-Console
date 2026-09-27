# Client Task / Work Order + Team Assignment + Parcel-style Tracking

Only additions. Existing leads, clients, projects, invoices, finance and permissions keep working exactly as today.

## What the user will see

### 1. Tasks / Work Orders inside Client Profile
- New tab on the Client Profile: **Projects · Tasks · Profile · Activity · More**.
- **Add New Task** button (full-screen bottom sheet on phone, dialog on desktop).
- Fields: Task title (e.g. "13 product image photoshoot"), optional Project (picker from that client's projects), Instructions (large multi-line box, e.g. "6 images per product"), Quantity + Unit (e.g. 13 products), Per-unit output (e.g. 6), **Total Output auto-calculated** (13 x 6 = 78 Images, editable), Due date, Priority.
- Date and Time of creation are filled automatically (Bangladesh time) along with who created it.
- Task cards show: title, project name, total output, progress bar (delivered / total), current status chip, assignee avatars, due date.
- Tasks also appear inside each Project card (tap project -> its tasks).

### 2. Team Assignment
- On a task, **Assign Team** opens a list of employees; pick one or many.
- Each assigned row: Employee (avatar + name), Responsibility (free text, e.g. "Coordination / Production"), Quantity (number set by management, never fixed), Status (Not started / In progress / Done).
- Management (users with assign permission) can add, remove, change responsibility/quantity. Assigned employees can update their own row status and done count.
- Sum of assigned quantities shown vs Total Output (e.g. "Assigned 78 / 78"), warning if over or under — not blocking.
- Assigned employees get a Telegram notification via the existing notify system.

### 3. Parcel-style Tracking Timeline
- Vertical timeline like courier tracking: completed steps filled orange with check, current step pulsing, upcoming steps grey.
- Steps: Task Created -> Team Assigned -> Work Started -> Production in Progress -> Submitted for Review -> Revision Requested -> Revision Completed -> Approved -> Delivered -> Completed.
- **Update Status** button: pick next status + optional note -> saved with Status, Updated By, Date, Exact Time.
- Revision can repeat (Revision Requested / Completed can loop multiple times; each round shown as its own entry "Revision #2").
- "Task Created" and "Team Assigned" are logged automatically.
- History is append-only — never deleted. Tasks are archived, never hard-deleted.
- Client Activity tab also shows these updates.

### 4. My Tasks (for employees)
- Small "My Tasks" list on the employee dashboard showing tasks assigned to them with their quantity and status — quick status update from phone.

## Technical details
- Migration (new tables, GRANTs + RLS mirroring `client_projects`, assignees can read/update their own rows):
  - `client_tasks`: customer_id, project_id (nullable FK client_projects), title, instructions, quantity, unit, per_unit_output, total_output, output_unit, priority, due_on, status (text + validation trigger over the 10 steps), revision_round, archived_at, created_by, timestamps.
  - `client_task_assignees`: task_id, user_id, responsibility, quantity, done_qty, status (not_started|in_progress|done), assigned_by, timestamps; unique(task_id,user_id).
  - `client_task_events` (append-only, no update/delete policies): task_id, customer_id, status, note, actor_id, meta jsonb, created_at.
- Server fns in new `src/lib/client-tasks.functions.ts`: listClientTasks, getTask (with assignees + events + names/avatars), createTask, updateTask, archiveTask, setAssignees, updateMyAssignment, addTaskStatus (validates allowed step, writes event, bumps revision_round), listMyTasks. Notification event `task.assigned` + `task.status_changed`.
- UI in `src/components/clients/`: `client-tasks.tsx` (list), `task-form-sheet.tsx`, `task-detail-sheet.tsx` (tracking timeline + assignees table/cards), `assign-team-sheet.tsx`, `tracking-timeline.tsx`; tab added in `app.customers.$code.tsx`; project card shows its tasks; My Tasks widget on `/app`.
- Mobile-first, existing tokens (brand orange for active step), sheet-up animations already in styles.
- Verify: typecheck, build log; authenticated browser test not available (external auth), so user checks on phone.
