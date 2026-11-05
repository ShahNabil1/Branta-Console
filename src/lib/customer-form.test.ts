import { describe, expect, it } from "vitest";
import { matchRoles, bdPhoneOk } from "./customer-form";

const roles = ["CEO", "COO", "HR", "HR & Admin", "Creative Head", "Owner"];

describe("customer role suggestions", () => {
  it("CEO shows CEO", () => expect(matchRoles(roles, "CEO")).toEqual(["CEO"]));
  it("HR shows HR and HR & Admin", () => expect(matchRoles(roles, "HR")).toEqual(["HR", "HR & Admin"]));
  it("unknown role shows nothing", () => expect(matchRoles(roles, "Astronaut")).toEqual([]));
  it("dotted C.E.O still matches", () => expect(matchRoles(roles, "c.e.o")).toEqual(["CEO"]));
});

describe("BD phone", () => {
  it("accepts 01712345678", () => expect(bdPhoneOk("01712345678")).toBe(true));
  it("rejects 01212345678", () => expect(bdPhoneOk("01212345678")).toBe(false));
});
