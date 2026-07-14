import { useEffect } from "react";

/**
 * Client-side deterrents for a strictly-internal console:
 *  - Blocks the browser context menu (right-click).
 *  - Blocks common devtools / view-source keyboard shortcuts.
 *
 * NOT a security boundary — anyone determined can still open devtools via
 * the browser menu. Real security lives in RLS, auth middleware, and the
 * `noindex` meta tag. This hook is intentional friction only.
 *
 * Safe with normal typing: we never touch plain letter keys or standard
 * clipboard shortcuts (Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+A / Ctrl+Z) inside
 * inputs, textareas, or contenteditable regions.
 */
export function useStrictSecurity() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const alt = e.altKey;
      const shift = e.shiftKey;

      // F12 — always block
      if (key === "F12") {
        e.preventDefault();
        return;
      }

      // Ctrl+Shift+I / J / C  (Windows/Linux)
      // Cmd+Option+I / J / C  (macOS)
      const isInspectCombo =
        (ctrlOrMeta && shift && (lower === "i" || lower === "j" || lower === "c")) ||
        (e.metaKey && alt && (lower === "i" || lower === "j" || lower === "c"));

      // Ctrl+U (view source) / Cmd+Option+U
      const isViewSource =
        (e.ctrlKey && lower === "u") || (e.metaKey && alt && lower === "u");

      // Ctrl+S (save page) — also worth blocking for an internal console
      const isSavePage = ctrlOrMeta && !shift && !alt && lower === "s";

      if (isInspectCombo || isViewSource || isSavePage) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown, { capture: true } as EventListenerOptions);
    };
  }, []);
}
