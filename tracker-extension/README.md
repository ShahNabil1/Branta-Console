# Branta Time Tracker

Manifest V3 employee tracker for Branta Console, version `0.4.0`. Requires Chrome 120+ (30-second alarms), Node 22.12+ or Node 24, and npm.

```sh
npm ci
npm test
npm run build
```

Load `dist/` through **Load unpacked** in `chrome://extensions`. The popup and side panel share a typed UI. `npm run dev -- --host 127.0.0.1` provides a browser preview; **Preview the tracker UI** uses explicitly labeled sample data with no real tracking.

## SSO setup contract

The background worker launches `chrome.identity.launchWebAuthFlow` with:

```text
https://console.brantatech.com/sso/tracker?redirect_uri=<encoded chrome.identity.getRedirectURL('tracker')>&state=<random nonce>&tracker_project=vvkzkmvsbmfczauiyaoh
```

The Console handler must validate its signed-in employee, allowlist the installed extension's exact redirect URI, and issue a **dedicated Tracker-project session**, not a copy of the Console session. It must provision the corresponding `auth.users` / `profiles` identity in the Tracker project server-side and redirect to:

```text
https://<extension-id>.chromiumapp.org/tracker#access_token=<tracker JWT>&refresh_token=<tracker refresh token>&state=<original nonce>
```

The extension rejects changed destinations, missing or mismatched state, expired flows, duplicate token fields and invalid sessions. `setSession` restores the token pair; `getUser` verifies it with Tracker Auth before profile access. The worker stores and refreshes the session independently in `chrome.storage.local`, restricted to `TRUSTED_CONTEXTS`. Popup/content scripts never receive tokens. A heartbeat refreshes expiring sessions; no Console cookie or idle timer is consulted. Tracker Auth revocation and expiry still apply. Logout signs out the Tracker session locally and clears local tokens even if network logout fails. It does not check out the shift; an open break remains a break.

This repository contains the extension side of SSO. Console route source is not present here. The live page displayed a Console security alert during inspection, so the Console callback contract and an installed-extension sign-in have **not** been verified. Do not disable that protection or accept unverified callback tokens to make a test pass. Never paste JWTs into chat or commit credentials.

## Tracking and permissions

Check-in explains numeric activity counters and random visible-tab screenshots, then requests optional `<all_urls>` website access. That grant enables isolated counter scripts on HTTP(S) pages and automatic visible-tab capture. Without the grant, check-in is not started. Only the configured Tracker Supabase and R2 endpoints receive required host access at install. `scripting` supports optional counter injection; no broad website content script is registered until tracking is enabled. Incognito and privileged pages are excluded. The badge displays ON, IDLE, break or an offline indicator.

`chrome.idle` uses a 300-second threshold. Time is classified by Chrome-reported active/idle/locked transitions, not an invented exact last-input timestamp. Each observation produces a bounded interval; missing observations, backward clock jumps and gaps over 75 seconds contribute **no guessed work time**. Browser-restart gaps are never backfilled. Work pauses on breaks; break duration derives from explicit server-side break timestamps. Normal service-worker wake-up restores owner-scoped queues from local storage, recent observations from session storage, and verifies the open shift against Supabase. Unknown intervals are intentionally not payroll evidence.

The content script reads only `isTrusted` and visibility, incrementing numeric click and keydown totals. It never reads `event.key`, `event.code`, targets, values, password text, DOM text or URLs. Only counts and random deduplication IDs are messaged to the worker. Counts cover the focused, permitted HTTP(S) browser tab; not desktop applications, restricted pages or events inside inaccessible frames. Breaks, idle state, logout and checkout disable collection. No OCR or text extraction is performed. Screenshots are the separately disclosed image capture feature and can contain visible pixels from the active tab.

Intervals and command intents are persisted before network submission. Server-side UUID deduplication prevents duplicate time on retries; overlapping device intervals are rejected rather than double-counted. Pending aggregates are retained under their employee UUID on logout and only retried for the same account. The queue is bounded; sync failure is surfaced as offline, and timing pauses if observation or storage cannot be trusted. A single employee should track on one browser/device at a time; overlapping device queues require reconciliation rather than speculative merging. Daily totals aggregate server-side by Asia/Dhaka dates without the REST row cap, with observations split at midnight.

## Screenshots

The worker schedules randomized delays around `screenshots_per_hour`. Zero disables capture. It checks the verified shift, break, idle, focus, incognito status and granted permissions before capture and again before authorization/upload. `captureVisibleTab` captures the active **browser tab**, not the entire desktop. No captures occur while Chrome reports idle/locked or while on a break.

An offscreen document performs all Canvas/image work: optionally blur the whole image, encode WebP at 72% quality, then reduce resolution until the file is at most 100,000 bytes. Oversized or failed encodes are discarded. The service worker contains no DOM processing. Pixels remain transient in memory; raw or encoded screenshots are never stored in extension storage or logs.

The employee JWT authorizes `tracker-upload-auth`; the returned HTTPS R2 host and object key are validated, then the image is PUT with `Content-Type: image/webp`. Only successful uploads produce a queued `shift_screenshots` metadata insert. A duplicate metadata UUID is verified before treating a retry as successful. Upload failures discard pixels and wait for the next random capture; metadata failures retain only the R2 key and numeric metadata. A browser crash between R2 PUT success and local metadata persistence can leave an orphan object, requiring a future server-side retention/finalization job. No public screenshot URLs, R2 secrets or typed key values are stored. Screenshot activity percentage is left null because counts do not establish a calibrated percentage.

## Database compatibility and permissions

Phase 1 created `shifts` and `screenshots`. Phase 4 preserves those tables and uses auto-updatable `security_invoker` views:

| API relation | Existing storage |
| --- | --- |
| `shift_sessions` | `shifts` |
| `shift_screenshots.shift_session_id` | `screenshots.shift_id` |
| `shift_screenshots.blur_status` | new `screenshots.is_blurred` |

Additive migrations add numeric observed-time fields, one-open-shift/break indexes, command retry receipts, transactional `tracker_transition` / `tracker_record_interval` functions, and `tracker_daily_summary`. Functions are `SECURITY INVOKER` with a fixed empty search path. Views use underlying RLS. Employees receive SELECT/INSERT/UPDATE only; no DELETE on either alias. Existing Phase 1 permissions, including employee-controlled pay rates/settings and editable totals, are preserved. Client-reported activity is not tamper-proof payroll evidence.

The project URL and **publishable** key in `src/background/config.ts` are public client configuration. No service-role keys or R2 credentials belong in this extension. The Phase 2 function and its R2 secrets are configured separately.

## Verification

`npm test` covers UI transitions, SSO destination/state validation, numeric-only messages, bounded observation accounting, midnight splits, mocked Supabase session persistence/refresh/logout, and offscreen compression/blur/size failure paths. `npm run build` runs strict TypeScript, bundles all MV3 entrypoints, and validates permissions, local fonts, icons and service-worker DOM separation.

`supabase/tests/tracker_runtime.sql` tests actual authenticated-role ownership and mutations in a transaction that rolls back, including UUID retries and overlap rejection. It creates no persistent test users, employee rows or screenshots. Live Chrome identity callbacks, restart/idle events, browser permission prompts, real Canvas rendering, and authenticated R2 uploads still require an installed-extension acceptance test. No live tracking or employee screenshot capture was used during development.
