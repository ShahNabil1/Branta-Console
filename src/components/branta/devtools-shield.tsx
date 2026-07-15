import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * DevToolsShield — client-side deterrent that:
 *  - Blocks right-click, F12, Ctrl+Shift+I/J/C, Cmd+Opt+I/J/C, Ctrl+U, Ctrl+S.
 *  - Detects an open DevTools panel via the `disable-devtool` package
 *    (falls back to a debugger-timing loop if the package cannot load).
 *  - Unmounts the entire app tree and shows a full-screen warning when
 *    DevTools is open. Remounts automatically when it closes.
 *
 * NOT a real security boundary — anyone determined can bypass. Real security
 * lives in RLS, auth middleware, and `noindex`. This is intentional friction
 * for an internal console.
 *
 * SSR-safe: renders children unchanged on the server and during first client
 * paint (hydration match), then activates detection in `useEffect`.
 */

const WARNING_TEXT =
  "Security Alert: Developer Tools are strictly prohibited on the Branta Tech internal network. Please close the panel to continue.";

const CHECK_INTERVAL_MS = 1000;
const DEBUGGER_THRESHOLD_MS = 100;

function Blackout() {
  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#F9FAFB] px-6"
      role="alertdialog"
      aria-modal="true"
      aria-label="Security Alert"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E56A17]/10">
          <AlertTriangle className="h-8 w-8" style={{ color: "#E56A17" }} />
        </div>
        <div className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6B7280]">
          Branta Tech · Console
        </div>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-[#111827]">
          Security Alert
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
          {WARNING_TEXT}
        </p>
      </div>
    </div>
  );
}

export function DevToolsShield({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);

  // Global shortcut / context-menu blocking (runs client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const alt = e.altKey;
      const shift = e.shiftKey;

      if (key === "F12") {
        e.preventDefault();
        return;
      }

      const isInspectCombo =
        (ctrlOrMeta && shift && (lower === "i" || lower === "j" || lower === "c")) ||
        (e.metaKey && alt && (lower === "i" || lower === "j" || lower === "c"));

      const isViewSource =
        (e.ctrlKey && lower === "u") || (e.metaKey && alt && lower === "u");

      const isSavePage = ctrlOrMeta && !shift && !alt && lower === "s";

      if (isInspectCombo || isViewSource || isSavePage) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener(
        "keydown",
        onKeyDown,
        { capture: true } as EventListenerOptions,
      );
    };
  }, []);

  // DevTools detection — runs only after hydration to avoid SSR mismatches.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Skip detection in the Lovable preview / editor iframe and on non-
    // production hosts. The preview runs inside an iframe and the editor
    // injects instrumentation that trips every heuristic (window size
    // deltas, console getters, debugger timing), causing false positives.
    // Shortcut / context-menu blocking above stays active regardless.
    const host = window.location.hostname;
    const inIframe = window.self !== window.top;
    const isNonProdHost =
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovable.dev") ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (inIframe || isNonProdHost) return;

    let cancelled = false;
    let intervalId: number | undefined;

    const activate = () => {
      if (!cancelled) setOpen(true);
    };
    const deactivate = () => {
      if (!cancelled) setOpen(false);
    };

    // Primary: disable-devtool package (handles many edge cases).
    let usedPackage = false;
    import("disable-devtool")
      .then((mod) => {
        if (cancelled) return;
        const dd = (mod as { default?: unknown }).default ?? mod;
        try {
          (dd as (opts: Record<string, unknown>) => void)({
            md5: "",
            url: "",
            tkName: "ddtk",
            ondevtoolopen: activate,
            ondevtoolclose: deactivate,
            interval: CHECK_INTERVAL_MS,
            disableMenu: true,
            clearIntervalWhenDevOpenTrigger: false,
            disableIframeParents: false,
          });
          usedPackage = true;
        } catch {
          // fall through to fallback below
        }
      })
      .catch(() => {
        // ignored — fallback loop runs regardless
      });

    // Fallback: debugger-timing trick. Runs alongside the package as a
    // second signal; if the package loads it will also flip state.
    intervalId = window.setInterval(() => {
      if (cancelled) return;
      const start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const elapsed = performance.now() - start;
      if (elapsed > DEBUGGER_THRESHOLD_MS) {
        activate();
      } else if (!usedPackage) {
        // Only auto-clear from the fallback; the package owns its own close signal.
        deactivate();
      }
    }, CHECK_INTERVAL_MS);

    setArmed(true);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  // Before hydration completes, render children so SSR markup matches.
  if (!armed) return <>{children}</>;
  if (open) return <Blackout />;
  return <>{children}</>;
}
