# Tracker upload authorization

Repository: `brantatech/branta-tracker-extension`, target branch `main`.
Supabase project: `Branta Console - Chrome Extension` (`vvkzkmvsbmfczauiyaoh`).

POST `/functions/v1/tracker-upload-auth` with a Supabase user JWT in `Authorization: Bearer ...`, a project publishable key in `apikey`, and `Content-Type: application/json`:

```json
{"employee_id":"<caller auth user UUID>","timestamp":"2026-10-26T04:00:00.000Z","content_type":"image/webp"}
```

The function validates the JWT with Supabase Auth, requires its user ID to match `employee_id`, and returns `upload_url`, `storage_path`, and `expires_in: 900`. PUT the WebP bytes to `upload_url` with **exactly `Content-Type: image/webp`**. Treat signed URLs as temporary credentials; never log them. The URL permits PUT only, not downloads. It can be reused until expiry, including overwriting the same object key.

The timestamp must be canonical UTC ISO 8601 with milliseconds (`new Date().toISOString()`). The date directory is UTC. This Phase 2 contract uses `tracker/screenshots/{employee_id}/{YYYY-MM-DD}/{timestamp}.webp`. It supersedes the descriptive Phase 1 column comment that shows `tracking/{employee_code}/...`; the database text column accepts the new key and the migration is unchanged. This endpoint does not insert screenshot metadata into the database.

Configure server-side Supabase Edge Function secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and optionally `R2_BUCKET_NAME` (defaults to `brantaconsole`). Use bucket-scoped R2 credentials. Never commit secret values or put R2 credentials in the extension. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEYS` (with legacy `SUPABASE_ANON_KEY` fallback) are supplied by Supabase. Missing configuration fails closed with a sanitized 503 response.

The Supabase gateway requires a caller JWT (`verify_jwt = true`), and the handler also authenticates every POST with Supabase Auth. OPTIONS preflight is handled separately by the platform and handler. CORS reflects only valid Chrome extension origins, never a literal wildcard origin. Non-browser callers may omit Origin but still require a valid user JWT and matching employee ID.

Bucket CORS must retain existing rules and append this Cloudflare API rule:

```json
{"allowed":{"origins":["chrome-extension://*"],"methods":["GET","PUT","HEAD"],"headers":["*"]},"exposeHeaders":["ETag"],"maxAgeSeconds":3600}
```

No public bucket access is needed. CORS is not authorization. MIME signing enforces the header, not the contents of the uploaded bytes; this endpoint does not enforce file size, image validation, screenshot frequency, active shifts, or immutable objects. Those require a separate upload/finalization design. Employees retain the settings permissions requested in Phase 1.

From this directory run `npm ci`, `deno task check`, and `deno task test`. Tests use mocked Auth responses and synthetic signing credentials; they do not create users, employee rows, or R2 objects. Deploy this exact source with `supabase functions deploy tracker-upload-auth --project-ref vvkzkmvsbmfczauiyaoh` using the repository config.
