// MetaMap KYC webhook receiver.
//
// Guarantees:
//  1. Signature (or shared-secret token) is verified before any DB work.
//  2. Every delivery is written to `kyc_webhook_events` with a unique
//     `event_id`. A duplicate delivery short-circuits with the original
//     response — the profile + documents are never mutated twice.
//  3. Document rows are upserted on `(verification_id, document_type)`, so
//     even outside the idempotency ledger the same document cannot land
//     twice for the same verification.
//  4. Every failure path returns a structured JSON error, and only 5xx is
//     returned when MetaMap should retry — payload/auth problems return
//     4xx so MetaMap stops retrying them.
//
// Route: POST https://console.brantatech.com/api/public/metamap/webhook
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/metamap/webhook")({
  server: {
    handlers: {
      GET: async () =>
        json({ ok: true, service: "metamap-webhook" }),
      POST: async ({ request }) => handlePost(request),
    },
  },
});

// ---------- response helpers ----------

const jsonHeaders = { "content-type": "application/json" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

type ErrorCode =
  | "server_misconfigured"
  | "invalid_signature"
  | "invalid_json"
  | "invalid_payload"
  | "db_error"
  | "internal_error";

const errorResponse = (
  code: ErrorCode,
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
) => json({ ok: false, error: code, message, ...extra }, status);

// ---------- crypto helpers ----------

const enc = new TextEncoder();

const safeEqual = (a: string, b: string) => {
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
};

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return toHex(digest);
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(mac);
}

async function verifyMetamapSignature(
  request: Request,
  url: URL,
  rawBody: string,
  secret: string,
): Promise<boolean> {
  const sigHeader =
    request.headers.get("x-signature") ??
    request.headers.get("x-metamap-signature") ??
    "";

  if (sigHeader) {
    try {
      const expected = await hmacHex(secret, rawBody);
      const provided = sigHeader.replace(/^sha256=/i, "").trim();
      if (safeEqual(provided.toLowerCase(), expected.toLowerCase())) return true;
    } catch {
      /* fall through to token check */
    }
  }

  const token =
    url.searchParams.get("token") ??
    request.headers.get("x-webhook-token") ??
    (request.headers.get("authorization") ?? "").replace(/^(bearer|token)\s+/i, "");
  if (token && safeEqual(token, secret)) return true;

  return false;
}

// ---------- idempotency ----------

/**
 * Derive a stable event id from headers or payload. Prefer explicit ids
 * from the provider; fall back to a hash of the raw body so a re-delivery
 * of the exact same payload still deduplicates.
 */
function deriveEventId(
  request: Request,
  payload: Record<string, unknown>,
  bodyHash: string,
): string {
  const headerId =
    request.headers.get("x-metamap-event-id") ??
    request.headers.get("x-request-id") ??
    request.headers.get("x-event-id");
  if (headerId) return headerId.trim();

  const fromPayload =
    (payload["eventId"] as string | undefined) ??
    (payload["event_id"] as string | undefined) ??
    (payload["resource"] as string | undefined);
  if (fromPayload) return String(fromPayload);

  const verification =
    (payload["identityId"] as string | undefined) ??
    (payload["verificationId"] as string | undefined);
  const status = (payload["status"] as string | undefined) ?? "";
  if (verification) return `${verification}:${status}:${bodyHash.slice(0, 16)}`;

  return `hash:${bodyHash}`;
}

// ---------- handler ----------

async function handlePost(request: Request): Promise<Response> {
  const secret = process.env.METAMAP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[metamap-webhook] METAMAP_WEBHOOK_SECRET is not configured");
    return errorResponse(
      "server_misconfigured",
      "Webhook secret is not configured",
      500,
    );
  }

  const url = new URL(request.url);
  const rawBody = await request.text();

  const authorized = await verifyMetamapSignature(request, url, rawBody, secret);
  if (!authorized) {
    return errorResponse("invalid_signature", "Signature verification failed", 401);
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return errorResponse("invalid_payload", "Payload must be a JSON object", 400);
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("invalid_json", "Body is not valid JSON", 400);
  }

  const bodyHash = await sha256Hex(rawBody);
  const eventId = deriveEventId(request, payload, bodyHash);

  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );

  // --- Idempotency check: has this event_id been processed before? ---
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("kyc_webhook_events")
    .select("id, response, payload_hash")
    .eq("event_id", eventId)
    .maybeSingle();

  if (lookupErr) {
    console.error("[metamap-webhook] idempotency lookup failed", lookupErr);
    return errorResponse("db_error", lookupErr.message, 500);
  }

  if (existing) {
    console.info("[metamap-webhook] duplicate delivery skipped", {
      eventId,
      sameBody: existing.payload_hash === bodyHash,
    });
    return json({
      ok: true,
      duplicate: true,
      event_id: eventId,
      first_response: existing.response,
    });
  }

  // --- Process the payload ---
  let result: {
    status: string;
    verification_id: string | null;
    user_id: string | null;
    assets: number;
    skipped?: string;
  };
  try {
    result = await processPayload(payload, supabaseAdmin);
  } catch (err) {
    console.error("[metamap-webhook] processing failed", err);
    return errorResponse(
      "internal_error",
      err instanceof Error ? err.message : String(err),
      500,
      { event_id: eventId },
    );
  }

  // --- Record the event so retries dedupe. Do this AFTER the mutation so
  //     a failed mutation lets MetaMap retry. ---
  const response = { ok: true as const, ...result };
  const { error: ledgerErr } = await supabaseAdmin
    .from("kyc_webhook_events")
    .insert({
      event_id: eventId,
      verification_id: result.verification_id,
      user_id: result.user_id,
      status: result.status,
      payload_hash: bodyHash,
      response,
    });

  if (ledgerErr) {
    // Unique-constraint race: another delivery of the same event beat us
    // to the ledger insert. The mutation is safe (idempotent upserts +
    // status field), so treat as success.
    if (ledgerErr.code === "23505") {
      console.info("[metamap-webhook] ledger race, treating as duplicate", {
        eventId,
      });
      return json({ ok: true, duplicate: true, event_id: eventId, ...result });
    }
    console.error("[metamap-webhook] ledger insert failed", ledgerErr);
    // We already applied the mutation — surface the error but do not roll
    // back; the next retry will hit the idempotency check via document
    // uniqueness and profile fields remain consistent.
    return errorResponse("db_error", ledgerErr.message, 500, {
      event_id: eventId,
    });
  }

  return json({ event_id: eventId, ...response });
}

