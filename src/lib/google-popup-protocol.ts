export type OAuthPopupType = "company-google-connected" | "company-cloudflare-connected" | "company-resend-connected";
export type OAuthPopupResult = {
  type: OAuthPopupType;
  popupId: string;
  slug: string;
  status: "ok" | "error";
  message?: string;
};
export type GooglePopupResult = OAuthPopupResult & { type: "company-google-connected" };

export function isOAuthPopupResult(value: unknown, type: OAuthPopupType, popupId: string, slug: string): value is OAuthPopupResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<OAuthPopupResult>;
  return result.type === type && result.popupId === popupId && result.slug === slug &&
    (result.status === "ok" || result.status === "error") &&
    (result.message === undefined || typeof result.message === "string");
}

export function isGooglePopupResult(value: unknown, popupId: string, slug: string): value is GooglePopupResult {
  return isOAuthPopupResult(value, "company-google-connected", popupId, slug);
}

/** Only non-secret completion information crosses back to the original page. */
export function oauthPopupResponse(result: OAuthPopupResult, origin: string, provider: string, channelPrefix: string): Response {
  const nonce = crypto.randomUUID();
  const json = JSON.stringify({ result, origin, provider, channelPrefix }).replace(/</g, "\\u003c");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${provider} connection · Branta Console</title></head><body><p id="status"></p><script nonce="${nonce}">
    const { result, origin, provider, channelPrefix } = ${json};
    document.getElementById('status').textContent = result.status === 'ok' ? provider + ' account connected. You can close this window.' : (result.message || provider + ' connection failed. Please try again.');
    if (window.opener) window.opener.postMessage(result, origin);
    try { const channel = new BroadcastChannel(channelPrefix + result.popupId); channel.postMessage(result); channel.close(); } catch {}
    window.close();
  </script></body></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
  } });
}

export function googlePopupResponse(result: GooglePopupResult, origin: string): Response {
  return oauthPopupResponse(result, origin, "Google", "branta-google-");
}
