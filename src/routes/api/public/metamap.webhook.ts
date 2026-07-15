// MetaMap KYC webhook receiver.
// MetaMap posts `verification_completed` (and status updates) here after a
// user finishes their MetaMap flow. We verify the signature, extract the
// bits we care about, mirror document/selfie images into R2, and update
// the user's profile + kyc_documents table.
//
// Route: POST https://console.brantatech.com/api/public/metamap-webhook
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/metamap/webhook")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, service: "metamap-webhook" }),
          { headers: { "content-type": "application/json" } },
        ),
      POST: async ({ request }) => handlePost(request),
    },
  },
});

// ---------- helpers ----------

const jsonHeaders = { "content-type": "application/json" };

// Constant-time compare using Web-standard APIs (Workers-safe).
const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
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

/**
 * MetaMap signs each webhook with HMAC-SHA256 of the raw body using the
 * webhook secret from the dashboard. The signature is delivered in the
 * `x-signature` header as hex.
 *
 * We ALSO accept `x-webhook-token` / `?token=` as a fallback shared-secret
 * so a plain HTTPS callback (no signing) can still be authenticated during
 * initial setup or when using MetaMap's simpler outbound integration.
 */
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
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const mac = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(rawBody),
      );
      const expected = toHex(mac);
      // Some senders prefix "sha256=" — strip it.
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

// ---------- handler ----------

async function handlePost(request: Request): Promise<Response> {
  const secret = process.env.METAMAP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[metamap-webhook] METAMAP_WEBHOOK_SECRET is not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const url = new URL(request.url);
  const rawBody = await request.text();

  const ok = await verifyMetamapSignature(request, url, rawBody, secret);
  if (!ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { extractKycFromPayload, mirrorRemoteToR2 } = await import(
    "@/lib/kyc.server"
  );
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );

  const extracted = extractKycFromPayload(payload);
  if (!extracted.userId) {
    console.warn("[metamap-webhook] missing userId in metadata", {
      identityId: extracted.identityId,
    });
    return new Response(
      JSON.stringify({ ok: true, skipped: "no_user_id" }),
      { headers: jsonHeaders },
    );
  }

  // Update the profile row atomically.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(profileUpdate as any)
    .eq("user_id", extracted.userId);

  if (updateErr) {
    console.error("[metamap-webhook] profile update failed", updateErr);
    return new Response(`DB error: ${updateErr.message}`, { status: 500 });
  }

  // Mirror each asset into R2 and record it. Failures on individual assets
  // must not abort the whole webhook — record what we can.
  const mirrored: Array<{
    user_id: string;
    verification_id: string | null;
    document_type: string;
    r2_key: string | null;
    r2_url: string | null;
    source_url: string;
    mime_type: string | null;
    payload: Record<string, unknown>;
  }> = [];

  for (const asset of extracted.assets) {
    try {
      const r2 = await mirrorRemoteToR2({
        userId: extracted.userId,
        category: asset.category,
        sourceUrl: asset.url,
      });
      mirrored.push({
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
      mirrored.push({
        user_id: extracted.userId,
        verification_id: extracted.identityId,
        document_type: asset.category,
        r2_key: null,
        r2_url: null,
        source_url: asset.url,
        mime_type: null,
        payload: { mirror_error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  if (mirrored.length > 0) {
    const { error: insertErr } = await supabaseAdmin
      .from("kyc_documents")
      .insert(mirrored);
    if (insertErr) {
      console.error("[metamap-webhook] kyc_documents insert failed", insertErr);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      status: extracted.status,
      assets: mirrored.length,
    }),
    { headers: jsonHeaders },
  );
}
