# Branta Tech ERP/CRM — Foundation (Phase 1)

Chosen design direction: **Precision Console (v3)** — light cool-gray canvas, crisp 1px hairlines, orange (#E56A17) reserved for primary action / active state / focus / status accents, Inter throughout, JetBrains Mono for numerics and IDs, 36px table rows, small-caps section labels.

You'll connect your existing Supabase before build starts. Everything auth-related below is wired for real Supabase calls; leads/dashboard data stays mocked in this phase.

---

## 1. Design system (`src/styles.css`)

Tailwind v4 tokens under `@theme` — no `tailwind.config.js`.

- Brand ramp derived from #E56A17: `--brand-50` … `--brand-900` (600 = base, 700 hover, 800 active).
- Neutrals: app bg `#F9FAFB`, panel `#FFFFFF`, border `#E5E7EB`, hairline `#EEF0F2`, text `#111827`, muted `#6B7280`, subtle `#9CA3AF`.
- Semantic status: new (blue-500), contacted (amber-500), viewed (violet-500), meeting-scheduled (brand-600), converted (emerald-500).
- Typography: Inter 400/500/600/700 loaded via `<link>` in `__root.tsx` head (never `@import` a URL in CSS); JetBrains Mono for numerics. Body 13px, labels 11px uppercase tracked, headings 14–20px semibold, tight tracking.
- Radius: `--radius: 4px` (sharp, not pill). Small shadow token `0 1px 0 rgb(0 0 0 / .04), 0 1px 2px rgb(0 0 0 / .04)` — no blurry defaults.
- All shadcn semantic tokens (`--color-background`, `--color-primary`, etc.) remapped through `@theme inline` to the new palette so existing shadcn primitives inherit the language.
- Global reset: 1px borders, `font-feature-settings: "cv11","ss01","tnum"` for tabular numerals.

## 2. Route architecture

```
src/routes/
  __root.tsx                       # head metadata, font links, QueryClientProvider, auth listener
  index.tsx                        # redirects: → /app if session, → /login otherwise
  login.tsx                        # premium login (public, ssr on)
  two-factor.tsx                   # forced 2FA setup/verify (public route, checked in-component)
  _authenticated/
    route.tsx                      # ssr:false gate; getUser() → redirect /login; enforces 2FA
    app.tsx                        # AppShell layout (sidebar + topbar + <Outlet/>)
    app.index.tsx                  # Dashboard overview
    app.leads.tsx                  # Leads route stub (empty state placeholder for phase 2)
    app.settings.tsx               # Settings stub
```

`index.tsx` placeholder is replaced. Stubs render a titled empty panel so navigation feels complete without pretending modules exist yet.

## 3. Authentication

Uses your existing Supabase project. The generated `@/integrations/supabase/client` is used browser-side.

**Login screen (`/login`)**
- Split layout matching v3 prototype: left dark rail with wordmark + tagline + subtle radial grid, right form.
- Zod schema: `email.endsWith("@brantatech.com")` → inline strict error `Only @brantatech.com addresses are permitted`.
- Primary "Sign in" → `supabase.auth.signInWithPassword`. Errors surfaced inline.
- Secondary "Sign in with passkey" button wired to WebAuthn via `@simplewebauthn/browser`. Since Supabase doesn't ship native WebAuthn, we implement a lightweight bridge: challenge issued via a server function, verified server-side, and on success a Supabase session is minted via a server-side sign-in (using an OTP or admin-issued token flow — exact mechanism confirmed against your Supabase config during build). If your setup can't support a full WebAuthn credential flow yet, the button ships with a clear "Coming soon — contact IT" state so nothing is fake-functional. **Please confirm** you want us to implement the WebAuthn bridge now vs. ship the placeholder in phase 1.
- NO sign-up link. Footer shows compliance notice.

**Forced 2FA (`/two-factor`)**
- After successful password login, `_authenticated` gate checks user's `factors` via `supabase.auth.mfa.listFactors()`. If no verified TOTP factor → redirect to `/two-factor`.
- Setup mode: `mfa.enroll({ factorType: 'totp' })`, render QR (via `qrcode` package) + secret, verify 6-digit code with `mfa.challenge` + `mfa.verify`.
- Verify mode (already enrolled): challenge + verify only.
- "Cancel" button calls `supabase.auth.signOut()` and returns to `/login`.

**Idle timer**
- `useIdleTimeout(30 * 60 * 1000)` hook mounted in `_authenticated/route.tsx`. Listens to `mousemove`, `keydown`, `click`, `scroll`, `touchstart` (throttled). On expiry: `supabase.auth.signOut()` + navigate to `/login?reason=idle`. Uses `document.visibilityState` to pause when tab hidden. No visible UI (per spec).

**Root auth listener (`__root.tsx`)**
- Single `onAuthStateChange` — filter to SIGNED_IN / SIGNED_OUT / USER_UPDATED, call `router.invalidate()`, and `queryClient.invalidateQueries()` (except on SIGNED_OUT to avoid 401 storm).

## 4. App shell (`_authenticated/app.tsx`)

**Sidebar (240px, collapsible to 56px icon rail)**
- Built on shadcn `Sidebar` primitives, restyled to match v3: white bg, hairline right border, grouped sections with 10px uppercase-tracked labels (Workspace / CRM / Comms / Admin).
- Items include icon (lucide, 16px, stroke 1.5) + label. Active state = `bg-brand/5 text-brand`, hover = `bg-zinc-50`.
- Footer: avatar + name + role, click opens account menu (Sign out, Settings).
- Collapse state persisted in `localStorage` (read in `useEffect` to avoid SSR hydration mismatch).

**Topbar (56px)**
- Left: dynamic breadcrumb built from route matches (e.g. Workspace / Leads / Sarah Jenkins).
- Center: `⌘K Search…` pill (opens Command Palette).
- Right: notifications button with brand-dot indicator, avatar menu.

**Command Palette (Cmd+K)**
- shadcn `Command` + `Dialog`, global `Cmd+K` / `Ctrl+K` listener, crisp scale-in (120ms).
- Groups: Navigation (routes), Actions ("New lead", "Compose email" — no-op placeholders wired to toast), Recent (mocked). Ready to be fed real data in later phases.

**Breadcrumbs** — a small `useBreadcrumbs` helper reads `router.state.matches` and each route's `handle.breadcrumb`.

## 5. Dashboard overview (`_authenticated/app.index.tsx`)

Faithful port of v3:
- 4 KPI tiles (Open Leads, Meetings This Week, Reply Rate, Converted MTD) with mono numerics + delta.
- Leads preview table: 4–6 mock rows, columns Name / Company / Status (dot+label) / Owner (initials avatar + name) / Last Activity (mono relative time) / Next Action (brand-colored inline link).
- Activity feed panel below with 3–4 mock entries.
- All from a single `src/lib/mock-data.ts` so phase 2 can swap to real Supabase queries via TanStack Query without touching components.

## 6. Reusable primitives (`src/components/ui-branta/`)

- `DataGrid` — headless table wrapper with 36px rows, hairline dividers, sortable header, sticky header, zebra-off. Uses `@tanstack/react-table`.
- `StatusDot` — 6px colored dot + label, statuses typed.
- `KpiTile`, `PanelHeader`, `SectionLabel`, `Kbd`, `Avatar` (initials fallback), `PageHeader` with breadcrumb + actions.
- `FormField` (label + input + hint + error, matching login styling) — used by login, 2FA, and future forms.

## 7. Packages to add

`@simplewebauthn/browser`, `qrcode`, `@tanstack/react-table`, `zod` (if not present), `sonner` (toasts), `date-fns`.

## 8. Not in this phase (explicitly deferred)

- Leads data grid full page, filters, right drawer, lead detail 3-column view.
- Rich text email composer, templates, thread view, attachments.
- Calendar / Google Calendar integration.
- Employee profile, uploads, device/session revoke.
- Resend / Gmail / Google Sheets wiring.

Each has a stub route so nav works and later phases slot in cleanly.

---

## Technical notes

- TanStack Start file-based routing under `src/routes/`. `_authenticated` layout uses `ssr:false` because Supabase session lives in `localStorage`.
- Router context carries `{ queryClient }`; auth reads happen in components via `supabase.auth.getSession()` / `getUser()`.
- No Lovable Cloud enable — using your existing Supabase project via `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` env vars. Please confirm these are set (or provide them) when you connect Supabase.
- Head metadata updated in `__root.tsx`: title "Branta Tech Console", proper description, og tags.
- All colors flow through CSS tokens — no hardcoded hex in components.

## Open question for you

**WebAuthn passkey button in phase 1** — implement the full bridge now (adds ~half a day and needs a server function), or ship as a visible-but-disabled "Coming soon" affordance and add real WebAuthn in a dedicated phase? Default if you don't answer: ship disabled with tooltip, so phase 1 stays tight and the primary email+password+TOTP flow is rock solid.
