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
