import { createClient } from "@supabase/supabase-js";
import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";
import { assertAgentClaims, assertAgentEmployee } from "./access";

function configuredEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function publishableKey() {
  const direct = configuredEnv(["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
  if (direct) return direct;
  try {
    const values: unknown = JSON.parse(process.env["SUPABASE_PUBLISHABLE_KEYS"] ?? "{}");
    if (values && typeof values === "object" && !Array.isArray(values)) {
      const found = Object.values(values).find((v): v is string => typeof v === "string" && v.startsWith("sb_publishable_"));
      if (found) return found;
    }
  } catch { /* Try the legacy public key. */ }
  return configuredEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);
}

export async function supabaseForUser(ctx: ToolContext) {
  assertAgentClaims(ctx.getClaims() ?? {});
  const token = ctx.getToken();
  if (!token) throw new ToolError("OAuth sign-in is required.");
  const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const key = publishableKey();
  if (!url || !key) throw new ToolError("The Supabase connection is unavailable.");
  const sb = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error: userError } = await sb.auth.getUser(token);
  if (userError || !user.user || user.user.id !== ctx.getUserId()) throw new ToolError("Your sign-in expired. Reconnect Branta Hub.");
  const [{ data: active, error: activeError }, { data: profile, error: profileError }] = await Promise.all([
    sb.rpc("is_active_employee", { _user: user.user.id }),
    sb.from("profiles").select("must_change_password").eq("user_id", user.user.id).maybeSingle(),
  ]);
  if (activeError || profileError || !profile) throw new ToolError("Could not verify employee access.");
  assertAgentEmployee(active === true, profile.must_change_password, user.user.app_metadata?.password_reset_pending === true);
  return sb;
}