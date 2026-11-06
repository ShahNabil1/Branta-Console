// Browser: swap into the fresh strong session returned after a password change,
// so the employee stays signed in instead of being sent back to /login.
import { supabase } from "@/integrations/supabase/client";
import { claimPasskeySession } from "@/lib/session-assurance.functions";
import { registerSession } from "@/lib/user-sessions.functions";
import { ensureSessionKey } from "@/hooks/use-session-watcher";

export async function continueAfterPasswordChange(
  c: { token_hash: string; grant: string } | null | undefined,
): Promise<boolean> {
  if (!c) return false;
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: c.token_hash });
  if (error) return false;
  try {
    await claimPasskeySession({ data: { grant: c.grant } });
  } catch {
    return false;
  }
  try {
    const { collectDeviceHints } = await import("@/lib/device-hints");
    await registerSession({ data: { session_key: ensureSessionKey(), hints: await collectDeviceHints() } });
  } catch { /* non-fatal */ }
  return true;
}
