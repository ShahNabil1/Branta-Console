# Dashboard UI redesign (reference: HR Management dashboard)

Only the look changes. No data, permissions, server logic, routes or features change. Every page keeps the same content and buttons.

## Visual direction (from the reference)
- Soft light-grey canvas, app sits in one large white rounded shell (about 24px corners) with a thin hairline.
- Cards: white, 16px corners, 1px light border, no heavy shadows, generous padding, header row = icon + title on the left, outlined "See All >" pill on the right.
- Typography: Inter-style geometric sans (Plus Jakarta Sans for headings/body, matching the reference), 14px body, 15-16px medium card titles, small uppercase-free grey section labels ("Main", "Teams"). JetBrains Mono kept only for money/codes.
- Pills/badges: fully rounded, soft tinted fill + matching text (Pending = amber, Confirmed = green, Rejected = red, In Progress = orange).
- Primary button: solid black "+ Create ..." style; brand red-orange used for active nav marker, gauges, selected date, focus rings and links.
- Round icon buttons (search, bell) in the header; "Welcome, Name" greeting top-left.
- Soft pastel tinted cards for events/meetings (orange, blue, lavender tints) where lists of meetings appear.

## Color
- Brand accent: red-orange #E56A17 (replaces the reference purple everywhere).
- Neutrals: canvas #F4F4F5, panels #FFFFFF, hairlines #ECECEE, text #18181B, muted #71717A.

## What changes
1. Design tokens: fonts, radius scale, neutrals, badge tints, card/button styles.
2. Sidebar: reference layout — logo + workspace chip, "Main" group, team/company group with colored dots and chevrons, Settings/Support pinned bottom, user card with avatar, name, email at the very bottom; active item = light grey fill + orange left marker.
3. Top header: Welcome greeting, round search and notification buttons, black primary action button.
4. Shared UI pieces (cards, buttons, badges, tabs, inputs, tables, drawers, dropdowns) restyled once so all pages follow automatically.
5. Main dashboard home: rearranged into the three-column card grid like the reference (gauge-style summary card, current project card, schedule/calendar strip with tinted meeting cards, status/notes lists), using the data it already shows.
6. Pass over key pages (Leads, Projects/Tasks, Finance, Customers, Employees, Companies) to fix spacing and headers to the new card style.

## Not changing
- No database, server functions, permissions, routes, 2FA/login logic or exports.
- Login page untouched unless you want it matched too.

## Technical details
- `src/styles.css`: new tokens (font-sans Plus Jakarta Sans, radius 12/16/24, neutrals, `--status-*` soft tints), load font via `<link>` in `__root.tsx`.
- `src/components/ui/*` (card, button, badge, tabs, input, table, sheet, popover) variant restyle.
- `src/components/branta/app-sidebar.tsx` and `src/routes/_authenticated/app.tsx` shell/header.
- Dashboard home component rebuilt visually from existing queries only.
- Update `mem://design/branta-tokens.md` (radius/font change replaces 4px + 13px Inter rule).
