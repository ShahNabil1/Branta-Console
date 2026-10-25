// Single sign-out path: closes this device's session record (with reason) before
// ending the auth session, so ended sessions never linger as "active".
import { supabase } from "@/integrations/supabase/client";
import { SESSION_KEY_STORAGE } from "@/hooks/use-session-watcher";
import { endMySession } from "@/lib/user-sessions.functions";

export async function signOutWithLog(reason: "idle_timeout" | "manual_logout") {
  try {
    const key = window.localStorage.getItem(SESSION_KEY_STORAGE);
    if (key) {
      await Promise.race([
        endMySession({ data: { session_key: key, reason } }),
        new Promise((r) => setTimeout(r, 4000)),
      ]);
    }
  } catch {
    /* never block sign-out */
  }
  try {
    window.localStorage.removeItem(SESSION_KEY_STORAGE);
  } catch {
    /* ignore */
  }
  await supabase.auth.signOut().catch(() => {});
}
