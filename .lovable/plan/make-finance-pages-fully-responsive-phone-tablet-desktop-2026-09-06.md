# Make Finance pages fully responsive (phone, tablet, desktop)

Right now the Finance tables (Expenses, Income, Salary, Wallet, Withdrawals, Invoices, Salary Report, and the combined report) are wide fixed tables. On a phone or narrow window most columns are cut off and several actions can't be reached at all.

## What changes

**1. One shared responsive row pattern**

- On large screens: the table stays exactly as it is today — same columns, same order, same numbers.
- On phone and small tablet: each record becomes a compact card showing only the essentials (date, title/vendor/employee, amount, status).
- Each card gets a **More** control that expands the rest of the details in place (department, requested by, method/transaction ID, purpose/notes, voucher number, receipt, signed copy, etc.). Nothing gets dropped — it's just folded away until asked for.

**2. All row actions always reachable**

- The per-row buttons (view, download, print, upload sealed copy, edit, delete, refund/revoke where they exist) move into a single **⋯ actions** menu on small screens, so no action is ever hidden off the right edge.
- On desktop the icon buttons stay inline as they are now, with an overflow menu only where the row would otherwise get crowded.

**3. Filters, toolbars and headers**

- The Finance filter bar collapses to a full-width stacked layout on phones; the date presets scroll horizontally instead of wrapping into a tall block.
- Page headers (title + Export + Add buttons) switch to a two-line stacked layout on small screens so the buttons never clip the title.
- Export menu, currency toggle and search sit on their own full-width row on phones.

**4. Dashboard and detail pages**

- Finance Dashboard KPI tiles: 1 column on phone, 2 on small tablet, 4 on desktop; the category bars and quick links stack.
- Invoice detail, Wallet and Salary panels: side-by-side blocks stack vertically on narrow screens, long values (emails, transaction IDs, slugs) wrap or truncate instead of pushing the layout wide.

**5. Modals and forms**

- Add/Edit Expense, Issue Salary, New Invoice and upload dialogs become full-height scrollable sheets on phones with sticky action buttons at the bottom.

## Pages covered

Finance Dashboard, Invoices (list + detail + new/edit), Wallet, Withdrawals, Expenses, Salary, Salary Report, Income, and the shared report table/filter bar used across them.

## Technical notes

- Add a reusable `ResponsiveRecordList` (card + expandable "More" details) and a shared `RowActionsMenu` (shadcn `DropdownMenu`) under `src/components/finance/`, driven by a column definition per page so desktop `<table>` and mobile cards render from the same data.
- Breakpoint switching is CSS-only (`hidden lg:table` / `lg:hidden`) rather than `useIsMobile`, to avoid hydration flicker; `useIsMobile` stays only where behaviour (not layout) must differ.
- Purely presentational: no changes to server functions, queries, permissions, currency handling, PDF/export logic, or any calculation.
