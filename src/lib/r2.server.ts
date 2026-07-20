/**
 * Cloudflare R2 storage helper (server-only).
 *
 * Storage backend for Branta Tech Console is Cloudflare R2 — never Supabase
 * Storage. Uses the S3-compatible API via @aws-sdk/client-s3.
 *
 * Required secrets:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_PUBLIC_BASE_URL (optional CDN base, e.g. https://cdn.brantatech.com)
 */

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
  endpoint: string;
};

export function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || undefined;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 not configured. Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET.",
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

export async function getR2Client(
  cfg: R2Config = getR2Config(),
): Promise<import("@aws-sdk/client-s3").S3Client> {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export async function createPresignedPutUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; publicUrl: string | null; key: string }> {
  const cfg = getR2Config();
  const [{ PutObjectCommand }, { getSignedUrl }, client] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
    getR2Client(cfg),
  ]);
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: params.key,
      ContentType: params.contentType,
    }),
    { expiresIn: params.expiresInSeconds ?? 900 },
  );
  const publicUrl = cfg.publicBaseUrl
    ? `${cfg.publicBaseUrl.replace(/\/$/, "")}/${params.key}`
    : null;
  return { url, publicUrl, key: params.key };
}

export async function createPresignedGetUrl(params: {
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const cfg = getR2Config();
  const [{ GetObjectCommand }, { getSignedUrl }, client] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
    getR2Client(cfg),
  ]);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: params.key }),
    { expiresIn: params.expiresInSeconds ?? 900 },
  );
}

export async function deleteObject(key: string): Promise<void> {
  const cfg = getR2Config();
  const [{ DeleteObjectCommand }, client] = await Promise.all([
    import("@aws-sdk/client-s3"),
    getR2Client(cfg),
  ]);
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

/**
 * Health check: verifies credentials + bucket accessibility.
 */
export async function checkR2Health(): Promise<{
  ok: boolean;
  bucket: string;
  endpoint: string;
  hasPublicBase: boolean;
  error?: string;
}> {
  try {
    const cfg = getR2Config();
    const [{ HeadBucketCommand }, client] = await Promise.all([
      import("@aws-sdk/client-s3"),
      getR2Client(cfg),
    ]);
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    return {
      ok: true,
      bucket: cfg.bucket,
      endpoint: cfg.endpoint,
      hasPublicBase: Boolean(cfg.publicBaseUrl),
    };
  } catch (err) {
    return {
      ok: false,
      bucket: process.env.R2_BUCKET ?? "(unset)",
      endpoint: process.env.R2_ACCOUNT_ID
        ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : "(unset)",
      hasPublicBase: Boolean(process.env.R2_PUBLIC_BASE_URL),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
