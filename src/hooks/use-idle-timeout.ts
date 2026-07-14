import { useEffect, useRef } from "react";

/**
 * Fires `onExpire` after `timeoutMs` of no user activity.
 * Silent by design (no visible UI).
 * Pauses while the tab is hidden.
 */
export function useIdleTimeout(timeoutMs: number, onExpire: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef(onExpire);
  cbRef.current = onExpire;

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => cbRef.current(), timeoutMs);
    };

    let ticking = false;
    const throttled = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        reset();
      });
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => window.addEventListener(e, throttled, { passive: true }));

    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
      else if (timer.current) clearTimeout(timer.current);
    };
    document.addEventListener("visibilitychange", onVisibility);

    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, throttled));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [timeoutMs]);
}
