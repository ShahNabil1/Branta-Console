# Clean white loading screen with full logo

When you open the Console or sign in, the colourful animated loading screen (rings, bars, tinted gradient background) is replaced with a simple one:

- Pure white background, no colour gradients.
- The full Branta Tech logo (icon + name), centred, instead of only the round icon.
- One calm motion only: the logo gently fades in, with a thin orange progress line under it. No pulsing rings, bouncing dots or "System synchronized" chart animation.
- Same screen on first page load, after sign-in, and on refresh, so it never flashes between two designs.

Nothing else changes: login steps, 2FA, timing of when the app appears all stay the same.

## Technical details
- `src/routes/__root.tsx`: boot splash CSS -> `background:#fff`, render `BRAND_LOGO` (full wordmark from R2 registry) instead of the round icon/core/ring; remove ring/core keyframes; keep data-booting/booted logic.
- `src/components/branta/chart-preloader.tsx` + `.css`: render the same white screen with the full logo and a thin brand progress bar; keep `PRELOADER_CYCLE_MS`, `leaving` fade and `markBooted()` contract so `app.tsx` and `login.tsx` work unchanged (shorten cycle to ~1.2s so it doesn't linger).
- Respect prefers-reduced-motion.
