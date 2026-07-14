/**
 * Cloudflare R2 storage helper (server-only).
 *
 * Storage backend for Branta Tech Console is Cloudflare R2 — never Supabase
 * Storage. This file centralizes credentials + presigned URL generation so
 * every module (avatars, attachments, employee documents, lead files…) reads
 * from the same client.
 *
 * Required secrets (add via Lovable secrets before shipping uploads):
 *   R2_ACCOUNT_ID           Cloudflare account id
 *   R2_ACCESS_KEY_ID        R2 API token access key id
 *   R2_SECRET_ACCESS_KEY    R2 API token secret access key
 *   R2_BUCKET               Bucket name (e.g. "brantatech-console")
 *   R2_PUBLIC_BASE_URL      (optional) Public/CDN base URL for read access,
 *                           e.g. "https://cdn.brantatech.com". If unset,
 *                           only presigned reads are used.
 *
 * All webhooks / callbacks for R2 (if any) MUST target
 *   https://console.brantatech.com/api/public/webhooks/*
 */

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
  endpoint: string; // https://<account>.r2.cloudflarestorage.com
};

export function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Cloudflare R2 is not configured. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET in project secrets.",
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

/**
 * Placeholder for a presigned PUT URL. When credentials are wired up, swap
 * this for @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner against the R2
 * endpoint above. Kept as a stub so all upstream server functions can be
 * written now and start working the moment credentials are added.
 */
export async function createPresignedPutUrl(_params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; publicUrl: string | null; key: string }> {
  getR2Config(); // throws with a clear message when credentials are missing
  throw new Error(
    "R2 presigner not yet implemented. Install @aws-sdk/client-s3 and " +
      "@aws-sdk/s3-request-presigner, then generate a presigned PUT against " +
      "getR2Config().endpoint with region 'auto'.",
  );
}
