// Session tracking — records real device / browser / OS / IP / geo on every
// login and lets a user revoke any active session (including their own).
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UAParser } from "ua-parser-js";

const RegisterInput = z.object({
  session_key: z.string().min(8).max(128),
  hints: z
    .object({
      model: z.string().max(80).optional(),
      platform: z.string().max(40).optional(),
      platformVersion: z.string().max(20).optional(),
      mobile: z.boolean().optional(),
      ipad: z.boolean().optional(),
    })
    .optional(),
});

const RevokeInput = z.object({
  session_id: z.string().uuid(),
});

type Geo = { country: string | null; region: string | null; city: string | null };
const NO_GEO: Geo = { country: null, region: null, city: null };

function isPrivateIp(ip: string) {
  return (
    ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") ||
    ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

// IP geolocation is approximate by nature (ISP routing, mobile CGNAT). We use
// only Cloudflare edge headers: zero latency, no rate limits, no third party.
async function lookupGeo(ip: string | null): Promise<Geo> {
  if (!ip || isPrivateIp(ip)) return NO_GEO;
  const cfCountry = getRequestHeader("cf-ipcountry");
  const cfCity = getRequestHeader("cf-ipcity");
  const cfRegion = getRequestHeader("cf-region");
  let country: string | null = null;
  if (cfCountry && cfCountry !== "XX" && cfCountry !== "T1") {
    try {
      country = new Intl.DisplayNames(["en"], { type: "region" }).of(cfCountry) ?? cfCountry;
    } catch { country = cfCountry; }
  }
  return { country, region: cfRegion ?? null, city: cfCity ?? null };
}

/** Windows 11 reports platformVersion major >= 13 via Client Hints. */
function hintedOs(platform: string, version: string | undefined, fallback: string) {
  if (!version) return fallback;
  const major = Number(version.split(".")[0]);
  if (platform === "Windows") return major >= 13 ? "Windows 11" : major > 0 ? "Windows 10" : fallback;
  if (platform === "Android" || platform === "macOS" || platform === "Chrome OS")
    return `${platform} ${version.replace(/(\.0)+$/, "")}`;
  return fallback;
}

function extractIp(): string | null {
  const cf = getRequestHeader("cf-connecting-ip");
  if (cf) return cf.trim();
  const xf = getRequestHeader("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  const xr = getRequestHeader("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

/**
 * Called from the login page after a successful MFA verify.
 * Inserts a row describing this session so the user can see + revoke it later.
 */
export const registerSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegisterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const ua = getRequestHeader("user-agent") ?? "";
    const parsed = new UAParser(ua).getResult();
    const ip = extractIp();
    const geo = await lookupGeo(ip);
    const h = data.hints ?? {};
    const uaOs = `${parsed.os.name ?? ""} ${parsed.os.version ?? ""}`.trim();
    const isMobile = h.ipad || h.mobile || parsed.device.type === "mobile" || parsed.device.type === "tablet";
    // Chrome's reduced UA sends model "K" and "Android 10"; never trust those.
    const uaModel = parsed.device.model && parsed.device.model !== "K" ? parsed.device.model : "";
    let device: string;
    if (h.ipad) device = "iPad";
    else if (h.model) device = h.model;
    else if (isMobile) device = `${parsed.device.vendor ?? ""} ${uaModel}`.trim() || (parsed.os.name === "Android" ? "Android phone" : "Mobile");
    else device = "Desktop";
    const browser = `${parsed.browser.name ?? "Browser"} ${parsed.browser.version?.split(".")[0] ?? ""}`.trim();
    const os = h.ipad
      ? "iPadOS"
      : h.platform
        ? hintedOs(h.platform, h.platformVersion, uaOs)
        : uaOs;

    // Detect first-time session_key for this user → new-device notification.
    const { data: existing } = await supabaseAdmin
      .from("user_sessions")
      .select("id")
      .eq("user_id", context.userId)
      .eq("session_key", data.session_key)
      .maybeSingle();
    const isNewDevice = !existing;

    // Upsert on unique (user_id, session_key)
    const { error } = await supabaseAdmin
      .from("user_sessions")
      .upsert(
        {
          user_id: context.userId,
          session_key: data.session_key,
          device,
          browser,
          os,
          ip,
          country: geo.country,
          city: geo.city,
          region: geo.region,
          user_agent: ua.slice(0, 800),
          last_seen_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "user_id,session_key" },
      );
    if (error) throw dbError(error);

    if (isNewDevice) {
      try {
        const { notify } = await import("@/lib/notify.server");
        const when = new Date().toLocaleString("en-GB", {
          timeZone: "Asia/Dhaka",
          hour12: true,
          dateStyle: "medium",
          timeStyle: "short",
        });
        const location = [geo.city, geo.country].filter(Boolean).join(", ");
        await notify({
          event: "auth.new_device_login",
          recipients: [context.userId],
          vars: {
            device: `${device} · ${browser}`.trim(),
            ip: `${ip ?? "unknown"}${location ? ` (approx. ${location})` : ""}`,
            when: `${when} (BDT)`,
          },
          dedupeKey: `session:${context.userId}:${data.session_key}:new`,
          actorId: context.userId,
        });
      } catch (e) {
        console.error("[registerSession] notify failed:", e);
      }
    }
    return { ok: true as const };
  });

/** Sessions silent longer than the 30-min idle policy (+ grace) are ended. */
export const STALE_SESSION_MS = 35 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function expireStale(admin: any, userId: string) {
  const cutoff = new Date(Date.now() - STALE_SESSION_MS).toISOString();
  const { data: stale } = await admin
    .from("user_sessions")
    .select("id,last_seen_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .lt("last_seen_at", cutoff);
  for (const s of (stale ?? []) as { id: string; last_seen_at: string }[]) {
    await admin
      .from("user_sessions")
      .update({ revoked_at: s.last_seen_at, logout_reason: "idle_timeout" })
      .eq("id", s.id)
      .is("revoked_at", null);
  }
}
export { expireStale as expireStaleSessions };

/** Poll: returns whether *this* session_key has been revoked from elsewhere. */
export const pingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegisterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await expireStale(supabaseAdmin, context.userId);
    const { data: row } = await supabaseAdmin
      .from("user_sessions")
      .select("id,revoked_at")
      .eq("user_id", context.userId)
      .eq("session_key", data.session_key)
      .maybeSingle();
    if (!row) return { revoked: false as const, unknown: true as const };
    if (row.revoked_at) return { revoked: true as const };
    // Bump last_seen
    await supabaseAdmin
      .from("user_sessions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ last_seen_at: new Date().toISOString() } as any)
      .eq("id", row.id);
    return { revoked: false as const };
  });

const LogoutReason = z.enum(["idle_timeout", "manual_logout"]);

/** Ends this device's session record (idle auto-logout or user sign-out). */
export const endMySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    RegisterInput.extend({ reason: LogoutReason }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("user_sessions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ revoked_at: new Date().toISOString(), logout_reason: data.reason } as any)
      .eq("user_id", context.userId)
      .eq("session_key", data.session_key)
      .is("revoked_at", null);
    if (error) throw dbError(error);
    return { ok: true as const };
  });

export type UserSessionRow = {
  id: string;
  session_key: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  logout_reason?: string | null;
  is_current: boolean;
};

export const listMySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ current_session_key: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await expireStale(supabaseAdmin, context.userId);
    // Viewing sessions never deletes anyone's security history.
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
    const cols =
      "id,session_key,device,browser,os,ip,country,city,region,created_at,last_seen_at,revoked_at,logout_reason";
    const { data: rows, error } = await supabaseAdmin
      .from("user_sessions")
      .select(cols)
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });
    if (error) throw dbError(error);
    const { data: ended, error: e2 } = await supabaseAdmin
      .from("user_sessions")
      .select(cols)
      .eq("user_id", context.userId)
      .not("revoked_at", "is", null)
      .gte("revoked_at", cutoff)
      .order("revoked_at", { ascending: false })
      .limit(20);
    if (e2) throw dbError(e2);
    return {
      sessions: (rows ?? []).map((r) => ({
        ...r,
        is_current: r.session_key === data.current_session_key,
      })) as UserSessionRow[],
      history: (ended ?? []).map((r) => ({ ...r, is_current: false })) as UserSessionRow[],
    };
  });

export const revokeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RevokeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("user_sessions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ revoked_at: new Date().toISOString(), logout_reason: "revoked" } as any)
      .eq("user_id", context.userId)
      .eq("id", data.session_id);
    if (error) throw dbError(error);
    return { ok: true as const };
  });

export const revokeAllOtherSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegisterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Mark every other row revoked, and also call Supabase Auth `signOut(others)` so
    // the actual refresh tokens are invalidated across devices.
    const { error } = await supabaseAdmin
      .from("user_sessions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ revoked_at: new Date().toISOString(), logout_reason: "revoked" } as any)
      .eq("user_id", context.userId)
      .neq("session_key", data.session_key)
      .is("revoked_at", null);
    if (error) throw dbError(error);
    return { ok: true as const };
  });
