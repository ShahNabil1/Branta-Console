import { describe, expect, test } from "bun:test";
import { ownedWebhookAddress, sameWebhookIds } from "./company-webhook-policy";

describe("company webhook disconnect scope", () => {
  const base = "https://console.brantatech.com/api/public/brevo/webhook?company=admakai";
  test("only this company's Branta endpoint is selected", () => {
    expect(ownedWebhookAddress(`${base}&token=private`, base)).toBe(base);
    expect(ownedWebhookAddress(base.replace("admakai", "admakai-other"), base)).toBeNull();
    expect(ownedWebhookAddress(base.replace("console.brantatech.com", "other.example"), base)).toBeNull();
    expect(ownedWebhookAddress(`${base}&company=other`, base)).toBeNull();
    expect(ownedWebhookAddress(`${base}&integration=other`, base)).toBeNull();
  });
  test("preview addresses never expose the private webhook token", () => {
    expect(ownedWebhookAddress(`${base}&token=private`, base)?.includes("private")).toBe(false);
  });
  test("deletion requires exactly the previewed webhook IDs", () => {
    expect(sameWebhookIds(["1", "2"], ["2", "1"])).toBe(true);
    expect(sameWebhookIds(["1", "2", "3"], ["1", "2"])).toBe(false);
    expect(sameWebhookIds(["1"], [])).toBe(false);
    expect(sameWebhookIds([], [])).toBe(true);
  });
});