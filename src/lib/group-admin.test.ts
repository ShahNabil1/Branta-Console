import { describe, expect, test } from "bun:test";
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
