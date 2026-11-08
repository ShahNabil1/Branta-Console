import { expect, test } from "vitest";
import { canSeeMyCompany } from "./my-company-access";

const sister = (myRole: string | null) => ({ is_holding: false, myRole });
const holding = { is_holding: true, myRole: null };

test("Group Admin sees My Company inside a sister company", () => {
  expect(canSeeMyCompany({ isSuperAdmin: true, isAdmin: true, roles: ["super_admin"] }, sister(null))).toBe(true);
});

test("Group Admin still sees Branta Tech's My Company", () => {
  expect(canSeeMyCompany({ isSuperAdmin: true, isAdmin: true, roles: ["super_admin"] }, holding)).toBe(true);
});

test("sister CEO sees their own company's My Company", () => {
  expect(canSeeMyCompany({ roles: ["user"] }, sister("super_admin"))).toBe(true);
});

test("sister Executive does not see My Company", () => {
  expect(canSeeMyCompany({ roles: ["user"] }, sister("member"))).toBe(false);
});

test("Branta Accounts does not see a sister company's My Company", () => {
  expect(canSeeMyCompany({ roles: ["finance"] }, sister("manager"))).toBe(false);
});

test("Branta Executive does not see Branta Tech's My Company", () => {
  expect(canSeeMyCompany({ roles: ["user"] }, holding)).toBe(false);
});
