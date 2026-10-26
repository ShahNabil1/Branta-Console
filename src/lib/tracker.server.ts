import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Server-only client for the separate Branta Tracker Supabase project.
 * Uses TRACKER_SUPABASE_URL + TRACKER_SUPABASE_SERVICE_ROLE_KEY; never import from client code.
 */
export function trackerAdmin(): SupabaseClient {
  const url = process.env.TRACKER_SUPABASE_URL;
  const key = process.env.TRACKER_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Tracker connection is not configured yet.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type ConsoleIdentity = {
  console_user_id: string;
  email: string;
  name: string | null;
  employee_code: string | null;
  job_role: string | null;
  avatar_url: string | null;
  roles: string[];
};

async function findByEmail(sb: SupabaseClient, email: string): Promise<User | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Tracker lookup failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Create-or-update exactly one Tracker user per Console employee (matched by email). */
export async function ensureTrackerUser(id: ConsoleIdentity): Promise<User> {
  const sb = trackerAdmin();
  const app_metadata = { console_user_id: id.console_user_id, roles: id.roles, provider: "branta-console" };
  const user_metadata = {
    full_name: id.name,
    employee_code: id.employee_code,
    job_role: id.job_role,
    avatar_url: id.avatar_url,
  };
  const existing = await findByEmail(sb, id.email);
  if (existing) {
    // Keep Console-managed keys such as shift_schedule while refreshing identity fields.
    const { data, error } = await sb.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...(existing.app_metadata ?? {}), ...app_metadata },
      user_metadata: { ...(existing.user_metadata ?? {}), ...user_metadata },
    });
    if (error) throw new Error(`Tracker update failed: ${error.message}`);
    return data.user;
  }
  const { data, error } = await sb.auth.admin.createUser({
    email: id.email,
    email_confirm: true,
    app_metadata,
    user_metadata,
  });
  if (error) {
    // Race: another sign-in created it a moment ago.
    const again = await findByEmail(sb, id.email);
    if (again) return again;
    throw new Error(`Tracker create failed: ${error.message}`);
  }
  return data.user;
}

/** Mint a normal Tracker Supabase session (access + refresh token) for that user. */
export async function mintTrackerSession(email: string) {
  const sb = trackerAdmin();
  const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw new Error(`Tracker session failed: ${error?.message ?? "no token"}`);
  const { data: v, error: vErr } = await sb.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (vErr || !v.session) throw new Error(`Tracker session failed: ${vErr?.message ?? "no session"}`);
  return v.session;
}

/**
 * Mirror one Console employee into the Tracker project (auth user + profiles row +
 * default employee_tracker_settings if missing). Console is the only source of truth.
 * Deleted/deactivated/banned employees become is_active=false and lose Tracker sessions.
 */
export async function syncTrackerEmployee(consoleUserId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = trackerAdmin();
  const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(consoleUserId);
  const cu = authRes?.user ?? null;
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("full_name, employee_code, job_role, avatar_url, deactivated_at")
    .eq("user_id", consoleUserId)
    .maybeSingle();

  if (!cu?.email) {
    // Hard-deleted in Console: mark inactive in Tracker (history kept).
    await sb.from("profiles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("console_user_id", consoleUserId);
    return;
  }
  const banned = !!cu.banned_until && new Date(cu.banned_until).getTime() > Date.now();
  const active = !prof?.deactivated_at && !banned;
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", consoleUserId);

  const tu = await ensureTrackerUser({
    console_user_id: consoleUserId,
    email: cu.email,
    name: prof?.full_name ?? null,
    employee_code: prof?.employee_code ?? null,
    job_role: prof?.job_role ?? null,
    avatar_url: prof?.avatar_url ?? null,
    roles: (roles ?? []).map((r) => r.role as string),
  });
  await sb.auth.admin.updateUserById(tu.id, { ban_duration: active ? "none" : "876000h" });
  if (!active) await sb.auth.admin.signOut(tu.id).catch(() => {});

  const { error } = await sb.from("profiles").upsert(
    {
      id: tu.id,
      console_user_id: consoleUserId,
      email: cu.email,
      name: prof?.full_name ?? null,
      employee_code: prof?.employee_code ?? null,
      job_role: prof?.job_role ?? null,
      avatar_url: prof?.avatar_url ?? null,
      is_active: active,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Tracker profile sync failed: ${error.message}`);

  const { data: s } = await sb.from("employee_tracker_settings").select("id").eq("employee_id", tu.id).maybeSingle();
  if (!s) await sb.from("employee_tracker_settings").insert({ employee_id: tu.id });
}

/** Fire-and-log wrapper so a Tracker outage never blocks Console employee changes. */
export async function syncTrackerEmployeeSafe(consoleUserId: string): Promise<void> {
  try {
    await syncTrackerEmployee(consoleUserId);
  } catch (e) {
    console.error("[tracker-sync]", consoleUserId, e);
  }
}

/** Resolve the Tracker auth user ID mirrored from a Console employee. */
export async function trackerUserIdFor(consoleUserId: string): Promise<string | null> {
  const { data } = await trackerAdmin().from("profiles").select("id").eq("console_user_id", consoleUserId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
