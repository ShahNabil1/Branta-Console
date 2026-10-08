// Live presence for signed-in staff, via Supabase Realtime Presence.
// One shared channel per browser tab: the app shell tracks the current user,
// and any page can read who is online without opening a second channel.
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PresenceState = "active" | "idle";
export interface PresenceInfo {
  state: PresenceState;
  since: string;
}

type Channel = ReturnType<typeof supabase.channel>;
let channel: Channel | null = null;
let refs = 0;
let snapshot: Map<string, PresenceInfo> = new Map();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const IDLE_AFTER_MS = 5 * 60_000;

function readState(ch: Channel) {
  const raw = ch.presenceState() as Record<string, Array<{ state?: PresenceState; since?: string }>>;
  const next = new Map<string, PresenceInfo>();
  for (const [uid, metas] of Object.entries(raw)) {
    // Any tab active => active.
    const active = metas.some((m) => m.state !== "idle");
    const since = metas.map((m) => m.since ?? "").sort().reverse()[0] ?? new Date().toISOString();
    next.set(uid, { state: active ? "active" : "idle", since });
  }
  snapshot = next;
  emit();
}

export function usePresenceTracker() {
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      refs++;
      const ch = supabase.channel("branta-presence", { config: { presence: { key: uid } } });
      channel = ch;
      let state: PresenceState = "active";
      let lastInput = Date.now();
      const push = () => {
        void ch.track({ state, since: new Date().toISOString() });
      };
      ch.on("presence", { event: "sync" }, () => readState(ch)).subscribe((s) => {
        if (s === "SUBSCRIBED") push();
      });
      const onInput = () => {
        lastInput = Date.now();
        if (state === "idle" && document.visibilityState === "visible") {
          state = "active";
          push();
        }
      };
      const evts = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"] as const;
      evts.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
      const onVis = () => {
        const next: PresenceState = document.visibilityState === "visible" ? "active" : "idle";
        if (next !== state) {
          state = next;
          push();
        }
      };
      document.addEventListener("visibilitychange", onVis);
      const timer = window.setInterval(() => {
        if (state === "active" && Date.now() - lastInput > IDLE_AFTER_MS) {
          state = "idle";
          push();
        }
      }, 30_000);
      cleanup = () => {
        evts.forEach((e) => window.removeEventListener(e, onInput));
        document.removeEventListener("visibilitychange", onVis);
        window.clearInterval(timer);
        refs--;
        void supabase.removeChannel(ch);
        if (channel === ch) channel = null;
        snapshot = new Map();
        emit();
      };
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const empty = new Map<string, PresenceInfo>();

export function useOnlineUsers(): Map<string, PresenceInfo> {
  return useSyncExternalStore(subscribe, () => snapshot, () => empty);
}
