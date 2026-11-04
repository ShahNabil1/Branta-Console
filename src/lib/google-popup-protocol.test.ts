import { describe, expect, it } from "vitest";
import { googlePopupResponse, isGooglePopupResult } from "./google-popup-protocol";

const result = { type: "company-google-connected", popupId: "popup-1", slug: "admakai", status: "ok" };
describe("company Google popup completion", () => {
  it("accepts only the initiating popup and company", () => {
    expect(isGooglePopupResult(result, "popup-1", "admakai")).toBe(true);
    expect(isGooglePopupResult(result, "other-popup", "admakai")).toBe(false);
    expect(isGooglePopupResult(result, "popup-1", "branta")).toBe(false);
    expect(isGooglePopupResult({ ...result, status: "pending" }, "popup-1", "admakai")).toBe(false);
  });
  it("escapes completion errors and prevents caching OAuth return pages", async () => {
    const response = googlePopupResponse({ ...result, type: "company-google-connected", status: "error", message: "</script><script>bad()</script>" }, "https://console.brantatech.com");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    const html = await response.text();
    expect(html).not.toContain("</script><script>bad()");
    expect(html).toContain("\\u003c/script>");
  });
});