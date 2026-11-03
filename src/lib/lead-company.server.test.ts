import { describe, expect, it } from "vitest";
import { resolveLeadCompany } from "./lead-company.server";

function fakeSb(co: Record<string, unknown> | null, member: boolean) {
  const chain = { eq: () => ({ maybeSingle: async () => ({ data: co, error: null }) }) };
  return { from: () => ({ select: () => chain }), rpc: async () => ({ data: member }) };
}

describe("resolveLeadCompany", () => {
  it("rejects a sister company for a non-member", async () => {
    await expect(resolveLeadCompany(fakeSb({ id: "a", slug: "admakai", name: "Admakai", is_holding: false }, false), "u", "admakai"))
      .rejects.toThrow("not a member");
  });
  it("allows a sister company for a member", async () => {
    const r = await resolveLeadCompany(fakeSb({ id: "a", slug: "admakai", name: "Admakai", is_holding: false }, true), "u", "admakai");
    expect(r.id).toBe("a");
    expect(r.isHolding).toBe(false);
  });
});
