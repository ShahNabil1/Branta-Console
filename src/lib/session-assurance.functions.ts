import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export { sha256 as hashPasskeyGrant };

/** Binds the just-created auth session to the passkey sign-in (one-time grant). */
export const claimPasskeySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ grant: z.string().min(20).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const sid = (context.claims as { session_id?: string })?.session_id;
    if (!sid) throw new Error("Session could not be verified.");
    const { data: g } = await admin.from("passkey_login_grants")
      .delete().eq("grant_hash", await sha256(data.grant)).select("user_id,expires_at").maybeSingle();
    if (!g || g.user_id !== context.userId || new Date(g.expires_at) < new Date())
      throw new Error("Passkey sign-in expired. Try again.");
    await admin.from("passkey_sessions").upsert({ session_id: sid, user_id: context.userId });
    return { ok: true as const };
  });

/** Returns whether the current session satisfies two-factor (TOTP aal2 or passkey). */
export const getSessionAssurance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isStrongSession } = await import("./session-assurance.server");
    return { strong: await isStrongSession(context.supabase, context.claims, context.userId) };
  });
