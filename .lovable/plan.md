
# Profile → 4 Tabs + Security Suite + Passkey Login

Backend + shared UI primitives are already in place. This plan wires up the routes and UI. Confirm before I write the ~2000 lines of tab UI and login integration.

## Routes

```
/app/profile              (layout with tabs + <Outlet />)
  /personal               (default — existing Personal Information form, minus Payment Methods)
  /finance                (Payment Methods + Wallet placeholder)
  /security               (2FA reset, Passkeys, Change Password, Sessions)
  /activity               (placeholder — "coming soon")
```

`app.profile.tsx` becomes a thin layout. All four sub-routes fetch profile via `getMyProfile` (React Query, invalidated on save).

## Personal Information tab
- Extracted from the old 1813-line `app.profile.tsx`.
- Sections: Basic (avatar, full name, legal name, personal Gmail), Phone (BdPhoneInput ×2), Address (BdAddressBlock — mandatory), Identity Documents (IdentityDocumentsBlock), Documents (CV PDF), Social Links.
- Uses `updateMyProfile`. **Payment Methods removed from this tab.**

## Finance & Wallet tab
- `PaymentMethodsBlock` — reads/writes `profiles.payment_methods` JSONB via `updateMyProfile`.
- Wallet section: placeholder card showing 0.00 BDT balance + "Wallet system coming soon" (wired to primary payment method label). No transactions/withdrawal endpoints yet — user said we wire the wallet later.

## Security & Notification tab

**Section 1 — Two-Factor Authentication (TOTP)**
- Shows current status (enrolled/not enrolled) via `supabase.auth.mfa.listFactors()`.
- "Reset 2FA" button → `useConfirm` warning: "You will be signed out immediately and must set up 2FA again on next login." On confirm: unenroll all TOTP factors via `supabase.auth.mfa.unenroll`, then `signOut()` + redirect to `/login`.

**Section 2 — Passkeys** (max 3)
- List via `listMyPasskeys`. Shows friendly name, device type, backed_up badge, last used, created.
- "Add passkey" dialog → prompt for friendly name → `beginPasskeyRegistration` → `startRegistration` from `@simplewebauthn/browser` → `finishPasskeyRegistration`.
- Delete button with `useConfirm`.

**Section 3 — Change Password**
- Current password, new password, confirm new password.
- Validates via `strongPasswordSchema`; calls `changeMyPassword`. Toast on success.

**Section 4 — Active Sessions**
- List via `listMySessions({ current_session_key })`. Row per session: device · browser · OS · city, country · IP · last seen · "This device" badge for current.
- "Sign out" per row (calls `revokeSession`), "Sign out all other devices" button.
- Client polls `pingSession` every 60s; when `revoked: true`, calls `supabase.auth.signOut()` + redirect. Session key = random UUID stored in `localStorage` on login.

**Notifications** — placeholder ("coming next").

## My Activity tab
- Placeholder card: "Activity timeline — coming next."

## Login page changes (`src/routes/login.tsx`)
- Add "Sign in with a passkey" button below the password form.
- Flow: prompt Branta ID → `beginPasskeyLogin` → `startAuthentication` → `finishPasskeyLogin` returns `{ email, token_hash }` → `supabase.auth.verifyOtp({ type: "magiclink", email, token_hash })` → session established.
- Because WebAuthn already verified biometrics, **skip TOTP step** — set a `bypassMfa` flag in navigation state so `/two-factor` recognizes the AAL2-satisfying-passkey path (or route directly to `/app`; the passkey flow does not enroll MFA, so we route based on whether user has any verified TOTP factor).
- On any successful login (password+TOTP or passkey): generate `session_key = crypto.randomUUID()`, store in `localStorage.branta_session_key`, call `registerSession({ session_key })`.

## Global session-revocation watcher
- New hook `useSessionWatcher()` mounted in `_authenticated/route.tsx`. Reads `localStorage.branta_session_key`, polls `pingSession` every 60s. On `revoked` → `signOut()` + push to `/login?reason=revoked`.

## Files to write
- `src/routes/_authenticated/app.profile.tsx` — layout (~120 lines)
- `src/routes/_authenticated/app.profile.personal.tsx` — extracted from old file (~800 lines)
- `src/routes/_authenticated/app.profile.finance.tsx` — (~150 lines)
- `src/routes/_authenticated/app.profile.security.tsx` — (~600 lines)
- `src/routes/_authenticated/app.profile.activity.tsx` — placeholder (~40 lines)
- `src/hooks/use-session-watcher.ts` — (~40 lines)
- Edit `src/routes/_authenticated/route.tsx` — mount watcher
- Edit `src/routes/login.tsx` — passkey button + `registerSession` on success
- Redirect `/app/profile` → `/app/profile/personal` (index route)

## Dependencies to install
- `@simplewebauthn/browser`
- `ua-parser-js` (server) — check if already added by earlier turn

## Notes
- Real IP: extracted server-side from `cf-connecting-ip` / `x-forwarded-for` (already implemented). No client-side IP request needed.
- Real geo: server-side `ipapi.co` lookup (already implemented). No Google Maps prompt — that adds noisy consent for marginal value; happy to switch to browser geolocation on request.
- Passkey max=3 enforced server-side.
- Password history size=1 (blocks current + previous). Extend later if needed.

**Confirm and I proceed with the full implementation. Estimated 6-8 sequential file writes.**
