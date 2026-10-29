import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { canAccessAdmakai, mapAdmakaiRole } from "./admakai-policy";

export function admakaiAdmin(): SupabaseClient {
  const url = process.env["ADMAKAI_SUPABASE_URL"];
  const key = process.env["ADMAKAI_SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Admakai connection is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
async function findUser(sb: SupabaseClient, email?: string, hubId?: string): Promise<User | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("Could not locate the Admakai account.");
    const user = data.users.find((u) => (hubId && u.app_metadata?.branta_hub_user_id === hubId) || (email && u.email?.toLowerCase() === email.toLowerCase()));
    if (user) return user;
    if (data.users.length < 200) return null;
  }
}
export async function mintAdmakaiSession(sb: SupabaseClient, email: string) {
  const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw new Error("Could not authorize Admakai sign-in.");
  const verified = await sb.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (verified.error || !verified.data.session) throw new Error("Could not create the Admakai session.");
  return verified.data.session;
}
async function disableUser(sb: SupabaseClient, user: User) {
  const profile = await sb.from("profiles").update({ is_active: false }).eq("user_id", user.id);
  if (profile.error) throw new Error("Could not deactivate the Admakai profile.");
  let logoutFailed = false;
  if (user.email && !(user.banned_until && new Date(user.banned_until).getTime() > Date.now())) {
    try {
      // admin.signOut takes a JWT, not a user UUID; global logout invalidates refresh sessions.
      const session = await mintAdmakaiSession(sb, user.email);
      const logout = await sb.auth.admin.signOut(session.access_token, "global");
      logoutFailed = Boolean(logout.error);
    } catch { logoutFailed = true; }
  }
  const ban = await sb.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
  if (ban.error) throw new Error("Could not block the Admakai account.");
  const roles = await sb.from("user_roles").delete().eq("user_id", user.id);
  if (roles.error) throw new Error("Could not remove Admakai access roles.");
  if (logoutFailed) throw new Error("Admakai access blocked; session revocation needs review.");
}
/** Hub-owned identity and one mapped staff role, always read from the Hub server. */
export async function syncAdmakaiEmployee(hubId: string): Promise<{ user: User; active: boolean } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = admakaiAdmin();
  const [auth, profile, roles] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(hubId),
    supabaseAdmin.from("profiles").select("full_name, deactivated_at").eq("user_id", hubId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", hubId),
  ]);
  if (profile.error || roles.error || (auth.error && auth.error.status !== 404)) throw new Error("Could not verify Hub employee access.");
  const source = auth.data.user;
  let user = await findUser(sb, source?.email, hubId);
  const sourceRoles = (roles.data ?? []).map((r) => r.role);
  const active = !!source?.email && canAccessAdmakai({ roles: sourceRoles, hasProfile: !!profile.data, deactivatedAt: profile.data?.deactivated_at ?? null, bannedUntil: source?.banned_until ?? null });
  if (!active) {
    if (user) await disableUser(sb, user);
    return user ? { user, active: false } : null;
  }
  if (!source?.email) return null;
  const email = source.email.toLowerCase();
  if (user?.app_metadata?.branta_hub_user_id && user.app_metadata.branta_hub_user_id !== hubId) throw new Error("Admakai account is linked to another Hub identity.");
  const attributes = { email, email_confirm: true, app_metadata: { ...user?.app_metadata, branta_hub_user_id: hubId }, user_metadata: { ...user?.user_metadata, full_name: profile.data?.full_name ?? null } };
  if (!user) {
    const created = await sb.auth.admin.createUser(attributes);
    if (created.error) {
      user = await findUser(sb, email, hubId);
      if (!user) throw new Error("Could not create the Admakai account.");
      if (user.app_metadata?.branta_hub_user_id && user.app_metadata.branta_hub_user_id !== hubId) throw new Error("Admakai identity conflict.");
    } else user = created.data.user;
  }
  const updated = await sb.auth.admin.updateUserById(user.id, { ...attributes, ban_duration: "none" });
  if (updated.error) throw new Error("Could not synchronize the Admakai account.");
  const role = mapAdmakaiRole(sourceRoles);
  if (!role) throw new Error("Your Hub role has no Admakai access.");
  const savedProfile = await sb.from("profiles").upsert({ user_id: user.id, email, full_name: profile.data?.full_name ?? null, is_active: true }, { onConflict: "user_id" });
  if (savedProfile.error) throw new Error("Could not synchronize the Admakai profile.");
  const savedRole = await sb.from("user_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id" });
  if (savedRole.error) {
    await disableUser(sb, updated.data.user);
    throw new Error("Could not synchronize the Admakai access role.");
  }
  return { user: updated.data.user, active: true };
}
export async function syncAdmakaiEmployeeSafe(hubId: string): Promise<void> {
  if (!process.env["ADMAKAI_SUPABASE_URL"] || !process.env["ADMAKAI_SUPABASE_SERVICE_ROLE_KEY"]) return;
  try { await syncAdmakaiEmployee(hubId); }
  catch { console.error("[admakai-sync] Employee access synchronization failed", hubId); }
}