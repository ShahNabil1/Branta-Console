/**
 * KYC server helpers (server-only).
 *
 * - Mirrors MetaMap document/selfie images into our Cloudflare R2 bucket
 *   under kyc/{userId}/ so we own the artifacts (MetaMap URLs are signed
 *   and expire).
 * - Extracts the interesting fields from a MetaMap `verification_completed`
 *   payload into a shape that maps cleanly onto public.profiles.
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getR2Config } from "@/lib/r2.server";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export async function mirrorRemoteToR2(params: {
  userId: string;
  category: string; // e.g. "document-front", "selfie"
  sourceUrl: string;
}): Promise<{
  key: string;
  publicUrl: string | null;
  mimeType: string;
  sourceUrl: string;
}> {
  const cfg = getR2Config();
  const client = getR2Client(cfg);

  const res = await fetch(params.sourceUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch KYC asset ${params.sourceUrl}: ${res.status} ${res.statusText}`,
    );
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  const buf = new Uint8Array(await res.arrayBuffer());

  const safeCategory = params.category.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `kyc/${params.userId}/${Date.now()}-${safeCategory}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buf,
      ContentType: mimeType,
    }),
  );

  const publicUrl = cfg.publicBaseUrl
    ? `${cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`
    : null;

  return { key, publicUrl, mimeType, sourceUrl: params.sourceUrl };
}

// ---------- Payload extraction ----------

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

/**
 * Best-effort extraction from MetaMap's `verification_completed` /
 * `verification_updated` payloads. MetaMap ships different shapes across
 * flows; we defensively pick from all the common locations and fall back
 * to null when a field is missing.
 */
export interface ExtractedKyc {
  userId: string | null;
  identityId: string | null;
  status: "under_review" | "verified" | "rejected" | null;
  rejectionReason: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentExpiry: string | null;
  extractedFullName: string | null;
  extractedAddress: string | null;
  /** { category → source URL } */
  assets: Array<{ category: string; url: string }>;
}

const STATUS_MAP: Record<string, ExtractedKyc["status"]> = {
  verified: "verified",
  reviewneeded: "under_review",
  review_needed: "under_review",
  running: "under_review",
  pending: "under_review",
  rejected: "rejected",
  failed: "rejected",
  denied: "rejected",
};

const canonStatus = (raw: unknown): ExtractedKyc["status"] => {
  const key = String(raw ?? "").toLowerCase().replace(/[^a-z_]/g, "");
  return STATUS_MAP[key] ?? "under_review";
};

const readField = (fields: unknown, key: string): string | null => {
  if (!isObj(fields)) return null;
  const f = fields[key];
  if (isObj(f)) return asStr((f as Json).value);
  return asStr(f);
};

export function extractKycFromPayload(payload: unknown): ExtractedKyc {
  const p = isObj(payload) ? payload : {};

  const metadata = isObj(p.metadata) ? p.metadata : {};
  const identity = isObj(p.identity) ? p.identity : {};

  const userId =
    asStr(metadata.userId) ??
    asStr(metadata.user_id) ??
    asStr((identity as Json).userId) ??
    null;

  const identityId =
    asStr(p.identityId) ??
    asStr(p.identity_id) ??
    asStr((identity as Json).id) ??
    asStr(p.resource) ??
    null;

  const status = canonStatus(
    p.identityStatus ?? p.status ?? (identity as Json).status,
  );

  // Documents can appear at top-level or nested under `resource`.
  const documents: Json[] = [];
  const collect = (arr: unknown) => {
    if (Array.isArray(arr)) arr.filter(isObj).forEach((d) => documents.push(d));
  };
  collect(p.documents);
  if (isObj(p.resource)) collect((p.resource as Json).documents);

  const primaryDoc = documents[0] ?? {};
  const fields = (primaryDoc as Json).fields;

  const documentType = asStr((primaryDoc as Json).type);
  const documentNumber =
    readField(fields, "documentNumber") ??
    readField(fields, "documentNumberCheckDigit") ??
    null;
  const documentExpiry = readField(fields, "expirationDate");
  const extractedFullName =
    readField(fields, "fullName") ??
    [readField(fields, "firstName"), readField(fields, "lastName")]
      .filter(Boolean)
      .join(" ") ||
    null;
  const extractedAddress = readField(fields, "address");

  const assets: ExtractedKyc["assets"] = [];

  // Document photos
  documents.forEach((doc, idx) => {
    const photos = (doc as Json).photos;
    if (Array.isArray(photos)) {
      photos.forEach((ph, i) => {
        const url = typeof ph === "string" ? ph : asStr((isObj(ph) ? (ph as Json).url : null));
        if (url) {
          const side = i === 0 ? "front" : i === 1 ? "back" : `page-${i + 1}`;
          const type = asStr((doc as Json).type) ?? `document-${idx + 1}`;
          assets.push({ category: `${type}-${side}`, url });
        }
      });
    }
    const video = asStr((doc as Json).videos);
    if (video) assets.push({ category: `document-${idx + 1}-video`, url: video });
  });

  // Selfie / biometrics
  const steps = Array.isArray(p.steps) ? p.steps : [];
  for (const s of steps) {
    if (!isObj(s)) continue;
    const id = asStr(s.id);
    const data = isObj(s.data) ? s.data : {};
    if (id === "selfie" || id === "liveness" || id === "biometric") {
      const url =
        asStr(data.selfieUrl) ??
        asStr(data.photoUrl) ??
        asStr(data.url);
      if (url) assets.push({ category: "selfie", url });
    }
  }
  // Some flows put selfie at the top level.
  const topSelfie = asStr((p as Json).selfieUrl);
  if (topSelfie) assets.push({ category: "selfie", url: topSelfie });

  const rejectionReason =
    asStr((p as Json).rejectionReason) ??
    asStr((identity as Json).rejectionReason) ??
    null;

  return {
    userId,
    identityId,
    status,
    rejectionReason,
    documentType,
    documentNumber,
    documentExpiry,
    extractedFullName,
    extractedAddress,
    assets,
  };
}
