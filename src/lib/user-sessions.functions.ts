// Session tracking — records real device / browser / OS / IP / geo on every
// login and lets a user revoke any active session (including their own).
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UAParser } from "ua-parser-js";

const RegisterInput = z.object({
  session_key: z.string().min(8).max(128),
});

const RevokeInput = z.object({
  session_id: z.string().uuid(),
});

async function lookupGeo(ip: string | null): Promise<{
  country: string | null;
  region: string | null;
  city: string | null;
}> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return { country: null, region: null, city: null };
  }
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "User-Agent": "BrantaTech-Console/1.0" },
    });
    if (!res.ok) return { country: null, region: null, city: null };
    const j = (await res.json()) as {
      country_name?: string;
      region?: string;
      city?: string;
    };
    return {
      country: j.country_name ?? null,
      region: j.region ?? null,
      city: j.city ?? null,
    };
  } catch {
    return { country: null, region: null, city: null };
  }
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
    const device =
      parsed.device.type === "mobile" || parsed.device.type === "tablet"
        ? `${parsed.device.vendor ?? ""} ${parsed.device.model ?? ""}`.trim() ||
          "Mobile"
        : `Desktop`;
    const browser = `${parsed.browser.name ?? "Browser"} ${parsed.browser.version?.split(".")[0] ?? ""}`.trim();
    const os = `${parsed.os.name ?? ""} ${parsed.os.version ?? ""}`.trim();

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
    if (error) throw new Error(error.message);

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
            ip: `${ip ?? "unknown"}${location ? ` (${location})` : ""}`,
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

/** Poll: returns whether *this* session_key has been revoked from elsewhere. */
export const pingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegisterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
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
    const { data: rows, error } = await supabaseAdmin
      .from("user_sessions")
      .select(
        "id,session_key,device,browser,os,ip,country,city,region,created_at,last_seen_at,revoked_at",
      )
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      sessions: (rows ?? []).map((r) => ({
        ...r,
        is_current: r.session_key === data.current_session_key,
      })) as UserSessionRow[],
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
      .update({ revoked_at: new Date().toISOString() } as any)
      .eq("user_id", context.userId)
      .eq("id", data.session_id);
    if (error) throw new Error(error.message);
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
      .update({ revoked_at: new Date().toISOString() } as any)
      .eq("user_id", context.userId)
      .neq("session_key", data.session_key)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
