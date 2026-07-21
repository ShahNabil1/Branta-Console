// Change password: verify current, block reuse of current or previous.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { strongPasswordSchema } from "@/lib/branta-credentials";

const Input = z.object({
  current_password: z.string().min(1),
  new_password: strongPasswordSchema,
});

// PBKDF2 hash for history comparison — avoids storing plaintext.
async function hashPassword(pw: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pw),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

const HISTORY_SALT = "branta-tech-pw-history-v1";

export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { createClient } = await import("@supabase/supabase-js");

    // Get email so we can verify current password
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    const email = userData.user?.email;
    if (!email) throw new Error("User not found");

    if (data.current_password === data.new_password) {
      throw new Error("New password must be different from your current password.");
    }

    // Verify current password via GoTrue token endpoint directly.
    // Using fetch avoids supabase-js quirks (localStorage, GoTrueClient
    // singleton reuse across server-fn invocations) that can cause spurious
    // "Invalid login credentials" on Workers.
    const tokenRes = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY!}`,
        },
        body: JSON.stringify({ email, password: data.current_password }),
      },
    );
    if (!tokenRes.ok) {
      throw new Error("Current password is incorrect.");
    }


    // Check the new password against the history (last 1 entry).
    const newHash = await hashPassword(data.new_password, HISTORY_SALT);
    const currentHash = await hashPassword(data.current_password, HISTORY_SALT);

    const { data: history } = await supabaseAdmin
      .from("password_history")
      .select("password_hash,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastHash = history?.[0]?.password_hash ?? null;
    if (lastHash && lastHash === newHash) {
      throw new Error(
        "You cannot reuse your previous password. Choose a different one.",
      );
    }
    if (newHash === currentHash) {
      throw new Error("New password must be different from your current password.");
    }

    // Update the password.
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      context.userId,
      { password: data.new_password },
    );
    if (updateErr) throw new Error(updateErr.message);

    // Push the *previous* password hash to history so it can't be reused next time.
    await supabaseAdmin
      .from("password_history")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: context.userId, password_hash: currentHash } as any);

    // Clear the "must change password" onboarding flag if it was set — the
    // employee has now chosen their own personal password.
    await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ must_change_password: false } as any)
      .eq("user_id", context.userId);

    return { ok: true as const };
  });

