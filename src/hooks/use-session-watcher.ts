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

    const forceSignOut = async () => {
      if (stopped) return;
      stopped = true;
      window.localStorage.removeItem(SESSION_KEY_STORAGE);
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore — we still want to bounce to /login
      }
      navigate({ to: "/login", search: { reason: "signed_out" } });
    };

    const tick = async () => {
      try {
        const res = await ping({ data: { session_key: key } });
        if (stopped) return;
        if (res.revoked) await forceSignOut();
      } catch {
        // silent — network hiccups shouldn't sign the user out
      }
    };
    void tick();
    const id = window.setInterval(tick, PING_INTERVAL_MS);

    // Realtime: react instantly when THIS session_key row gets revoked
    // elsewhere. Falls back to the 60s poll if realtime is unavailable.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || stopped) return;
      channel = supabase
        .channel(`user-sessions:${uid}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "user_sessions",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            const row = payload.new as {
              session_key?: string;
              revoked_at?: string | null;
            };
            if (row?.session_key === key && row.revoked_at) {
              void forceSignOut();
            }
          },
        )
        .subscribe();
    })();

    return () => {
      stopped = true;
      window.clearInterval(id);
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigate, ping]);
}
