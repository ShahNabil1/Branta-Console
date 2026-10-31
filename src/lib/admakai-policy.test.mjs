import { describe, test } from "node:test";
import assert from "node:assert/strict";
const expect = (actual) => ({ toBe: (expected) => assert.equal(actual, expected) });
import { canAccessAdmakai, isAdmakaiCallback, mapAdmakaiRole } from "./admakai-policy.ts";

describe("Admakai callback restrictions", () => {
  for (const host of ["admakai.com", "www.admakai.com", "admakai.lovable.app", "id-preview--501d0449-9e53-4830-89e1-c51ec60b3911.lovable.app"]) {
    test(`accepts exact ${host} callback`, () => expect(isAdmakaiCallback(`https://${host}/auth/sso/callback`)).toBe(true));
  }
  for (const uri of ["https://evil.test/auth/sso/callback", "https://admakai.com.evil.test/auth/sso/callback", "http://admakai.com/auth/sso/callback", "https://admakai.com/auth/sso/callback?next=evil", "https://admakai.com/auth/sso/callback#token", "https://admakai.com/auth/sso/callback/", "https://admakai.com@evil.test/auth/sso/callback"]) {
    test(`denies ${uri}`, () => expect(isAdmakaiCallback(uri)).toBe(false));
  }
});
test("super_admin maps to owner", () => expect(mapAdmakaiRole(["user", "super_admin"])).toBe("owner"));
test("admin maps to manager", () => expect(mapAdmakaiRole(["admin"])).toBe("manager"));
test("manager maps to manager", () => expect(mapAdmakaiRole(["manager"])).toBe("manager"));
test("user maps to member", () => expect(mapAdmakaiRole(["user"])).toBe("member"));
test("granted finance role can sign in", () => expect(canAccessAdmakai({ roles: ["finance"], allowedApps: ["admakai"], hasProfile: true, deactivatedAt: null, bannedUntil: null })).toBe(true));
test("deactivated employee cannot sign in", () => expect(canAccessAdmakai({ roles: ["super_admin"], allowedApps: ["admakai"], hasProfile: true, deactivatedAt: "2026-10-29T12:00:00Z", bannedUntil: null })).toBe(false));
test("banned employee cannot sign in", () => expect(canAccessAdmakai({ roles: ["user"], allowedApps: ["admakai"], hasProfile: true, deactivatedAt: null, bannedUntil: "2026-10-30T00:00:00Z" }, Date.parse("2026-10-29T00:00:00Z"))).toBe(false));
test("missing profile fails closed", () => expect(canAccessAdmakai({ roles: ["user"], allowedApps: ["admakai"], hasProfile: false, deactivatedAt: null, bannedUntil: null })).toBe(false));
test("active eligible employee can sign in", () => expect(canAccessAdmakai({ roles: ["user"], allowedApps: ["admakai"], hasProfile: true, deactivatedAt: null, bannedUntil: null })).toBe(true));test("user without grant cannot sign in", () => expect(canAccessAdmakai({ roles: ["admin"], allowedApps: [], hasProfile: true, deactivatedAt: null, bannedUntil: null })).toBe(false));
test("super_admin always allowed without grant", () => expect(canAccessAdmakai({ roles: ["super_admin"], allowedApps: [], hasProfile: true, deactivatedAt: null, bannedUntil: null })).toBe(true));
