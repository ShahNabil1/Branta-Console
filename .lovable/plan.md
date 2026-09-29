# Reorganize the Finance sidebar

## What will change
- Keep the existing main Finance permission gate and every current Finance route unchanged.
- Replace the long flat Finance list with six collapsible groups:
  - Overview: Dashboard, Fund Analytics, Project Profitability, Reconciliation
  - Funds: Fund Ledger, Fund Transfers, Fund Loans, Fund Settings
  - Billing: Invoices, Income, Historical Allocation
  - Team Payments: Employee Payments, Salary, Salary Report, Wallet, Withdrawals
  - Expenses: Expenses
  - Integrations: Finance Sheets
- Remove the current Finance “Templates” link from the visible sidebar only, since it is not included in the requested grouping. Its route and page remain intact.

## Interaction
- Clicking a Finance group header opens or closes its submenu.
- The group containing the current route opens automatically and stays expanded during navigation.
- Limit expanded Finance groups to at most two; opening another closes the oldest non-active group.
- Preserve the existing mobile drawer behavior and close it after navigation.
- In collapsed desktop mode, keep Finance destinations accessible through a compact Finance icon/menu without duplicate links.

## Visual treatment
- Reuse the current Branta spacing, typography, orange active state, borders, radius, and icon style.
- Use simple group icons plus the existing route icons; show a small chevron for expansion state.
- Clearly highlight the active Finance page without changing the rest of the sidebar.

## Validation
- Confirm every listed destination still points to its existing route.
- Verify Finance/Admin permission filtering remains unchanged.
- Check expanded, collapsed, mobile-open, and active-route states.
- Check the preview build for errors.
