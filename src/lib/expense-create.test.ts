import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: (data: unknown) => unknown) => {
        validate = validator;
        return builder;
      },
      handler: () => ({ validate: (data: unknown) => validate(data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/expense-logs.functions", () => ({ writeExpenseLog: vi.fn() }));

import { createExpense } from "./finance.functions";

const expense = { category: "salary", amount: 1000, currency: "BDT", spent_on: "2026-11-09" };
const validate = (createExpense as unknown as { validate: (data: unknown) => unknown }).validate;

describe("new Salary expenses", () => {
  it.each([null, "admakai"])("accepts Salary in workspace %s", (workspace) => {
    expect(validate({ ...expense, workspace })).toMatchObject({ category: "salary", amount: 1000, workspace });
  });
  it("preserves the BDT-only rule", () => {
    expect(() => validate({ ...expense, currency: "USD" })).toThrow("Expenses are recorded in BDT only");
  });
});