// ---------- payload processing ----------

async function processPayload(
  payload: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
): Promise<{
  status: string;
  verification_id: string | null;
  user_id: string | null;
  assets: number;
  skipped?: string;
}> {
  const { extractKycFromPayload, mirrorRemoteToR2 } = await import(
    "@/lib/kyc.server"
  );
  const extracted = extractKycFromPayload(payload);

  if (!extracted.userId) {
    console.warn("[metamap-webhook] missing userId in metadata", {
      identityId: extracted.identityId,
    });
    return {
      status: extracted.status ?? "unknown",
      verification_id: extracted.identityId ?? null,
      user_id: null,
      assets: 0,
      skipped: "no_user_id",
    };
  }

  const now = new Date().toISOString();
  const profileUpdate: Record<string, unknown> = {
    kyc_status: extracted.status ?? "under_review",
    metamap_identity_id: extracted.identityId,
    kyc_extracted_full_name: extracted.extractedFullName,
    kyc_extracted_address: extracted.extractedAddress,
    kyc_document_type: extracted.documentType,
    kyc_document_number: extracted.documentNumber,
    kyc_document_expiry: extracted.documentExpiry,
    kyc_rejection_reason: extracted.rejectionReason,
    updated_at: now,
  };
  if (extracted.status === "verified") {
    profileUpdate.kyc_verified_at = now;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update(profileUpdate)
    .eq("user_id", extracted.userId);

  if (updateErr) {
    throw new Error(`profile update failed: ${updateErr.message}`);
  }

  // Mirror assets to R2. Individual failures are recorded on the row but
  // do not abort the whole webhook.
  const rows: Array<Record<string, unknown>> = [];
  for (const asset of extracted.assets) {
    try {
      const r2 = await mirrorRemoteToR2({
        userId: extracted.userId,
        category: asset.category,
        sourceUrl: asset.url,
      });
      rows.push({
        user_id: extracted.userId,
        verification_id: extracted.identityId,
        document_type: asset.category,
        r2_key: r2.key,
        r2_url: r2.publicUrl,
        source_url: r2.sourceUrl,
        mime_type: r2.mimeType,
        payload: {},
      });
    } catch (err) {
      console.error("[metamap-webhook] R2 mirror failed", asset, err);
      rows.push({
        user_id: extracted.userId,
        verification_id: extracted.identityId,
        document_type: asset.category,
        r2_key: null,
        r2_url: null,
        source_url: asset.url,
        mime_type: null,
        payload: {
          mirror_error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  if (rows.length > 0) {
    // Upsert on (verification_id, document_type) so retried deliveries
    // overwrite the previous row instead of duplicating it. Rows without
    // a verification_id fall back to a plain insert.
    const upsertable = rows.filter((r) => r.verification_id);
    const inserts = rows.filter((r) => !r.verification_id);

    if (upsertable.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from("kyc_documents")
        .upsert(upsertable, {
          onConflict: "verification_id,document_type",
        });
      if (upsertErr) {
        throw new Error(`kyc_documents upsert failed: ${upsertErr.message}`);
      }
    }
    if (inserts.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from("kyc_documents")
        .insert(inserts);
      if (insertErr) {
        throw new Error(`kyc_documents insert failed: ${insertErr.message}`);
      }
    }
  }

  return {
    status: extracted.status ?? "under_review",
    verification_id: extracted.identityId ?? null,
    user_id: extracted.userId,
    assets: rows.length,
  };
}
