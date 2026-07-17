/**
 * Didit outbound webhook receiver.
 *
 * URL:  https://console.brantatech.com/api/public/didit/webhook
 * Env:  DIDIT_WEBHOOK_SECRET (per-destination `secret_shared_key`)
 * Docs: https://docs.didit.me/integration/webhooks
 *
 * Behaviour (per Didit spec):
 *   1. Read raw request body — never re-stringify before verifying.
 *   2. Verify one of X-Signature-V2 / X-Signature / X-Signature-Simple
 *      using HMAC-SHA256 and the destination secret.
 *   3. Reject payloads older than 300 s (X-Timestamp).
 *   4. Idempotently upsert into `kyc_webhook_events` keyed on event_id.
 *   5. Apply status → profiles + append decision to kyc_documents.
 *   6. Return 200 quickly. Retries only fire on 5xx / 404.
 */
import { createFileRoute } from "@tanstack/react-router";

const MAX_SKEW_SECONDS = 300;
const encoder = new TextEncoder();

// ---------- Signature helpers (Web Crypto — Workers-safe) ----------

async function hmacSha256Hex(secret: string, message: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, message as BufferSource);
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Recursively sort object keys. Arrays keep their order. Used for
 * X-Signature-V2 canonical JSON — matches Python's
 * `json.dumps(sort_keys=True, ensure_ascii=False, separators=(",", ":"))`.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = canonicalize(obj[key]);
    return out;
  }
  return value;
}

function canonicalJsonString(payload: unknown): string {
  // JSON.stringify uses default separators (",",":"), which match Didit.
  // Unicode is preserved by default (no ensure_ascii equivalent needed).
  return JSON.stringify(canonicalize(payload));
}

// ---------- Route ----------

export const Route = createFileRoute("/api/public/didit/webhook")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, endpoint: "didit-webhook", ts: Date.now() }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      POST: async ({ request }) => {
        const secret = process.env.DIDIT_WEBHOOK_SECRET;
        if (!secret) return json(500, { error: "DIDIT_WEBHOOK_SECRET not configured" });

        const rawBody = await request.text();
        const rawBytes = encoder.encode(rawBody);

        const sigV2 = request.headers.get("x-signature-v2") ?? "";
        const sigRaw = request.headers.get("x-signature") ?? "";
        const sigSimple = request.headers.get("x-signature-simple") ?? "";
        const timestampHeader = request.headers.get("x-timestamp") ?? "";

        // ---- Timestamp freshness (skip when absent to allow console "Try Webhook") ----
        if (timestampHeader) {
          const ts = Number(timestampHeader);
          if (!Number.isFinite(ts)) return json(400, { error: "Invalid X-Timestamp" });
          const nowSec = Math.floor(Date.now() / 1000);
          if (Math.abs(nowSec - ts) > MAX_SKEW_SECONDS) {
            return json(401, { error: "Stale webhook" });
          }
        }

        // ---- Parse payload (needed for canonical JSON + simple fallback) ----
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return json(400, { error: "Invalid JSON" });
        }

        // ---- Verify signature (V2 preferred → raw → simple) ----
        let verified = false;
        let scheme: "v2" | "raw" | "simple" | null = null;

        if (sigV2) {
          const canonical = encoder.encode(canonicalJsonString(payload));
          const expected = await hmacSha256Hex(secret, canonical);
          if (constantTimeEqualHex(expected, sigV2.toLowerCase())) {
            verified = true;
            scheme = "v2";
          }
        }
        if (!verified && sigRaw) {
          const expected = await hmacSha256Hex(secret, rawBytes);
          if (constantTimeEqualHex(expected, sigRaw.toLowerCase())) {
            verified = true;
            scheme = "raw";
          }
        }
        if (!verified && sigSimple && timestampHeader) {
          const sessionId = String(payload.session_id ?? payload.business_session_id ?? "");
          const status = String(payload.status ?? "");
          const webhookType = String(payload.webhook_type ?? "");
          const simplePayload = `${timestampHeader}:${sessionId}:${status}:${webhookType}`;
          const expected = await hmacSha256Hex(secret, encoder.encode(simplePayload));
          if (constantTimeEqualHex(expected, sigSimple.toLowerCase())) {
            verified = true;
            scheme = "simple";
          }
        }

        if (!verified) {
          console.error("[didit-webhook] signature mismatch", {
            hasV2: !!sigV2,
            hasRaw: !!sigRaw,
            hasSimple: !!sigSimple,
            webhook_type: payload.webhook_type,
          });
          return json(401, { error: "Invalid signature" });
        }

        // ---- Process (idempotent) ----
        try {
          await processEvent(payload, scheme);
        } catch (err) {
          console.error("[didit-webhook] processing error", err);
          // Return 200 anyway so Didit doesn't retry on transient DB blips —
          // the event stays in kyc_webhook_events for reconciliation.
          return json(200, { ok: true, processed: false });
        }

        return json(200, { ok: true, scheme });
      },
    },
  },
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---------- Event handling ----------

type Json = Record<string, unknown>;

