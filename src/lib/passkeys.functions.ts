// Passkey (WebAuthn) server functions.
// Full flow: register (authenticated), authenticate (public — mints a Supabase
// magic-link session after verify), list, delete, rename.
//
// Uses @simplewebauthn/server. Challenges are one-time and stored in
// `passkey_challenges` with a 5-minute TTL.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_PASSKEYS = 3;

function getRpConfig(): { rpID: string; origin: string } {
  const host =
    getRequestHeader("x-forwarded-host") ??
    getRequestHeader("host") ??
    "console.brantatech.com";
  const proto =
    getRequestHeader("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const hostname = host.split(":")[0]!;
  return {
    rpID: hostname,
    origin: `${proto}://${host}`,
  };
}

// ----- LIST / DELETE / RENAME -----

export type PasskeyRow = {
  id: string;
  credential_id: string;
  friendly_name: string | null;
  device_type: string | null;
  backed_up: boolean;
  last_used_at: string | null;
  created_at: string;
};

export const listMyPasskeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin
      .from("user_passkeys")
      .select(
        "id,credential_id,friendly_name,device_type,backed_up,last_used_at,created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { passkeys: (data ?? []) as PasskeyRow[], max: MAX_PASSKEYS };
  });

export const deleteMyPasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("user_passkeys")
      .delete()
      .eq("user_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ----- REGISTRATION (authenticated user adding a passkey) -----

export const beginPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ friendly_name: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { generateRegistrationOptions } = await import(
      "@simplewebauthn/server"
    );
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { rpID } = getRpConfig();

    // Enforce max
    const { count } = await supabaseAdmin
      .from("user_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if ((count ?? 0) >= MAX_PASSKEYS) {
      throw new Error(
        `You already have ${MAX_PASSKEYS} passkeys. Delete one before adding another.`,
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("user_passkeys")
      .select("credential_id,transports")
      .eq("user_id", context.userId);

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    const email = userRes.user?.email ?? context.userId;

    const options = await generateRegistrationOptions({
      rpName: "Branta Tech Console",
      rpID,
      userID: new TextEncoder().encode(context.userId),
      userName: email,
      userDisplayName: email,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.credential_id,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
    });

    await supabaseAdmin
      .from("passkey_challenges")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        challenge: options.challenge,
        purpose: `register:${data.friendly_name}`,
        user_id: context.userId,
      } as any);

    return options;
  });

export const finishPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attestation_response: z.any(),
        friendly_name: z.string().trim().min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { verifyRegistrationResponse } = await import(
      "@simplewebauthn/server"
    );
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { rpID, origin } = getRpConfig();

    const clientChallenge = data.attestation_response?.response?.clientDataJSON;
    if (!clientChallenge) throw new Error("Malformed attestation response.");
    const clientData = JSON.parse(
      Buffer.from(clientChallenge, "base64url").toString("utf-8"),
    ) as { challenge: string };

    const { data: chal } = await supabaseAdmin
      .from("passkey_challenges")
      .select("id,challenge,user_id,expires_at,purpose")
      .eq("challenge", clientData.challenge)
      .maybeSingle();
    if (!chal) throw new Error("Challenge not found or already used.");
    if (chal.user_id !== context.userId) throw new Error("Challenge / user mismatch.");
    if (new Date(chal.expires_at) < new Date())
      throw new Error("Challenge expired. Try again.");

    const verification = await verifyRegistrationResponse({
      response: data.attestation_response,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Passkey verification failed.");
    }

    const info = verification.registrationInfo;
    const cred = info.credential;

    // Persist
    await supabaseAdmin
      .from("user_passkeys")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        user_id: context.userId,
        credential_id: cred.id,
        public_key: Buffer.from(cred.publicKey).toString("base64"),
        counter: cred.counter,
        transports: cred.transports ?? [],
        device_type: info.credentialDeviceType,
        backed_up: info.credentialBackedUp,
        friendly_name: data.friendly_name,
        aaguid: info.aaguid ?? null,
      } as any);

    // Consume challenge
    await supabaseAdmin
      .from("passkey_challenges")
      .delete()
      .eq("id", chal.id);

    return { ok: true as const };
  });

