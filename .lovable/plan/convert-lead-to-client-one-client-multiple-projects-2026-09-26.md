# Convert Lead to Client + One Client → Multiple Projects

## Current state (verified)
- When a lead's status becomes **Converted**, the database already auto-creates a Customer record (linked back to the lead). This stays as-is so nothing existing breaks.
- Customers pages already exist (`/app/customers`, `/app/customers/$code`). Invoices already belong to a customer.

## What the user will see

### 1. "Convert Lead to Client" button
- Shows on a lead only when its status is **Converted** (lead workspace header + lead card menu).
- Tap -> confirm sheet showing the info that will be copied -> **Convert**.
- If a client already exists for this lead, the button becomes **Open Client Profile** (no duplicates).
- Copies: Client Name, Brand/Company, Contact Person, Phone, WhatsApp, Email, Account Manager (lead owner), Client Since (today). Adds a "Converted to client" entry in the lead timeline/activity log.

### 2. Client Profile (refresh of existing customer page, mobile-first)
- Header: avatar initials, Client Name, Brand/Company, client code, Call / WhatsApp / Email colored buttons (same as leads).
- Info: Contact Person, Phone, WhatsApp, Email, Client Since, Account Manager (reassign only for users with assign permission), source lead link.
- Tabs: **Projects** (default) · Details · Invoices (existing list, unchanged) · Activity.

### 3. Projects / Jobs under a client
- List of project cards (e.g. Gentle Park -> Product Image Production, AI Video, Social Media Creative, Website, Promotional Campaign, Future Work).
- Each project: Title, Service type, Status (Planned / Active / On hold / Completed / Cancelled), Start date, Due date, Budget, Notes, Assigned person.
- **New Project** bottom sheet (full-screen on phone), edit, and status change; every change logged (who + date + time). No hard delete — archive only.
- Clients list shows project count and active projects.
- When creating an invoice for a client, an optional "Project" picker links it to a project (existing invoices untouched).

## Nothing else changes
- Existing auto-conversion, invoices, payouts, expenses, lead flow, dashboard and permissions keep working exactly as today. Only additions.

## Technical details
- Migration:
  - `customers`: add `contact_person`, `whatsapp`, `client_since date default current_date`; backfill from linked lead; `owner_id` = Account Manager.
  - Update `convert_lead_to_customer()` to also copy contact_person/whatsapp and set client_since (same ON CONFLICT DO NOTHING).
  - New `client_projects` (customer_id FK, title, service, status text + validation trigger, starts_on, due_on, budget, currency, notes, assignee_id, archived_at, created_by, timestamps) and `client_project_activity` (append-only). GRANTs + RLS mirroring `customers` (customer_access / view_all / owner).
  - `invoices.project_id uuid null` FK -> client_projects.
- Server fns: `convertLeadToClient(leadId)` (idempotent: returns existing customer code or inserts and logs `lead_activities` kind `converted_to_client`); `listClientProjects`, `createClientProject`, `updateClientProject`, `archiveClientProject` in new `src/lib/client-projects.functions.ts`.
- UI: button in `lead-workspace.tsx` / `lead-card.tsx`; refactor `app.customers.$code.tsx` into tabs with new `src/components/clients/{client-header,project-card,project-form-sheet}.tsx`; project picker in invoice form.
- Verify: typecheck, build log, public render check (authenticated browser test unavailable).
