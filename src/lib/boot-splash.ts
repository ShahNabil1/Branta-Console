/** Fade out the static boot splash (rendered in __root) once a real screen or the app preloader is painted. */
export function markBooted() {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (el.dataset.booted || el.dataset.booting) return;
  el.dataset.booting = "1";
  setTimeout(() => {
    el.dataset.booted = "1";
    delete el.dataset.booting;
  }, 220);
}

/** Bring the boot splash back instantly (e.g. right after sign-in verification). */
export function showBootSplash() {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.booted;
  delete document.documentElement.dataset.booting;
}
