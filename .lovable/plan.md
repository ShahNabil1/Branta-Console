# Make the complete Employee area responsive

## Scope

Purely improve layout and usability. Keep all employee data, permissions, actions, validation, and workflows unchanged.

## Employee directory

- Use a fluid page width with compact phone spacing and wider multi-column layouts on large monitors and TVs.
- Stack the title and actions on narrow screens; keep both actions full-width and reachable without clipping.
- Keep employee cards readable at every width with safe truncation/wrapping for names, IDs, roles, mail activity, and sign-in dates.
- Use 1 column on phones, 2 on tablets, 3 on laptops, and additional columns only when enough screen width exists.

## Create Employee and webhook dialogs

- Present dialogs as scrollable near-full-screen sheets on phones, centered dialogs on larger screens.
- Keep headers and bottom actions visible while long form content scrolls.
- Prevent the Branta email suffix, password controls, role choices, URLs, instructions, and validation messages from overflowing.
- Stack role choices and action buttons where needed while preserving all current behavior.

## Employee profile

- Rebuild the top header as a stable responsive grid: employee identity first, administrative actions below on narrow screens.
- Put numerous administrative actions into a compact Actions menu on phones and small tablets while keeping familiar inline buttons on larger screens.
- Make identity, employee code/barcode, job role, RBAC controls, tabs, personal details, documents, permissions, sessions, and lead assignment adapt without horizontal page overflow.
- Keep tabs horizontally scrollable on narrow screens and preserve the selected state.
- Render payout and withdrawal data as compact expandable records on smaller screens while retaining the current tables on larger screens.
- Stack session/lead rows and their actions on phones; allow long emails, addresses, references, device details, and labels to wrap safely.
- Make avatar preview and all confirmation dialogs fit short and narrow viewports.

## Shared application frame

- Ensure the Employee pages remain usable inside the existing sidebar/top bar on narrow screens, including breadcrumbs and account controls.
- Preserve the existing desktop console layout and visual design tokens.

## Verification

- Check the Employee directory, Create Employee dialog, and employee profile at representative phone, tablet, laptop, desktop, and wide-screen sizes.
- Verify there is no page-level horizontal overflow, clipped text, unreachable button, or overlapping control.
- Confirm TypeScript and the preview build remain clean; authenticated visual checks will be limited if the external sign-in session is unavailable.