const STATUS_MAP: Record<string, "verified" | "rejected" | "under_review" | "not_verified"> = {
  Approved: "verified",
  Declined: "rejected",
  "In Review": "under_review",
  "In Progress": "under_review",
  Resubmitted: "under_review",
  "Not Started": "not_verified",
  Abandoned: "not_verified",
  Expired: "not_verified",
  "KYC Expired": "not_verified",
};

async function processEvent(payload: Json, scheme: string | null) {
  const eventId = String(payload.event_id ?? "");
  const webhookType = String(payload.webhook_type ?? "");
  const sessionId = (payload.session_id ?? payload.business_session_id ?? null) as string | null;
  const status = String(payload.status ?? "");
  const vendorData = (payload.vendor_data ?? null) as string | null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Idempotency — if we've seen this event_id, no-op.
  if (eventId) {
    const { data: existing } = await supabaseAdmin
      .from("kyc_webhook_events")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();
    if (existing) return;

    await supabaseAdmin
      .from("kyc_webhook_events")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        event_id: eventId,
        provider: "didit",
        webhook_type: webhookType,
        session_id: sessionId,
        signature_scheme: scheme,
        payload,
      } as any);
  }

  // We only mutate profile state for session-level status changes.
  const isSessionEvent =
    webhookType === "status.updated" || webhookType === "data.updated";
  if (!isSessionEvent || !sessionId) return;

  // Resolve the user: prefer vendor_data (we set it to auth user_id when
  // creating the session), otherwise look up by didit_session_id.
  let userId: string | null = vendorData;
  if (!userId) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("didit_session_id", sessionId)
      .maybeSingle();
    userId = prof?.user_id ?? null;
  }
  if (!userId) return;

  const kycStatus = STATUS_MAP[status] ?? "under_review";
  const decision = (payload.decision ?? null) as Json | null;

  const extracted = extractIdFields(decision);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    didit_session_id: sessionId,
    kyc_status: kycStatus,
    updated_at: now,
  };
  if (kycStatus === "verified") {
    patch.kyc_verified_at = now;
    patch.kyc_rejection_reason = null;
  }
  if (kycStatus === "rejected") {
    patch.kyc_rejection_reason = extractDeclineReason(decision) ?? status;
  }
  if (extracted.documentType) patch.kyc_document_type = extracted.documentType;
  if (extracted.documentNumber) patch.kyc_document_number = extracted.documentNumber;
  if (extracted.documentExpiry) patch.kyc_document_expiry = extracted.documentExpiry;
  if (extracted.fullName) patch.kyc_extracted_full_name = extracted.fullName;
  if (extracted.address) patch.kyc_extracted_address = extracted.address;

  await supabaseAdmin
    .from("profiles")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("user_id", userId);

  // Append full decision snapshot for audit.
  if (decision) {
    await supabaseAdmin
      .from("kyc_documents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        user_id: userId,
        verification_id: sessionId,
        document_type: `didit_${webhookType}`,
        r2_key: null,
        r2_url: null,
        source_url: null,
        mime_type: "application/json",
        payload: { status, decision, event_id: eventId },
      } as any);
  }
}

// ---------- Decision field extraction (Didit V3) ----------

interface Extracted {
  documentType: string | null;
  documentNumber: string | null;
  documentExpiry: string | null;
  fullName: string | null;
  address: string | null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function asObj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function extractIdFields(decision: Json | null): Extracted {
  const empty: Extracted = {
    documentType: null,
    documentNumber: null,
    documentExpiry: null,
    fullName: null,
    address: null,
  };
  if (!decision) return empty;

  // decision.id_verifications: [{ document_type, document_number, expiration_date, first_name, last_name, address, ... }]
  const list = Array.isArray(decision.id_verifications)
    ? (decision.id_verifications as unknown[])
    : [];
  const first = asObj(list[0]) ?? {};

  const fullName =
    asStr(first.full_name) ??
    [asStr(first.first_name), asStr(first.last_name)].filter(Boolean).join(" ") ||
    null;

  return {
    documentType: asStr(first.document_type),
    documentNumber: asStr(first.document_number),
    documentExpiry: asStr(first.expiration_date) ?? asStr(first.date_of_expiry),
    fullName,
    address: asStr(first.address) ?? asStr(first.formatted_address),
  };
}

function extractDeclineReason(decision: Json | null): string | null {
  if (!decision) return null;
  const reviews = Array.isArray(decision.reviews) ? (decision.reviews as unknown[]) : [];
  for (const r of reviews) {
    const o = asObj(r);
    const reason = asStr(o?.comment) ?? asStr(o?.reason);
    if (reason) return reason;
  }
  const idv = Array.isArray(decision.id_verifications)
    ? (decision.id_verifications as unknown[])
    : [];
  for (const item of idv) {
    const o = asObj(item);
    const warnings = Array.isArray(o?.warnings) ? o!.warnings : [];
    if (warnings.length > 0) {
      const w = asObj(warnings[0]);
      const msg = asStr(w?.description) ?? asStr(w?.risk) ?? asStr(warnings[0]);
      if (msg) return msg;
    }
  }
  return null;
}
