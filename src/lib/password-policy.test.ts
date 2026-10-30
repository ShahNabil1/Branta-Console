import { describe, expect, it } from "vitest";
import { strongPasswordSchema } from "./branta-credentials";
import { getPasskeyProvider } from "./passkey-providers";

describe("password policy", () => {
  it("accepts exactly 8 chars with lower, upper, digit, symbol", () => {
    expect(strongPasswordSchema.safeParse("Ab3!efgh").success).toBe(true);
  });
  it("rejects 7 or 9 characters", () => {
    expect(strongPasswordSchema.safeParse("Ab3!efg").success).toBe(false);
    expect(strongPasswordSchema.safeParse("Ab3!efghi").success).toBe(false);
  });
  it("rejects a missing symbol", () => {
    expect(strongPasswordSchema.safeParse("Ab3defgh").success).toBe(false);
  });
});

describe("passkey provider", () => {
  it("names Google Password Manager by AAGUID", () => {
    expect(getPasskeyProvider({ aaguid: "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4" }).name).toBe("Google Password Manager");
  });
});
