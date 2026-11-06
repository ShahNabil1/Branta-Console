// Server-only: after a password change Supabase ends the old sessions. The caller
// already proved two-factor in this session, so mint a fresh session (magic-link
// token) plus a one-time grant that marks the new session as strong.
import { hashPasskeyGrant } from "./session-assurance.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mintPasswordContinuation(admin: any, userId: string, email: string) {
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !data?.properties?.hashed_token) return null;
    const grant = crypto.randomUUID() + crypto.randomUUID();
    const ins = await admin.from("passkey_login_grants").insert({
      grant_hash: await hashPasskeyGrant(grant),
      user_id: userId,
    });
    if (ins.error) return null;
    return { token_hash: data.properties.hashed_token as string, grant };
  } catch {
    return null;
  }
}
