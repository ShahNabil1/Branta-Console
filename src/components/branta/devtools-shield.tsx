import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { BRAND_LOGO as brandLogo } from "@/lib/brand-assets";

/**
 * DevToolsShield — client-side deterrent that:
 *  - Blocks right-click, F12, Ctrl+Shift+I/J/C, Cmd+Opt+I/J/C, Ctrl+U, Ctrl+S.
 *  - Detects an open DevTools panel via the `disable-devtool` package
 *    (falls back to a debugger-timing loop if the package cannot load).
 *  - Shows an accessible full-screen warning while DevTools is open.
 *    Automatically dismisses when the panel closes.
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

// ---------------------------------------------------------------------------
// Configurable detection settings
// ---------------------------------------------------------------------------

export type DevToolsShieldConfig = {
  /** Poll interval for detection heuristics, ms. Higher = fewer false positives, slower response. */
  checkIntervalMs: number;
  /**
   * How long the `debugger;` statement must stall before we treat DevTools as
   * open. Chrome pauses instantly when the panel is open; a healthy tab runs
   * a single `debugger;` in well under 1ms. 100ms is the tight default;
   * bump to 200-400ms on slow devices to avoid GC / background-tab pauses.
   */
  debuggerThresholdMs: number;
  /** Consecutive positive samples required before triggering the blackout. Debounces jitter. */
  triggerSamples: number;
  /** Consecutive negative samples required before clearing the blackout. */
  clearSamples: number;
  /** Enable the `disable-devtool` package (window-size, console-getter, toString heuristics). */
  usePackage: boolean;
  /** Enable the `debugger;`-timing fallback loop. Disable on very old devices where it stutters. */
  useDebuggerFallback: boolean;
  /** Suppress detection while the tab is hidden — background throttling produces false positives. */
  pauseWhenHidden: boolean;
  /** Hostnames (suffix match) where detection is fully disabled. Preview / editor / dev by default. */
  disabledHostSuffixes: string[];
  /** Also disable detection when the app is rendered inside an iframe (Lovable preview / embeds). */
  disableInIframe: boolean;
  /** Optional callback fired when the shield opens/closes — useful for audit logging. */
  onStateChange?: (open: boolean) => void;
};

export const DEFAULT_DEVTOOLS_SHIELD_CONFIG: DevToolsShieldConfig = {
  checkIntervalMs: 1000,
  debuggerThresholdMs: 150,
  triggerSamples: 2,
  clearSamples: 2,
  usePackage: true,
  useDebuggerFallback: true,
  pauseWhenHidden: true,
  disabledHostSuffixes: [
    ".lovableproject.com",
    ".lovable.app",
    ".lovable.dev",
    "localhost",
    "127.0.0.1",
  ],
  disableInIframe: true,
};

// ---------------------------------------------------------------------------
// Blackout UI
// ---------------------------------------------------------------------------

function Blackout({ titleId, descId }: { titleId: string; descId: string }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    // Move focus into the dialog so screen readers announce it and keyboard
    // users can't tab back into the (now hidden) app tree.
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      // Trap Tab within the dialog. It has one focusable target, so any Tab
      // just re-focuses the dialog itself.
      if (e.key === "Tab") {
        e.preventDefault();
        dialogRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    // Freeze background scroll while the shield is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      const prev = previouslyFocused.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#F9FAFB] px-6 outline-none"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
    >
      <div className="max-w-md text-center">
        <img
          src={brandLogo.url}
          alt="Branta Tech"
          className="mx-auto h-8 w-auto opacity-90"
          draggable={false}
        />
        <div
          className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#E56A17]/10"
          aria-hidden="true"
        >
          <AlertTriangle className="h-8 w-8" style={{ color: "#E56A17" }} />
        </div>
        <div className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6B7280]">
          Branta Tech · Console
        </div>
        <h1
          id={titleId}
          className="mt-2 text-lg font-semibold tracking-tight text-[#111827]"
        >
          Security Alert
        </h1>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-[#4B5563]"
        >
          {WARNING_TEXT}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shield component
// ---------------------------------------------------------------------------

export function DevToolsShield({
  children,
  config: userConfig,
}: {
  children: ReactNode;
  config?: Partial<DevToolsShieldConfig>;
}) {
  const config: DevToolsShieldConfig = {
    ...DEFAULT_DEVTOOLS_SHIELD_CONFIG,
    ...userConfig,
  };

  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const onStateChangeRef = useRef(config.onStateChange);
  onStateChangeRef.current = config.onStateChange;

  // Notify listeners when open state flips.
  useEffect(() => {
    if (armed) onStateChangeRef.current?.(open);
  }, [open, armed]);

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

    // Skip detection in the Lovable preview / editor iframe and on
    // configured non-production hosts. Shortcut / context-menu blocking
    // above stays active regardless.
    const host = window.location.hostname;
    const inIframe = window.self !== window.top;
    const hostDisabled = config.disabledHostSuffixes.some((suffix) =>
      suffix.startsWith(".") ? host.endsWith(suffix) : host === suffix,
    );
    if ((config.disableInIframe && inIframe) || hostDisabled) return;

    let cancelled = false;
    let intervalId: number | undefined;
    let positiveStreak = 0;
    let negativeStreak = 0;

    const commit = (positive: boolean) => {
      if (cancelled) return;
      if (positive) {
        negativeStreak = 0;
        positiveStreak += 1;
        if (positiveStreak >= config.triggerSamples) setOpen(true);
      } else {
        positiveStreak = 0;
        negativeStreak += 1;
        if (negativeStreak >= config.clearSamples) setOpen(false);
      }
    };

    // Primary: disable-devtool package (handles many edge cases).
    let usedPackage = false;
    if (config.usePackage) {
      import("disable-devtool")
        .then((mod) => {
          if (cancelled) return;
          const dd = (mod as { default?: unknown }).default ?? mod;
          try {
            (dd as (opts: Record<string, unknown>) => void)({
              md5: "",
              url: "",
              tkName: "ddtk",
              ondevtoolopen: () => commit(true),
              ondevtoolclose: () => commit(false),
              interval: config.checkIntervalMs,
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
    }

    // Fallback: debugger-timing trick.
    if (config.useDebuggerFallback) {
      intervalId = window.setInterval(() => {
        if (cancelled) return;
        if (config.pauseWhenHidden && document.visibilityState === "hidden") return;
        const start = performance.now();
        // eslint-disable-next-line no-debugger
        debugger;
        const elapsed = performance.now() - start;
        if (elapsed > config.debuggerThresholdMs) {
          commit(true);
        } else if (!usedPackage) {
          // Only auto-clear from the fallback; the package owns its own close signal.
          commit(false);
        }
      }, config.checkIntervalMs);
    }

    setArmed(true);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
    // Re-run when key config knobs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.checkIntervalMs,
    config.debuggerThresholdMs,
    config.triggerSamples,
    config.clearSamples,
    config.usePackage,
    config.useDebuggerFallback,
    config.pauseWhenHidden,
    config.disableInIframe,
    config.disabledHostSuffixes.join("|"),
  ]);

  // Before hydration completes, render children so SSR markup matches.
  if (!armed) return <>{children}</>;
  if (open) return <Blackout titleId="devtools-shield-title" descId="devtools-shield-desc" />;
  return <>{children}</>;
}
