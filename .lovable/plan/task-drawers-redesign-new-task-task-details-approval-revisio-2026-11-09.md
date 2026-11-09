# Task drawers redesign (New Task, Task details, Approval, Revision)

Only the look changes. Same fields, same saving, same approval/revision rules. The drawer still slides in from the right.

## New look (from your two screenshots)
- Big white panel with rounded corners, floating slightly off the right edge, soft grey dimmed board behind.
- Top bar: small icons only (close / expand on left, more "..." on right) and a light breadcrumb "Company / Tasks / New task".
- Large title input at the top, no box around it ("Untitled task" placeholder, 26px).
- Under it a clean property list, one row each: grey icon + grey label on the left, value on the right:
  - Status: To Do / Doing / In Review / (other existing statuses) as a soft coloured pill with a small dot
  - Priority: Low / Normal / High / Urgent as soft pills (blue, grey, amber, red tints)
  - Due date (date + time)
  - Project
  - Tags: light grey rounded chips + "Add tag"
  - Assignees: overlapping avatar stack + name chips, and a small outlined "+ Invite / Add" button (like "Invite" in screenshot 1)
- Description: soft grey rounded box like "Project Description".
- Subtasks, links/assets: rows with checkbox circles and file-style cards (icon, name, small grey "Open" link), "+" tile to add.
- The 3-step wizard (Basics / Team / Assets) becomes one scrolling page; bottom bar keeps Cancel + Create task.
- No orange glow anywhere: remove glowing shadows on buttons and focus rings; focus becomes a simple 1px darker border. Orange stays only for the main button and the selected tab underline.

## Task details drawer (same layout)
- Same header, title, and property list as New Task.
- Underline tabs below: Activity · My Work · Assignees · Comments (mapped to what exists today).
- Activity shown as a timeline: avatar, "Name changed status from To Do to Doing", time, attached files as small cards.

## Approval and Revision
- In the same spot as today, shown with the same style:
  - Submitted work = card with file/link, submitter avatar and time.
  - Approve = solid button, Request revision = outlined button, note box in soft grey.
  - Approved = green soft pill "Approved" + "Approved by Name · time" row in the property list.
  - Revision = red soft pill "Revision requested" with the reviewer's note in a soft red box.

## Colours (from your screenshots)
- White panel, text #18181B, labels #71717A, hairlines #ECECEE, soft grey fill #F6F6F7.
- Pills: To Do grey, Doing blue (#EEF2FF/#4F46E5 text), In Review amber, Approved green, Revision red; priorities tinted similarly.
- Brand red-orange #E56A17 for the main button and active tab only.

## Technical details
- `task-ui.tsx`: new `PropRow`, `SoftPill`, `AvatarStack` pieces; replace `FIELD`/`AREA` glow focus with plain border focus.
- `new-task-drawer.tsx`: drop step wizard UI, single scroll with property rows; same `Draft` state and `save.mutate` payload.
- `task-detail-drawer.tsx`: header/property list/tabs restyle; approval/revision blocks restyled, same `review` / submit calls.
- `task-activity.tsx`: timeline styling.
- Sheet container classes for the floating rounded panel (tasks only).
- No server, database or permission changes.
