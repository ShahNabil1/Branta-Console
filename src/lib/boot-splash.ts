/** Hide the static boot splash (rendered in __root) once a real screen or the app preloader is painted. */
export function markBooted() {
  if (typeof document !== "undefined") document.documentElement.dataset.booted = "1";
}

/** Bring the boot splash back instantly (e.g. right after sign-in verification). */
export function showBootSplash() {
  if (typeof document !== "undefined") delete document.documentElement.dataset.booted;
}
