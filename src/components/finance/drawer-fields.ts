/**
 * Mobile-friendly field behaviour shared by every branded drawer:
 * no browser autofill/past-entry suggestions, keyboard "Next" moves to the
 * following field, and the last field shows "Done" and closes the keyboard.
 */
const FIELD_SEL = [
  "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=color])",
  "textarea",
].join(",");

/** Props that switch off browser autofill / saved-entry popups on one input. */
export const QUIET_INPUT = {
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
} as const;

function usable(el: HTMLInputElement | HTMLTextAreaElement) {
  return !el.disabled && !el.readOnly && el.getClientRects().length > 0 && !el.closest("[data-skip-next]");
}

export function drawerFields(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FIELD_SEL)).filter(usable);
}

/** Stamp quiet attributes on a field unless it explicitly opts out. */
export function quietField(el: HTMLInputElement | HTMLTextAreaElement) {
  if (el.hasAttribute("data-keep-autocomplete")) return;
  if (el.getAttribute("autocomplete") !== "off") el.setAttribute("autocomplete", "off");
  el.setAttribute("autocorrect", "off");
  el.setAttribute("spellcheck", "false");
  el.setAttribute("data-lpignore", "true");
  el.setAttribute("data-1p-ignore", "true");
  el.setAttribute("data-form-type", "other");
  if (el instanceof HTMLInputElement && (el.type === "email" || el.inputMode === "email")) el.setAttribute("autocapitalize", "none");
}

/** Give single-line fields the right keyboard action key ("next" or "done"). */
export function refreshEnterHints(root: ParentNode) {
  const fields = drawerFields(root);
  fields.forEach((el, i) => {
    if (!(el instanceof HTMLInputElement)) return;
    // A hint set by the component itself (e.g. Vendor "done") wins.
    if (el.hasAttribute("enterkeyhint") && !el.hasAttribute("data-auto-hint")) return;
    el.setAttribute("enterkeyhint", i < fields.length - 1 ? "next" : "done");
    el.setAttribute("data-auto-hint", "");
  });
}

/** Move focus to the field after `from`; blur (closes keyboard) when it is the last one. */
export function focusNextField(root: ParentNode, from: Element) {
  const fields = drawerFields(root);
  const idx = fields.indexOf(from as HTMLInputElement);
  const next = idx >= 0 ? fields[idx + 1] : undefined;
  if (next) {
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "center", behavior: "smooth" });
  } else {
    (from as HTMLElement).blur();
  }
}

/** Attach the behaviour to a drawer node; returns a cleanup. */
export function attachDrawerFields(root: HTMLElement) {
  const stamp = () => {
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FIELD_SEL).forEach(quietField);
    refreshEnterHints(root);
  };
  stamp();
  const mo = new MutationObserver(stamp);
  mo.observe(root, { childList: true, subtree: true });
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) { quietField(t); refreshEnterHints(root); }
  };
  root.addEventListener("focusin", onFocusIn, true);
  return () => { mo.disconnect(); root.removeEventListener("focusin", onFocusIn, true); };
}
