import { expect, it } from "vitest";
import { providerCheckState } from "./provider-check-state";

it("does not claim tracking success when API and domain fail and tracking was skipped", () => {
  expect(providerCheckState([{ kind: "api", ok: false }, { kind: "domain", ok: false }], "tracking", false)).toBe("unknown");
});
it("only confirms tracking from its own successful result", () => {
  expect(providerCheckState([{ kind: "tracking", ok: true }], "tracking", false)).toBe("success");
});
it("keeps a failed tracking check as an issue", () => {
  expect(providerCheckState([{ kind: "tracking", ok: false }], "tracking", false)).toBe("issue");
});
it("does not reuse a previous success while rechecking", () => {
  expect(providerCheckState([{ kind: "tracking", ok: true }], "tracking", true)).toBe("pending");
});