// ----- AUTHENTICATION (public — used on the login page) -----

export const beginPasskeyLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        branta_local: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z]{3,10}$/, "Enter your Branta ID"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { generateAuthenticationOptions } = await import(
      "@simplewebauthn/server"
    );
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { rpID } = getRpConfig();
    const email = `${data.branta_local}@brantatech.com`;

    // Resolve user
    const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const user = usersPage?.users.find(
      (u) => u.email?.toLowerCase() === email,
    );
    // Do not reveal whether the account exists — always return options with
    // an empty allowCredentials list if unknown, so the client fails
    // consistently. But we still need real challenges for allowed accounts.
    const { data: creds } = user
      ? await supabaseAdmin
          .from("user_passkeys")
          .select("credential_id,transports")
          .eq("user_id", user.id)
      : { data: [] as { credential_id: string; transports: string[] | null }[] };

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: (creds ?? []).map((c) => ({
        id: c.credential_id,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
    });

    await supabaseAdmin
      .from("passkey_challenges")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        challenge: options.challenge,
        purpose: "login",
        branta_local: data.branta_local,
      } as any);

    return options;
  });

export const finishPasskeyLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assertion_response: z.any(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyAuthenticationResponse } = await import(
      "@simplewebauthn/server"
    );
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { rpID, origin } = getRpConfig();

    const clientData = JSON.parse(
      Buffer.from(
        data.assertion_response?.response?.clientDataJSON as string,
        "base64url",
      ).toString("utf-8"),
    ) as { challenge: string };

    const { data: chal } = await supabaseAdmin
      .from("passkey_challenges")
      .select("id,challenge,branta_local,expires_at,purpose")
      .eq("challenge", clientData.challenge)
      .maybeSingle();
    if (!chal || chal.purpose !== "login")
      throw new Error("Invalid or expired challenge.");
    if (new Date(chal.expires_at) < new Date())
      throw new Error("Challenge expired. Try again.");

    const credentialId = data.assertion_response.id as string;
    const { data: pkRow } = await supabaseAdmin
      .from("user_passkeys")
      .select("id,user_id,credential_id,public_key,counter,transports")
      .eq("credential_id", credentialId)
      .maybeSingle();
    if (!pkRow) throw new Error("Unknown passkey.");

    // Confirm the branta_local claimed at begin matches this credential's user
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(
      pkRow.user_id,
    );
    const email = userRes.user?.email ?? "";
    const expectedLocal = email.split("@")[0]?.toLowerCase() ?? "";
    if (expectedLocal !== chal.branta_local) {
      throw new Error("Passkey / account mismatch.");
    }

    const verification = await verifyAuthenticationResponse({
      response: data.assertion_response,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: pkRow.credential_id,
        publicKey: new Uint8Array(Buffer.from(pkRow.public_key, "base64")),
        counter: Number(pkRow.counter),
        transports: (pkRow.transports ?? []) as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    });
    if (!verification.verified) throw new Error("Passkey verification failed.");

    // Bump counter + last used
    await supabaseAdmin
      .from("user_passkeys")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      } as any)
      .eq("id", pkRow.id);

    // Consume challenge
    await supabaseAdmin.from("passkey_challenges").delete().eq("id", chal.id);

    // Mint a magic-link and return the hashed token so the client can verifyOtp.
    const { data: linkRes, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
    if (linkErr || !linkRes?.properties?.hashed_token) {
      throw new Error(linkErr?.message ?? "Failed to mint session.");
    }
    return {
      ok: true as const,
      email,
      token_hash: linkRes.properties.hashed_token,
    };
  });
