## Goal

Server-generated, branded invoice PDF at a stable slug-based URL, automatically emailed via Resend from `finance@brantatech.com` (display name **Invoice — Branta Tech**) to the customer plus any selected contacts, with a live delivery chip on the invoice (like the leads sync chip).

---

## 1. Branded PDF generator (server-side, stable URL)

- Use **pdf-lib** (pure JS, Cloudflare Worker-safe — no native binaries, no fonts on disk).
- Embed fonts at build time: Inter (regular/semibold) + JetBrains Mono, converted to `.ttf` bytes imported via Vite `?arraybuffer`.
- Brand tokens: orange `#E56A17` accent, `#F9FAFB` panel bg, 1px `#E5E7EB` hairlines, 4px radius look, Branta logo top-left (imported PNG bytes).
- Layout: header (logo + "INVOICE" + slug `BT-XX`) → billed-to / from block → project title + description → installments table → totals (subtotal, paid, due) with mono numerics → stakeholders hidden → footer (thanks + notes + [finance@brantatech.com](mailto:finance@brantatech.com)).
- Stable URL: **server route** `src/routes/api/public/invoices/$slug.pdf.ts` (public prefix, but we sign the URL with an HMAC token in query `?t=...` so only the emailed recipient link works). Verifies token, loads invoice via `supabaseAdmin`, streams `application/pdf` with `Content-Disposition: inline; filename="BT-XX.pdf"`.
- Also expose `downloadInvoicePdf` server function for the in-app "Download PDF" button (authenticated, no token needed).

## 2. Recipient picker

- New `Send invoice` dialog on the invoice detail page:
  - Primary recipient: customer's email (pre-checked, disabled).
  - Additional: every row from `customers_contacts` (or `customer.contacts` JSON — verify current shape) rendered as a checkbox list with name + role + email.
  - Free-form "extra emails" textarea (comma/newline separated, validated).
  - Optional custom message textarea appended above the CTA in the email.
- On send → `sendInvoiceEmail` server function.

## 3. Email delivery via Resend

- Sender: `Invoice — Branta Tech <finance@brantatech.com>`.
- Uses existing Resend connector (`RESEND_API_KEY` already linked) through the Lovable gateway per project convention.
- Body: React-Email template `invoice-email.tsx` matching brand — greeting, "Invoice **BT-XX** for **{title}** — Total **{currency amount}** due **{date}**", primary CTA "View & download PDF" linking to signed PDF URL, plaintext fallback of the same link, finance signature, footer with company address.
- **[finance@brantatech.com](mailto:finance@brantatech.com) must be a verified sender** on the Resend domain — if not verified yet, we'll flag it after wiring (Resend dashboard step, one-time).
- Batches: one Resend call per recipient (so per-recipient tracking IDs stay clean); all writes to a new `invoice_email_events` table for the chip.

## 4. Real-time delivery chip (like leads sync)

- New table `invoice_email_events` (id, invoice_id, recipient_email, resend_message_id, status enum `queued|sent|delivered|opened|clicked|bounced|complained|failed`, error text, created_at, updated_at). RLS: readable by finance admins + invoice stakeholders.
- Resend webhook route `src/routes/api/public/webhooks/resend-invoices.ts` — verifies `RESEND_WEBHOOK_SECRET` (already in secrets) via Svix signature, updates matching event row.
- Invoice detail page subscribes via Supabase Realtime on `invoice_email_events` filtered by `invoice_id` (same pattern as the leads sheet-sync chip). Shows a compact chip per recipient with status color (queued/sent = neutral, delivered = emerald, opened = brand orange, bounced/failed = rose), tooltip with timestamp + error, and a "Resend" button on failed/bounced.

## 5. UI touchpoints on `app.finance.invoices.$slug.tsx`

- Header actions: **Download PDF** (auth link) + **Send invoice** (opens dialog).
- New section "Delivery" below installments: list of every `invoice_email_events` row grouped by recipient, live-updating chips.
- Toast on send success/failure with per-recipient breakdown.

---

## Technical section

**New/changed files**

- `src/lib/pdf/invoice-pdf.server.ts` — pdf-lib renderer, exports `renderInvoicePdf(invoice): Uint8Array`.
- `src/lib/pdf/assets/` — Inter + JetBrains Mono TTF + logo PNG, imported via `?arraybuffer` / `?url`.
- `src/lib/pdf/pdf-token.server.ts` — HMAC sign/verify (uses new secret `INVOICE_PDF_SIGNING_SECRET`, generated).
- `src/routes/api/public/invoices/$slug.pdf.ts` — signed public PDF route.
- `src/routes/api/public/webhooks/resend-invoices.ts` — Svix-verified webhook.
- `src/lib/invoice-email.functions.ts` — `sendInvoiceEmail`, `listInvoiceRecipients`, `listInvoiceEmailEvents`.
- `src/lib/email-templates/invoice-email.tsx` — React Email template.
- `src/components/finance/send-invoice-dialog.tsx` — recipient picker.
- `src/components/finance/invoice-delivery-chip.tsx` — realtime chip.
- Update `src/routes/_authenticated/app.finance.invoices.$slug.tsx` for the two buttons + Delivery section.

**Migration**

- `invoice_email_events` table + enum + RLS (finance admins + super_admin full; stakeholders/creator read).
- GRANTs to authenticated + service_role.
- Realtime: `alter publication supabase_realtime add table public.invoice_email_events`.

**Secrets**

- Generate `INVOICE_PDF_SIGNING_SECRET` (64 chars, random) via `generate_secret`. `RESEND_API_KEY`, `LOVABLE_API_KEY`, `RESEND_WEBHOOK_SECRET` already exist.

**One-time external step** (I'll flag once code is deployed)

- In Resend dashboard: verify `brantatech.com` (or the finance subdomain) and confirm `finance@brantatech.com` sender.
- In Resend dashboard: add webhook pointing to `https://project--0b934a6f-9f9d-47f8-b76c-960a68b43f5a.lovable.app/api/public/webhooks/resend-invoices` with the existing `RESEND_WEBHOOK_SECRET`.

---

## Out of scope (unless you want it now)

- Attaching the PDF as a binary attachment on the email (Resend supports it, but a signed link is smaller/more reliable and gives us open/click tracking). Say the word and I'll switch to attachment mode. yes switch to attachment mode 
- Scheduled reminders (Day-before-due, overdue) — separate task; would reuse everything above. yes schedule করতে হবে, নতুন পেমেন্ট যেমন ৩ বারে পেমেন্ট হইলে পেইড হইলে সেইগুলা মেইল যেতে হবে 
- Multi-language invoice PDF. এইটা লাগবেনা
- কিন্তু পিডিএফ এর টেমপ্লেট থেকে শুরু করে ইমেইল এর টেমপ্লেট ও ইডিটেবল হবে আর সেইটা এ্যাডমিন এর সেটিংস অপশন এর মধ্যে দিয়ে দাও সেখানে ইমেইল টেমপ্লেট পেইজে ইমেইল টেমপ্লেট ইডিট করা যাবে বিভিন্ন ভ্যারিয়েবল অনুযায়ী আর পিডিএফ এর টেমপ্লেট এর ও নাম, লোগো, ব্যাকগ্রাউন্ড কালার, হেডার, সিগনেচার এ টূ জেড সব কিছু একদম ইলিমেন্টর এর মতো ইডিট করা যাবে ডায়নামিকভাবে আর সিংগেল ফেস এ একবারে সব করতে হবেনা প্রয়োজনে ২-৩ ফেস এ করো 

Proceed?