import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.1156.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.1156.0";

const EXPIRES_IN = 900;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

type Env = (name: string) => string | undefined;
type SignUpload = (storagePath: string, env: Env) => Promise<string>;

export async function signUpload(storagePath: string, env: Env): Promise<string> {
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET_NAME") || "brantaconsole";
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 configuration unavailable");
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    // Avoid an SDK-generated checksum for an empty body: the client supplies the image later.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    return await getSignedUrl(client, new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      ContentType: "image/webp",
    }), {
      expiresIn: EXPIRES_IN,
      signableHeaders: new Set(["content-type"]),
    });
  } finally {
    client.destroy();
  }
}

export function createHandler(deps: {
  env?: Env;
  fetch?: typeof fetch;
  sign?: SignUpload;
} = {}) {
  const env = deps.env ?? ((name: string) => Deno.env.get(name));
  const fetcher = deps.fetch ?? fetch;
  const sign = deps.sign ?? signUpload;

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Max-Age": "3600",
    });
    if (origin && EXTENSION_ORIGIN.test(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
    }
    const respond = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers });

    if (origin && !EXTENSION_ORIGIN.test(origin)) {
      return respond(403, { error: "Origin not allowed" });
    }
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      return respond(405, { error: "Method not allowed" });
    }
    const authorization = req.headers.get("authorization");
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      return respond(401, { error: "Valid caller JWT required" });
    }
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return respond(415, { error: "Content-Type must be application/json" });
    }
    let body: Record<string, unknown>;
    try {
      // Small metadata requests only. Cancel the stream if the limit is exceeded.
      const reader = req.body?.getReader();
      if (!reader) return respond(400, { error: "JSON body required" });
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          return respond(413, { error: "Request too large" });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed;
    } catch {
      return respond(400, { error: "Invalid JSON body" });
    }
    const { employee_id, timestamp, content_type } = body;
    if (typeof employee_id !== "string" || !UUID.test(employee_id) || content_type !== "image/webp") {
      return respond(400, { error: "employee_id must be a UUID and content_type must be image/webp" });
    }
    // Canonical UTC ISO 8601 prevents path injection and ambiguous date partitions.
    if (typeof timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
      return respond(400, { error: "timestamp must be canonical UTC ISO 8601, e.g. 2026-10-26T04:00:00.000Z" });
    }
    try {
      const supabaseUrl = env("SUPABASE_URL");
      const publishableKeys = env("SUPABASE_PUBLISHABLE_KEYS");
      const anonKey = (publishableKeys ? JSON.parse(publishableKeys).default : undefined) || env("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !anonKey) return respond(503, { error: "Authentication configuration unavailable" });
      // Auth verifies the token server-side; never trust a locally decoded JWT or user_metadata.
      const result = await fetcher(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: authorization, apikey: anonKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) {
        return result.status >= 500
          ? respond(503, { error: "Authentication service unavailable" })
          : respond(401, { error: "Invalid or expired caller JWT" });
      }
      const user = await result.json();
      if (typeof user.id !== "string" || user.role !== "authenticated") {
        return respond(401, { error: "Authenticated user required" });
      }
      if (user.id.toLowerCase() !== employee_id.toLowerCase()) {
        return respond(403, { error: "Cannot authorize uploads for another employee" });
      }
      const storagePath = `tracker/screenshots/${user.id.toLowerCase()}/${timestamp.slice(0, 10)}/${timestamp}.webp`;
      const uploadUrl = await sign(storagePath, env);
      return respond(200, { upload_url: uploadUrl, storage_path: storagePath, expires_in: EXPIRES_IN });
    } catch {
      // Do not log credentials, caller tokens, signed URLs, or provider error details.
      return respond(503, { error: "Upload authorization temporarily unavailable" });
    }
  };
}

if (import.meta.main) Deno.serve(createHandler());
