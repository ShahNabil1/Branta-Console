// Reset password while signed in, WITHOUT the current password.
// The user must prove identity with a fresh TOTP code or a passkey
// assertion. Same strong policy as change-password; reuse of the current
// or recent previous passwords is rejected.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { strongPasswordSchema } from "@/lib/branta-credentials";

function rpConfig() {
  const host = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host") ?? "console.brantatech.com";
  const proto = getRequestHeader("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { rpID: host.split(":")[0]!, origin: `${proto}://${host}` };
}

export const beginPasswordResetPasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: creds } = await supabaseAdmin
      .from("user_passkeys")
      .select("credential_id,transports")
      .eq("user_id", context.userId);
    if (!creds?.length) throw new Error("You have no passkeys. Use your authenticator code instead.");
    const options = await generateAuthenticationOptions({
      rpID: rpConfig().rpID,
      userVerification: "required",
      allowCredentials: creds.map((c) => ({
        id: c.credential_id,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
    });
    await supabaseAdmin
      .from("passkey_challenges")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ challenge: options.challenge, purpose: "password_reset", user_id: context.userId } as any);
    return options;
  });

const ResetInput = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("totp"),
    code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator."),
    new_password: strongPasswordSchema,
  }),
  z.object({
    method: z.literal("passkey"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assertion_response: z.any(),
    new_password: strongPasswordSchema,
  }),
]);

export const resetMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashPassword, HISTORY_SALT } = await import("@/lib/password-hash.server");

    // ---- 1. Verify identity ----
    if (data.method === "totp") {
      const f = await context.supabase.auth.mfa.listFactors();
      const totp = (f.data?.totp ?? []).find((x) => x.status === "verified");
      if (!totp) throw new Error("Two-factor authentication is not set up.");
      const ch = await context.supabase.auth.mfa.challenge({ factorId: totp.id });
      if (ch.error) throw new Error("Could not start verification. Try again.");
      const vr = await context.supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.data.id, code: data.code });
      if (vr.error) throw new Error("Invalid authenticator code. Please try again.");
    } else {
      const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
      const raw = data.assertion_response?.response?.clientDataJSON;
      if (typeof raw !== "string") throw new Error("Malformed passkey response.");
      const clientData = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8")) as { challenge: string };
      const { data: chal } = await supabaseAdmin
        .from("passkey_challenges")
        .select("id,challenge,user_id,expires_at,purpose")
        .eq("challenge", clientData.challenge)
        .maybeSingle();
      if (!chal || chal.purpose !== "password_reset" || chal.user_id !== context.userId)
        throw new Error("Invalid or expired passkey challenge.");
      if (new Date(chal.expires_at) < new Date()) throw new Error("Passkey challenge expired. Try again.");
      const { data: pk } = await supabaseAdmin
        .from("user_passkeys")
        .select("id,user_id,credential_id,public_key,counter,transports")
        .eq("credential_id", data.assertion_response.id as string)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!pk) throw new Error("This passkey does not belong to your account.");
      const { rpID, origin } = rpConfig();
      const v = await verifyAuthenticationResponse({
        response: data.assertion_response,
        expectedChallenge: chal.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: pk.credential_id,
          publicKey: new Uint8Array(Buffer.from(pk.public_key, "base64")),
          counter: Number(pk.counter),
          transports: (pk.transports ?? []) as AuthenticatorTransport[],
        },
        requireUserVerification: false,
      });
      await supabaseAdmin.from("passkey_challenges").delete().eq("id", chal.id);
      if (!v.verified) throw new Error("Passkey verification failed.");
      await supabaseAdmin
        .from("user_passkeys")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() } as any)
        .eq("id", pk.id);
    }

    // ---- 2. Reject reuse of current / previous passwords ----
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = userData.user?.email;
    if (!email) throw new Error("User not found");
    const probe = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_PUBLISHABLE_KEY! },
      body: JSON.stringify({ email, password: data.new_password }),
    });
    if (probe.ok) throw new Error("New password must be different from your current password.");
    const newHash = await hashPassword(data.new_password, HISTORY_SALT);
    const { data: history } = await supabaseAdmin
      .from("password_history")
      .select("password_hash")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if ((history ?? []).some((h) => h.password_hash === newHash))
      throw new Error("You cannot reuse a previous password. Choose a different one.");

    // ---- 3. Update ----
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.new_password });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("password_history")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: context.userId, password_hash: newHash } as any);

    try {
      const { notify } = await import("@/lib/notify.server");
      const when = new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: true, dateStyle: "medium", timeStyle: "short" });
      await notify({
        event: "auth.password_changed",
        recipients: [context.userId],
        vars: { when: `${when} (BDT)` },
        dedupeKey: `pwd:${context.userId}:reset:${Date.now()}`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[resetMyPassword] notify failed:", e);
    }
    return { ok: true as const };
  });
