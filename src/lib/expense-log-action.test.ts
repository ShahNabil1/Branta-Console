import { expect, it } from "vitest";
import { expenseReadActionSchema } from "./expense-log-action";

it("rejects new expense letterhead print logging", () => {
  expect(expenseReadActionSchema.safeParse("voucher_printed").success).toBe(false);
});
it("retains voucher download logging", () => {
  expect(expenseReadActionSchema.parse("voucher_downloaded")).toBe("voucher_downloaded");
});