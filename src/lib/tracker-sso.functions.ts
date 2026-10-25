import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Branta Console → Tracker Extension single sign-on.
 *
 * The extension opens /sso/tracker via chrome.identity.launchWebAuthFlow with a
 * redirect_uri of https://<extension-id>.chromiumapp.org/... . After the
 * employee is signed in (password+2FA or passkey), this function issues a
 * short-lived HS256 token signed with TRACKER_SSO_SECRET. The tracker backend
 * verifies it with the same secret (iss=branta-console, aud=branta-tracker).
 */
export const TRACKER_REDIRECT_RE = /^https:\/\/([a-p]{32})\.chromiumapp\.org\/[^\s#]*$/;
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signHs256(payload: Record<string, unknown>, secret: string) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

export const issueTrackerToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ redirect_uri: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const m = TRACKER_REDIRECT_RE.exec(data.redirect_uri);
    if (!m) throw new Error("This sign-in link is not from the Branta Tracker extension.");
    const allowed = (process.env.TRACKER_EXTENSION_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowed.length && !allowed.includes(m[1])) {
      throw new Error("This extension is not approved for Branta sign-in.");
    }
    const secret = process.env.TRACKER_SSO_SECRET;
    if (!secret) throw new Error("Tracker sign-in is not configured yet.");

    const sb = context.supabase;
    const [{ data: prof }, { data: roles }, { data: userRes }] = await Promise.all([
      sb
        .from("profiles")
        .select("full_name, employee_code, job_role, avatar_url, deactivated_at")
        .eq("id", context.userId)
        .maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", context.userId),
      sb.auth.getUser(),
    ]);
    if (prof?.deactivated_at) throw new Error("Your account is deactivated.");

    const now = Math.floor(Date.now() / 1000);
    const token = await signHs256(
      {
        iss: "branta-console",
        aud: "branta-tracker",
        sub: context.userId,
        email: userRes.user?.email ?? null,
        name: prof?.full_name ?? null,
        employee_code: prof?.employee_code ?? null,
        job_role: prof?.job_role ?? null,
        avatar_url: prof?.avatar_url ?? null,
        roles: (roles ?? []).map((r) => r.role),
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
      },
      secret,
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("connected_apps").upsert(
      {
        user_id: context.userId,
        app: "tracker_extension",
        last_authorized_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "user_id,app" },
    );

    return { token, expires_in: TOKEN_TTL_SECONDS };
  });

export const listMyConnectedApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("connected_apps")
      .select("app, connected_at, last_authorized_at")
      .is("revoked_at", null)
      .order("connected_at");
    if (error) throw new Error("Could not load connected apps.");
    return data ?? [];
  });

export const disconnectMyApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ app: z.literal("tracker_extension") }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("connected_apps")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("app", data.app);
    if (error) throw new Error("Could not disconnect.");
    return { ok: true };
  });
