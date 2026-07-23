## Goal
Formalize drafts as a first-class state, enforce Name+Email on final Create, add autosave, and add a Drafts page.

## 1. Database (migration)
- Add `leads.is_draft boolean not null default true`.
- Backfill: set `is_draft = false` for all existing rows except sentinel `Untitled lead` drafts (which stay drafts).
- Remove the 2-minute abandoned-draft sweep (drafts are persisted intentionally now).
- Slug release on delete already works: `assign_lead_slug` picks the smallest free `BTL-XX`, so deleting a draft frees its slug automatically. No trigger change needed.
- RLS: allow the owner (`created_by = auth.uid()`) to `DELETE` their own draft rows even without `lead_delete` permission (super_admin already covered). Add a policy scoped to `is_draft = true AND created_by = auth.uid()`.

## 2. Server functions (`src/lib/leads.functions.ts`)
- `createDraftLead`: unchanged behavior; now writes `is_draft = true` explicitly, no sentinel-name dependency (still keeps `Untitled lead` as visual placeholder).
- `updateLead`: allow partial patches without validation friction (used by autosave); do not flip `is_draft`.
- New `finalizeLead(id)`: requires `name` and primary-contact `email` present; sets `is_draft = false`; writes a "Lead created" activity (replacing the current draft placeholder activity). Reject if either missing.
- `listLeads`: filter `is_draft = false` instead of `neq name = 'Untitled lead'`.
- New `listDraftLeads({ ownerFilter?: 'me' | 'all' | userId })`:
  - Non-admin → force scope to `created_by = me`.
  - Super admin → `all` by default, or filter by a specific `userId`.
  - Returns same row shape as `listLeads` (with owner name + primary email).
- `deleteLead`: already exists; ensure owner-delete works for own drafts (matches new RLS).

## 3. Lead detail (`src/components/leads/lead-detail.tsx`)
- Add draft-aware header state driven by `lead.is_draft`.
- Autosave: debounced (600 ms) `updateLead` on any form field change while editing. Shows subtle "Saving… / Saved · HH:MM" indicator. Skips when there are duplicate conflicts.
- Footer actions when `is_draft`:
  - **Save draft** (secondary) — flushes autosave and returns to `/app/leads/drafts`.
  - **Create lead** (primary) — calls `finalizeLead`; disabled unless `name.trim()` and a valid `email`. Tooltip explains what's missing.
- When `!is_draft`, keep existing Edit / Save / Cancel behavior.

## 4. Leads list (`src/routes/_authenticated/app.leads.index.tsx`)
- Add a **Drafts** button next to **New lead**, visible only when `myPerms.lead_manage` is true. Links to `/app/leads/drafts`.
- No change to the main list query (already excludes drafts).

## 5. New route `/app/leads/drafts` (`src/routes/_authenticated/app.leads.drafts.tsx`)
- Route-guard: redirect to `/app/leads` if `!lead_manage`.
- Table of drafts (slug, name-or-"Untitled", email, owner, updated_at).
- Row click → opens `/app/leads/{slug}` in draft edit mode.
- Row actions: **Open**, **Delete** (with confirm; frees slug).
- Super-admin: employee filter dropdown (All employees / individual). Non-admins see only their own; filter hidden.

## 6. Permission gating summary
- Drafts button + Drafts route: hidden for users without `lead_manage`.
- Draft delete: allowed for the draft's owner OR `lead_delete` OR super_admin.
- Non-admins in Drafts page see only rows where `created_by = me`.

## Files
- New: `supabase/migrations/*` (via migration tool), `src/routes/_authenticated/app.leads.drafts.tsx`.
- Edit: `src/lib/leads.functions.ts`, `src/components/leads/lead-detail.tsx`, `src/routes/_authenticated/app.leads.index.tsx`.

## Notes
- Autosave writes only to the leads table via `updateLead`; primary email still lands in `lead_contacts` via the existing `email` patch path.
- Finalize is the only place Name+Email is enforced; drafts intentionally allow partial data so refresh/session-revoke can't lose typed text.
