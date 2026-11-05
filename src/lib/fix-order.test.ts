import { expect, it } from "vitest";
import { fixBlocker } from "./fix-order";

const bad = (...k: string[]) => ["api", "domain", "tracking", "webhook"].map((kind) => ({ kind, ok: !k.includes(kind) }));

it("API issue blocks Domain, Tracking and Webhook fixes", () => {
  const c = bad("api", "domain", "tracking", "webhook");
  expect(fixBlocker("api", c)).toBeNull();
  expect(fixBlocker("domain", c)).toBe("Fix API key first");
  expect(fixBlocker("tracking", c)).toBe("Fix API key first");
  expect(fixBlocker("webhook", c)).toBe("Fix API key first");
});

it("Domain issue blocks only Tracking & TLS", () => {
  const c = bad("domain", "tracking", "webhook");
  expect(fixBlocker("tracking", c)).toBe("Fix Domain first");
  expect(fixBlocker("webhook", c)).toBeNull();
});
