export type GooglePopupResult = {
  type: "company-google-connected";
  popupId: string;
  slug: string;
  status: "ok" | "error";
  message?: string;
};

export function isGooglePopupResult(value: unknown, popupId: string, slug: string): value is GooglePopupResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<GooglePopupResult>;
  return result.type === "company-google-connected" && result.popupId === popupId && result.slug === slug &&
    (result.status === "ok" || result.status === "error") &&
    (result.message === undefined || typeof result.message === "string");
}

/** Only non-secret completion information crosses back to the original page. */
export function googlePopupResponse(result: GooglePopupResult, origin: string): Response {
  const nonce = crypto.randomUUID();
  const json = JSON.stringify({ result, origin }).replace(/</g, "\\u003c");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google connection · Branta Console</title></head><body><p id="status"></p><script nonce="${nonce}">
    const { result, origin } = ${json};
    document.getElementById('status').textContent = result.status === 'ok' ? 'Google account connected. You can close this window.' : (result.message || 'Google connection failed. Please try again.');
    if (window.opener) window.opener.postMessage(result, origin);
    try { const channel = new BroadcastChannel('branta-google-' + result.popupId); channel.postMessage(result); channel.close(); } catch {}
    window.close();
  </script></body></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
  } });
}