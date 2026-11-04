import { isGooglePopupResult, type GooglePopupResult } from "./google-popup-protocol";

export function connectGoogleInPopup(
  slug: string,
  start: (popupId: string) => Promise<{ url: string }>,
  signal?: AbortSignal,
): Promise<GooglePopupResult | null> {
  const popupId = crypto.randomUUID();
  const width = Math.min(520, window.screen.availWidth);
  const height = Math.min(720, window.screen.availHeight);
  // Open during the click, before the server request, to avoid popup blockers.
  const popup = window.open("about:blank", `branta-google-${popupId}`,
    `popup=yes,width=${width},height=${height},left=${Math.max(0, window.screenX + (window.outerWidth - width) / 2)},top=${Math.max(0, window.screenY + (window.outerHeight - height) / 2)}`);
  if (!popup) return Promise.reject(new Error("Allow popups for this site, then try connecting Google again."));
  popup.document.title = "Connecting Google · Branta Console";
  popup.document.body.textContent = "Opening Google…";

  return new Promise((resolve, reject) => {
    let settled = false;
    let channel: BroadcastChannel | null = null;
    const finish = (result: GooglePopupResult | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      channel?.close();
      popup.close();
      if (error) reject(error); else resolve(result);
    };
    const receive = (value: unknown) => {
      if (isGooglePopupResult(value, popupId, slug)) finish(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === popup) receive(event.data);
    };
    const onAbort = () => finish(null);
    window.addEventListener("message", onMessage);
    // Google may sever window.opener via COOP; the same-origin channel still works.
    try { channel = new BroadcastChannel(`branta-google-${popupId}`); channel.onmessage = (event) => receive(event.data); } catch { /* postMessage remains available */ }
    const poll = window.setInterval(() => {
      if (popup.closed) finish(null);
    }, 700);
    const timeout = window.setTimeout(() => finish(null, new Error("Google connection timed out. Please try again.")), 10 * 60_000);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { finish(null); return; }
    void start(popupId).then(({ url }) => {
      if (settled) return;
      const destination = new URL(url);
      if (destination.origin !== "https://accounts.google.com") throw new Error("Invalid Google connection address.");
      popup.location.replace(destination.toString());
      popup.focus();
    }).catch((error: unknown) => finish(null, error));
  });
}