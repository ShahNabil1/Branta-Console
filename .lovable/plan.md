# Expense Vouchers — printable PDF + signed copy upload

Every expense gets its own numbered voucher document (same A4 look and feel as invoices), which can be downloaded, printed on letterhead, sealed/signed, and then re-uploaded and stored against that expense.

## What you get

1. **Auto voucher number** — each expense gets a unique code like `EXP-2608-014` (year+month+serial), shown in the expenses table.
2. **Voucher PDF** — two buttons per expense row and in a detail view:
   - **PDF** — full digital Branta Tech letterhead (logo, address, footer), same styling as the invoice PDF.
   - **Print** — same content, top 1.8" / bottom 0.8" left blank for pre-printed letterhead paper.
   Content: voucher no, date, category, vendor/paid-to, amount + amount-in-words, currency, notes, linked invoice (if any), prepared-by name, and an "Authorized Signature / Company Seal" box at the bottom.
3. **Signed copy upload** — after printing and sealing, upload the scan (image or PDF, ≤15 MB) back to the same expense. Separate slot from the existing receipt, so both live side by side:
   - Receipt/Proof (vendor's bill) — already exists
   - Signed Voucher (sealed company copy) — new
   Both support View (image popup) / Download, and the signed copy can be replaced or removed.
4. **Status chip** — each expense shows `Voucher: Not signed / Signed` so it's easy to see which ones still need the sealed copy back.

## Technical notes

- Migration on `public.expenses`: add `voucher_no text unique`, `signed_voucher_url text`, `signed_voucher_at timestamptz`, `signed_voucher_by uuid`. A `BEFORE INSERT` trigger assigns `voucher_no` from a sequence-style counter per year-month. Backfill existing rows. Keep existing grants/RLS (finance + super-admin only).
- Reuse `src/lib/invoice-pdf.server.ts` primitives (letterhead drawing, `amountInWords`, money/date helpers, mode handling) by extracting the shared header/footer/geometry into a small internal module and adding `renderExpenseVoucherPdf()` — same `invoice_pdf_settings` row drives branding, so the look stays consistent.
- New public signed route `src/routes/api/public/expenses.$voucher[.]pdf.ts` mirroring the invoice PDF route: HMAC `exp`+`sig` verification via the existing `invoice-pdf-signing.server.ts` helpers (a generic `signDocSlug` variant), `mode=print|digital`, admin client hydration of expense + creator profile + settings.
- New server fns in `src/lib/finance.functions.ts`: `getSignedExpenseVoucherUrl({ id, mode })` (finance-guarded), and `setExpenseSignedVoucher({ id, path | null })` to record/clear the uploaded scan.
- Upload goes to the existing private `expense-receipts` bucket under a `signed/` prefix, using the same client-side upload + signed-URL view/download pattern already in `app.finance.expenses.tsx`.
- Expenses page UI: add Voucher column (number + PDF/Print buttons), Signed column (upload/view/download/remove), reusing the existing viewer modal.

## Out of scope

No emailing of expense vouchers, no approval workflow — only generate, print, and store the sealed copy.
