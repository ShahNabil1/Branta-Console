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
    const { data, error } = await sb.auth.admin.updateUserById(existing.id, { app_metadata, user_metadata });
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
