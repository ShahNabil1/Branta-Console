import { describe, expect, it } from "vitest";
import { oauthReturnPath } from "./oauth-return-path";

describe("OAuth login return", () => {
  it("preserves consent authorization and fragment", () => {
    expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=request-123#approve")).toBe("/.lovable/oauth/consent?authorization_id=request-123#approve");
  });
  it.each(["//outside.invalid", "/\\outside.invalid/", "https://outside.invalid", "/\noutside.invalid", null])("rejects unsafe return %s", (value) => {
    expect(oauthReturnPath(value)).toBe("/");
  });
});