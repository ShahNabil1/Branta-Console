# Finance Reports & Export System

Upgrade only the Finance module: proper filtering on Income and Expense, live summary numbers, and working PDF / Excel / CSV downloads. Nothing outside Finance changes, and existing invoices, payouts, salary, wallet and permission behaviour stay exactly as they are.

## What you will get

### 1. Income section (new page: Finance → Income)
A dedicated list of every taka/dollar that came in:
- Paid invoice instalments (client, invoice, instalment label, payment method, paid date)
- Manual income entries added in Company Wallet

Filters: quick date buttons (Today, Yesterday, Last 7 days, Last 30 days, This week, This month, Last month, This year, Custom range), currency, income source/category, client, project (invoice), payment method, payment status, minimum & maximum amount, and free-text search.

### 2. Expense section (existing page, upgraded)
Same filter bar, using only fields that already exist: date range, category, vendor/payee, linked invoice (project), payment method, department, amount range, requested by / paid by (created by), and search across vendor, notes, purpose, transaction ID and voucher number.

### 3. Finance Dashboard
- Transaction type switch: All / Income / Expense
- Summary cards recalculated from the active filter: Total Income, Total Expense, Net Balance (income − expense), Number of Transactions
- Combined report export containing both income and expense rows

### 4. Export — everywhere
Each of the three screens gets one Export control with PDF, Excel (.xlsx) and CSV.
- Exports always use the currently applied filters, never just the visible page. If a filter matches 500 rows and the table shows 20, the file contains all 500.
- PDF is a real, generated financial report: A4, proper margins, report title, period, generated date, the list of applied filters, summary block, and a transaction table that flows across pages without overflowing. Bangla text (client names, notes) renders correctly with an embedded Bangla font.
- Excel is a genuine .xlsx: bold headers, sized columns, real date cells and numeric amount cells with currency formatting — not a renamed CSV.
- CSV is UTF-8 with BOM so Bangla opens correctly in Excel.
- Filenames are meaningful: `finance-report-2026-09.pdf`, `income-report-september-2026.xlsx`, `expense-report-2026-09.csv`.
- While a file is building, the button shows a spinner and is locked against double clicks; failures show a clear error message.

### 5. Filter UX
Applied filters show as removable chips with a Reset filters button. The bar collapses into a sheet on mobile and follows the existing console styling (hairlines, 4px radius, brand orange only for active state).

### 6. Access
Only Finance role, Admin and Super Admin can open these pages or run exports — the same rule the Finance pages already enforce, checked again on the server for every export request so no one can pull data they cannot see.

## Technical notes

- **Server-side filtering.** New server functions in `src/lib/finance-reports.functions.ts`: `listIncomeRows`, `listExpenseRows`, `listCombinedRows`, `getFinanceSummary`. All take one shared `ReportFilters` zod schema, apply filters in Postgres (`gte/lte/eq/in/ilike`), and each begins with the existing `is_finance_admin` check. Paged reads for the table, full-set reads (chunked with `.range()`) for export.
- **Income rows** are assembled from `invoice_installments` where `status = paid` joined to `invoices`/`customers`, unioned with `company_ledger` rows of income kind, normalised to one row shape `{ date, type, reference, party, project, category, method, status, currency, amount }`. Same shape is reused for expenses so one table, one exporter and one filter component serve all three screens.
- **Shared UI**: `src/components/finance/report-filter-bar.tsx` (quick dates + facets + chips + reset), `src/components/finance/export-menu.tsx` (format picker, loading state, click-lock, toast errors), `src/lib/report-filters.ts` (date preset math, URL search-param sync so filters survive refresh and are shareable).
- **PDF** is generated server-side with the already-installed `pdf-lib`, in a new `src/lib/finance-report-pdf.server.ts` sharing the A4 layout helpers of `invoice-pdf.server.ts`. Bangla needs a TTF + `@pdf-lib/fontkit` (already present under node_modules as a pdf-lib peer; installed explicitly if missing) plus a Noto Sans Bengali subset added to the repo. Streamed back as a base64 payload the client turns into a download.
- **XLSX**: no spreadsheet library is installed. Add `fflate` (tiny, Worker-safe) and write a ~150-line OOXML writer in `src/lib/xlsx.server.ts` producing real sheets with column widths, bold header style, `dd-mmm-yyyy` date format and `#,##0.00` number format. No SheetJS/ExcelJS (Node-only or heavy).
- **CSV** is built in the same server module with a UTF-8 BOM and RFC-4180 quoting.
- Existing `getFinanceReport`, `listExpenses`, and every current Finance page keep working; the expenses page gains the filter bar and export menu without changing its create/edit/voucher logic.

## Testing

Manual pass in the preview with a signed-in Finance user: each filter alone and combined, quick date presets, search, reset, pagination vs export row counts, all three formats on all three screens, Bangla client name in PDF/CSV/XLSX, BDT and USD formatting, empty result set, a large (500+ row) export, mobile layout, and a non-finance user being blocked.
