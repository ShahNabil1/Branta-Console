---
name: r2-brand-assets
description: Use whenever adding, replacing or referencing an icon, logo, wordmark, illustration or other UI image in Branta Console. All such artwork is served from the company Cloudflare R2 bucket (console-cdn.brantatech.com/assets/...), never stored in the repo or as Lovable asset pointers.
---

# Branta Console artwork lives in Cloudflare R2

Never put image files (png, svg, webp, gif, jpg) or `.asset.json` pointers in `src/assets/` or `public/` for UI artwork. The single registry is `src/lib/brand-assets.ts`.

Favicons in `public/` and the server-embedded invoice PDF images in `src/lib/brand/company-images.server.ts` are the only exceptions.

## Using an existing image
1. Look for it in `src/lib/brand-assets.ts` (exported as e.g. `EMAIL_RESEND`, each `{ url }`).
2. Import it: `import { EMAIL_RESEND as resendLogo } from "@/lib/brand-assets";` then `<img src={resendLogo.url} />`.

## Adding a new image
1. Check the bucket first: `HEAD https://console-cdn.brantatech.com/assets/<folder>/<file>`; reuse it if it exists.
2. Otherwise upload the original file (unchanged bytes) to R2 key `assets/<folder>/<file>` with the S3 API:
   - endpoint `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto`, credentials `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, bucket `R2_BUCKET` (all already in env; never print them).
   - correct `ContentType`, `CacheControl: public, max-age=31536000, immutable`.
   - Run the upload script from the project root (so `@aws-sdk/client-s3` resolves) and delete it afterwards.
3. Verify the public URL returns 200 and the same SHA-256 as the uploaded file.
4. Register it in `src/lib/brand-assets.ts`: `export const FOLDER_NAME = asset("folder/file.png");`.
5. Because keys are cached immutably, replace artwork with a new file name instead of overwriting.

Folders: `apps/`, `companies/`, `company/`, `email/`, `integrations/`, root for Branta brand files.
