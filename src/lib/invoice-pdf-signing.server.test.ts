import { describe, expect, it, vi } from "vitest";
import { loadSalarySlipPayload } from "./invoice-pdf-signing.server";

function salaryClient(slip: Record<string, unknown> | null) {
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      in: async () => ({ data: [{ user_id: "employee", full_name: "Employee" }] }),
      maybeSingle: async () => ({ data: table === "salary_slips" ? slip : null, error: null }),
    };
    return query;
  });
  return { from };
}

describe("public salary PDF payload", () => {
  it("rejects void slips before reading private employee details", async () => {
    const client = salaryClient({ status: "void", user_id: "employee" });
    expect(await loadSalarySlipPayload(client, "SAL-2611-001")).toBeNull();
    expect(client.from.mock.calls.map(([table]) => table)).toEqual(["salary_slips"]);
  });
  it("returns no payload for a missing slip", async () => {
    expect(await loadSalarySlipPayload(salaryClient(null), "missing")).toBeNull();
  });
  it("keeps issued slips available", async () => {
    const result = await loadSalarySlipPayload(salaryClient({ status: "issued", user_id: "employee" }), "SAL-2611-001");
    expect(result?.employeeName).toBe("Employee");
  });
});