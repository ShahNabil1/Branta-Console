// Server-only: a session is strong when Supabase reports aal2 (TOTP) or when its
// session_id was bound to a verified passkey sign-in (passkey_sessions).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isStrongSession(supabase: any, claims: any, userId: string): Promise<boolean> {
  const a = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!a.error && a.data && (a.data.currentLevel === "aal2" || a.data.nextLevel !== "aal2")) {
    if (a.data.currentLevel === "aal2") return true;
  }
  const sid = claims?.session_id;
  if (!sid) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin as any)
    .from("passkey_sessions").select("user_id").eq("session_id", sid).maybeSingle();
  return !!data && data.user_id === userId;
}
