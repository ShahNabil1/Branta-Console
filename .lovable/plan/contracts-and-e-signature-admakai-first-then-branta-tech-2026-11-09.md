# Contracts and e-signature (Admakai first, then Branta Tech)

## What the team gets
- A new **Contracts** tab on every project page (same page for all companies; turned on for Admakai first, Branta Tech next).
- **Create Contract** form, pre-filled from the client profile (name, company, contacts) and project (name, service, description, delivery date). The team fills in scope, video length, revisions, agreed fee and special terms.
- Live **A4 preview** built from the company's contract template. **Save Draft** at any time, even before an invoice exists.
- **Linked invoice**: added automatically when the project has one invoice; a picker when it has several. The **Payment Details** section at the bottom shows its payment method, bank details and QR (the same shared Branta payment block invoices use today).
- Status list: **Draft, Awaiting Signature, Signed, Expired**, with version number, who published, who signed and when.

## Publish and sign
1. **Publish Contract** (allowed for Project Coordinator, Team Lead and admins). The company CEO's pre-approved signature and title are stamped on the contract. A signing link valid for 14 days is created and emailed to the client from that company's own email provider.
2. The client opens the link, reads the full contract, and gets a **6-digit code** sent to the email registered on the project (valid for 10 minutes, 5 tries).
3. After the code is accepted, the client enters their name (and title if needed), ticks "I agree", draws or types a signature, then clicks **Submit**.
4. A **Signed PDF** with both signatures and an audit page (time, IP, email, document fingerprint) is saved to the project's Contracts tab. The client can download, print or share their copy from the same page.
5. Changes after publishing create **version 2**, cancel the old link and send a new one. Signed versions never change.

## Per-company setup (Company profile → Contracts settings)
- Contract template (fill-in fields like client name and fee), letterhead (from the existing company branding), CEO name, title and signature image, and the default link expiry.
- Admakai is set up first. I need **your contract template text** to load it in.

## Technical details
- Tables (all with grants and RLS based on `can_view_project`; money fields follow the finance rules): `company_contract_settings` (template body, CEO signature path, title, expiry days), `project_contracts` (project, company, invoice_id, status, current_version), `project_contract_versions` (append-only: form data snapshot, rendered template, CEO signature snapshot, published_by/at, token hash, expires_at, signed name/title/at, IP, user agent, signature path, PDF path, sha256), `contract_otp_challenges` (hashed code, attempts, expiry).
- Private storage bucket `contracts` for CEO signatures and signed PDFs, served only through short-lived signed URLs.
- `src/lib/contracts.functions.ts` (signed-in team actions): list, save draft, publish, new version, settings. Publish and sign-off go through database functions so status and version history change together.
- Public signing page `/sign/$token` plus `/api/public/contracts/*` routes (view, send code, verify code, submit, download). Each request checks the token hash, expiry and the verified code session, and shows nothing else about the project.
- PDF generated server-side in `contract-pdf.server.ts`, reusing the invoice letterhead and payment block code and the server-only QR embed. Emails go through the existing company mailbox and provider code. Expired links are marked Expired when they are next opened or listed.
- Activity log entries: contract created, published, code sent, signed, expired, new version.
- Tests: token expiry, code attempt limit, an invoice is linked automatically only when there is exactly one, and a signed version cannot be changed.

## Not included
- Branta Tech goes live after Admakai is checked, using the same module with its own settings.
- No third-party e-sign service (Scrive etc.); signing is built into the console.
