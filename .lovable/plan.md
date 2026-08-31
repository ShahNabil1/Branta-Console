# Salary slip v2 — project-linked pay lines, signature block, sealed copy

Salary is not fixed: it is built from project work, conveyance, bonus etc. The slip must show that breakdown, print with proper signature blocks, and accept a scanned signed copy back.

## 1. Pay breakdown lines (linked to real invoices)

In the Issue salary dialog, each pay line becomes:

- Source: dropdown of real invoices (searchable, shows `BT-xx — title — customer`) or "Manual"
- Description (auto-filled from the invoice title, editable)
- Amount (negative = deduction, e.g. advance adjustment)

Basic salary stays a separate field on top. Net payable = basic + all lines.
The slip PDF prints these as a table: `# | Reference | Description | Amount`, where reference is the invoice code (or "—" for manual lines like conveyance/bonus).

Existing slips keep working — old lines simply have no invoice reference.

## 2. Printable slip layout

Rebuilt A4 slip (Digital + letterhead Print mode), top to bottom:

- Title `SALARY SLIP`, slip no, salary month, payment date
- Employee panel: name, designation (job role), employee ID, plus a **Code 128 barcode of the employee ID**
- Payment panel: method (Bank / bKash / Nagad / Cash / other — free-typed as well), transaction ID, bank/wallet name
- Pay breakdown table + Net payable in words
- Reason / remarks
- Two signature blocks at the bottom:
  - Left: `Employee Signature` — name, designation, blank sign line
  - Right: `MD. Nahid Hasan / Accounts Manager` — blank sign line above the name (as requested, no image; a signature image can be added later)
- Auto footer on every page: `Verified online · <verify URL>` on the left and `Printed: 31 Aug 2026, 01:52 (GMT+6)` — exact print timestamp — on the right

## 3. Payment method detail

The payment method select gets Bank Transfer / bKash / Nagad / Rocket / Cash / Cheque / Other, plus a free-text "Bank or wallet name" field and Transaction ID. All three print on the slip and are stored on the slip and its expense row.

## 4. Sealed (signed) copy upload

Same flow as expense vouchers: print → sign & seal → scan → upload back on the Salary row.

- Upload button per slip (PDF or image) into R2, stored on the slip
- Admin sees View / Download sealed copy in the Salary table; the download button prefers the sealed copy when present
- Employee sees the same sealed copy in My Wallet → Salary slips (view / download)

## Technical notes

- Migration on `public.salary_slips`: add `bank_name text`, `signed_slip_url text`, `signed_slip_at timestamptz`, `signed_slip_by uuid`. Pay lines stay in the existing `components jsonb`, extended to `{ label, amount, invoice_id?, invoice_slug? }` — backward compatible.
- `src/lib/salary.functions.ts`: extend `IssueIn` for the new fields, add `listInvoiceOptions` (reuse finance invoice list) and `attachSignedSalarySlip` (mirrors the expense sealed-copy function), and keep the expense/payout mirroring intact.
- `src/lib/invoice-pdf.server.ts` → `renderSalarySlipPdf`: add the breakdown table, barcode (Code 128 drawn as bars with pdf-lib — no browser lib), dual signature blocks and the verified/printed footer.
- `src/routes/api/public/salary.$slip[.]pdf.ts`: pass the extra payload fields; loader in `invoice-pdf-signing.server.ts` selects the new columns.
- UI: `app.finance.salary.tsx` (invoice-linked line editor, bank field, upload/view/download sealed copy) and `my-wallet-panel.tsx` (sealed copy actions).
