import { describe, expect, test } from "vitest";
import { assertGroupAdmin, isGroupAdmin } from "./group-admin";

const sb = (roles: string[]) => ({
  rpc: async (_f: string, a: { _role: string }) => ({ data: roles.includes(a._role) }),
});

describe("group admin gate", () => {
  test("a sister-company CEO with no global role is refused", async () => {
    expect(await isGroupAdmin(sb([]), "u")).toBe(false);
    await expect(assertGroupAdmin(sb([]), "u")).rejects.toThrow();
  });
  test("global super_admin passes", async () => {
    expect(await isGroupAdmin(sb(["super_admin"]), "u")).toBe(true);
  });
  test("global admin passes", async () => {
    expect(await isGroupAdmin(sb(["admin"]), "u")).toBe(true);
  });
});

import { canOperateCompany } from "./group-admin";
const sb2 = (roles: string[], holding: boolean, memberRole: string | null) => ({
  rpc: async (_f: string, a: { _role: string }) => ({ data: roles.includes(a._role) }),
  from: (t: string) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: t === "companies" ? { is_holding: holding } : t === "profiles" ? { id: "p" } : memberRole ? { role: memberRole } : null }) };
    return q;
  },
});
describe("My Company gate", () => {
  test("Branta Executive is refused", async () => { expect(await canOperateCompany(sb2(["user"], true, null), "u", "c")).toBe(false); });
  test("Branta Accounts passes", async () => { expect(await canOperateCompany(sb2(["finance"], true, null), "u", "c")).toBe(true); });
  test("sister Executive is refused", async () => { expect(await canOperateCompany(sb2([], false, "member"), "u", "c")).toBe(false); });
  test("sister HR passes", async () => { expect(await canOperateCompany(sb2([], false, "manager"), "u", "c")).toBe(true); });
  test("non-member of the sister company is refused", async () => { expect(await canOperateCompany(sb2([], false, null), "u", "c")).toBe(false); });
});
