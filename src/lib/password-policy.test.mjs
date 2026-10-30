import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { strongPasswordSchema } from "./branta-credentials.ts";
import { getPasskeyProvider } from "./passkey-providers.ts";

describe("password policy", () => {
  test("accepts exactly 8 chars with lower, upper, digit, symbol", () => {
    assert.equal(strongPasswordSchema.safeParse("Ab3!efgh").success, true);
  });
  test("rejects 7 or 9 characters", () => {
    assert.equal(strongPasswordSchema.safeParse("Ab3!efg").success, false);
    assert.equal(strongPasswordSchema.safeParse("Ab3!efghi").success, false);
  });
  test("rejects a missing symbol", () => {
    assert.equal(strongPasswordSchema.safeParse("Ab3defgh").success, false);
  });
});

describe("passkey provider", () => {
  test("names Google Password Manager by AAGUID", () => {
    assert.equal(getPasskeyProvider({ aaguid: "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4" }).name, "Google Password Manager");
  });
});
