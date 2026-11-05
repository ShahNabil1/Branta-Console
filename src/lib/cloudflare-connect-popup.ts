import { isOAuthPopupResult, type OAuthPopupResult } from "./google-popup-protocol";

/** Opens Cloudflare consent synchronously in a popup and resolves with the signed completion message. */
export function connectCloudflareInPopup(
  slug: string,
  start: (popupId: string) => Promise<{ url: string }>,
  signal?: AbortSignal,
): Promise<OAuthPopupResult | null> {
  const popupId = crypto.randomUUID();
  const width = Math.min(560, window.screen.availWidth);
  const height = Math.min(760, window.screen.availHeight);
  const popup = window.open("about:blank", `branta-cloudflare-${popupId}`,
    `popup=yes,width=${width},height=${height},left=${Math.max(0, window.screenX + (window.outerWidth - width) / 2)},top=${Math.max(0, window.screenY + (window.outerHeight - height) / 2)}`);
  if (!popup) return Promise.reject(new Error("Allow popups for this site, then try connecting Cloudflare again."));
  popup.document.title = "Connecting Cloudflare · Branta Console";
  popup.document.body.textContent = "Opening Cloudflare…";

  return new Promise((resolve, reject) => {
    let settled = false;
    let channel: BroadcastChannel | null = null;
    const finish = (result: OAuthPopupResult | null, error?: unknown) => {
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
      if (isOAuthPopupResult(value, "company-cloudflare-connected", popupId, slug)) finish(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === popup) receive(event.data);
    };
    const onAbort = () => finish(null);
    window.addEventListener("message", onMessage);
    try { channel = new BroadcastChannel(`branta-cloudflare-${popupId}`); channel.onmessage = (event) => receive(event.data); } catch { /* postMessage remains */ }
    const poll = window.setInterval(() => { if (popup.closed) finish(null); }, 700);
    const timeout = window.setTimeout(() => finish(null, new Error("Cloudflare connection timed out. Please try again.")), 10 * 60_000);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { finish(null); return; }
    void start(popupId).then(({ url }) => {
      if (settled) return;
      const destination = new URL(url);
      if (destination.origin !== "https://dash.cloudflare.com") throw new Error("Invalid Cloudflare connection address.");
      popup.location.replace(destination.toString());
      popup.focus();
    }).catch((error: unknown) => finish(null, error));
  });
}
