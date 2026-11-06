import { describe, expect, it } from "vitest";
import { applyEmployeePasswordReset } from "./employee-password-reset.server";
import { generateTempPassword, strongPasswordSchema } from "./branta-credentials";

function fixture({ emailFails = false, resetTwoFactor = false, deleteFails = false } = {}) {
  const writes: { table: string; value: any }[] = [];
  const removed: string[] = [];
  const authUpdates: any[] = [];
  const profile = { user_id: "employee" };
  const telegram = { active: true, chat_id: "original-chat" };
  const factors = [{ id: "existing-totp", factor_type: "totp" }];
  const admin = {
    from(table: string) {
      return {
        update(value: any) {
          writes.push({ table, value });
          Object.assign(profile, value);
          return { eq: () => ({ select: () => ({ single: async () => ({ data: profile, error: null }) }) }) };
        },
        async insert(value: any) { writes.push({ table, value }); return { error: null }; },
      };
    },
    auth: { admin: {
      async updateUserById(_id: string, value: any) { authUpdates.push(value); return { error: null }; },
      mfa: {
        async listFactors() { return { data: { factors }, error: null }; },
        async deleteFactor({ id }: { id: string }) { removed.push(id); return { error: deleteFails ? new Error("unavailable") : null }; },
      },
    } },
  };
  const run = () => applyEmployeePasswordReset({
    admin, user: { id: "employee", app_metadata: { allowed: "unchanged" } },
    password: "Ab3!efgh", passwordHash: "hashed-only", resetTwoFactor,
    sendEmail: async () => { if (emailFails) throw new Error("provider unavailable"); },
  });
  return { run, writes, removed, authUpdates, profile, telegram, factors };
}

describe("employee password reset", () => {
  it("keeps existing authenticator factors by default", async () => {
    const f = fixture(); await f.run();
    expect(f.removed).toEqual([]);
    expect(f.factors).toEqual([{ id: "existing-totp", factor_type: "totp" }]);
  });
  it("never writes Telegram flags or connections during password recovery", async () => {
    const f = fixture({ resetTwoFactor: true }); await f.run();
    expect(f.writes.filter((w) => w.table === "profiles")).toEqual([{ table: "profiles", value: { must_change_password: true } }]);
    expect(f.writes.map((w) => w.table)).toEqual(["profiles", "password_history"]);
    expect(f.telegram).toEqual({ active: true, chat_id: "original-chat" });
  });
  it("removes TOTP only when explicitly requested", async () => {
    const f = fixture({ resetTwoFactor: true }); await f.run();
    expect(f.removed).toEqual(["existing-totp"]);
  });
  it("returns the issued password even when email fails", async () => {
    const f = fixture({ emailFails: true });
    expect(await f.run()).toMatchObject({ ok: true, emailStatus: "failed", tempPassword: "Ab3!efgh" });
  });
  it("keeps unrelated metadata and distinguishes recovery from onboarding", async () => {
    const f = fixture(); await f.run();
    expect(f.authUpdates).toEqual([{ password: "Ab3!efgh", app_metadata: { allowed: "unchanged", password_reset_pending: true } }]);
  });
  it("stores only the password hash and labels email acceptance truthfully", async () => {
    const f = fixture(); expect((await f.run()).emailStatus).toBe("accepted");
    expect(f.writes.find((w) => w.table === "password_history")?.value).toEqual({ user_id: "employee", password_hash: "hashed-only" });
  });
  it("does not hide the new password when a factor removal fails", async () => {
    const f = fixture({ resetTwoFactor: true, deleteFails: true });
    expect(await f.run()).toMatchObject({ tempPassword: "Ab3!efgh", twoFactorResetComplete: false });
  });
  it("generates temporary passwords using the unchanged exact eight-character policy", () => {
    for (let i = 0; i < 20; i++) {
      const password = generateTempPassword();
      expect(password).toHaveLength(8);
      expect(strongPasswordSchema.safeParse(password).success).toBe(true);
    }
    expect(strongPasswordSchema.safeParse("Ab3!efghi").success).toBe(false);
  });
});