import { describe, expect, it } from "vitest";
import { assertAgentClaims, assertAgentEmployee } from "./access";

const verified = { sub: "employee-1", client_id: "oauth-client", email: "staff@brantatech.com", aal: "aal2" };
describe("Agent access gates", () => {
  it("rejects copied password sessions without OAuth client identity", () => {
    expect(() => assertAgentClaims({ ...verified, client_id: undefined })).toThrow();
  });
  it("requires two-factor verification", () => {
    expect(() => assertAgentClaims({ ...verified, aal: "aal1" })).toThrow();
    expect(() => assertAgentClaims(verified)).not.toThrow();
  });
  it("rejects non-Branta employee email", () => {
    expect(() => assertAgentClaims({ ...verified, email: "staff@example.com" })).toThrow();
  });
  it("denies inactive employees", () => {
    expect(() => assertAgentEmployee(false, false, false)).toThrow();
  });
  it("requires pending password recovery to finish", () => {
    expect(() => assertAgentEmployee(true, false, true)).toThrow();
    expect(() => assertAgentEmployee(true, true, false)).toThrow();
    expect(() => assertAgentEmployee(true, false, false)).not.toThrow();
  });
});