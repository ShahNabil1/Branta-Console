import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Client-callable server function to request a presigned upload URL for
 * Cloudflare R2. Every authenticated user of the console can call this; the
 * uploader must be signed in. When R2 credentials are set, this returns a
 * usable PUT url + object key.
 */
export const requestR2Upload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(200),
        scope: z.enum(["avatar", "attachment", "document", "lead", "branding"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { createPresignedPutUrl } = await import("./r2.server");
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${data.scope}/${context.userId}/${Date.now()}-${safeName}`;
    return createPresignedPutUrl({
      key,
      contentType: data.contentType,
      expiresInSeconds: 60 * 5,
    });
  });

/** Reads a branding image that already lives on our R2 public base (avoids browser CORS tainting). */
export const fetchBrandingImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ url: z.string().url().max(500) }).parse(data))
  .handler(async ({ data }) => {
    const base = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    if (!base || !data.url.startsWith(`${base}/branding/`)) throw new Error("Only saved company logos can be reused.");
    const res = await fetch(data.url);
    if (!res.ok) throw new Error(`Could not read the saved logo (${res.status}).`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 5 * 1024 * 1024) throw new Error("Saved logo is too large.");
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), type: res.headers.get("content-type") || "image/png" };
  });
