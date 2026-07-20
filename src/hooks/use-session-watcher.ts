// Watches this device's session_key and signs out when revoked from
// another device. Uses the same session_key we registered at login time.
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { pingSession } from "@/lib/user-sessions.functions";

export const SESSION_KEY_STORAGE = "branta.session_key";

const PING_INTERVAL_MS = 60_000;

export function ensureSessionKey(): string {
  if (typeof window === "undefined") return "";
  let k = window.localStorage.getItem(SESSION_KEY_STORAGE);
  if (!k) {
    k =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(SESSION_KEY_STORAGE, k);
  }
  return k;
}

export function useSessionWatcher() {
  const navigate = useNavigate();
  const ping = useServerFn(pingSession);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = window.localStorage.getItem(SESSION_KEY_STORAGE);
    if (!key) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await ping({ data: { session_key: key } });
        if (stopped) return;
        if (res.revoked) {
          window.localStorage.removeItem(SESSION_KEY_STORAGE);
          await supabase.auth.signOut();
          navigate({ to: "/login", search: { reason: "signed_out" } });
        }
      } catch {
        // silent — network hiccups shouldn't sign the user out
      }
    };
    void tick();
    const id = window.setInterval(tick, PING_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [navigate, ping]);
}
