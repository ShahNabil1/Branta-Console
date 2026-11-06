import { expect, test } from "vitest";
import { toCompanyPath } from "./org-path";

test("sister Recycle Bin stays on that company's finance page", () => {
  expect(toCompanyPath("/app/finance/recycle-bin", "admakai", false)).toBe("/app/org/admakai/finance/recycle-bin");
});

test("switching companies preserves the Recycle Bin page", () => {
  expect(toCompanyPath("/app/org/admakai/finance/recycle-bin", "sister", false)).toBe("/app/org/sister/finance/recycle-bin");
});

test("holding Recycle Bin keeps its existing address", () => {
  expect(toCompanyPath("/app/finance/recycle-bin", "branta-tech", true)).toBe("/app/finance/recycle-bin");
});

test("Recycle Bin can switch back to the holding workspace", () => {
  expect(toCompanyPath("/app/org/admakai/finance/recycle-bin", "branta-tech", true)).toBe("/app/finance/recycle-bin");
});

test("Back to Expenses stays in the sister workspace", () => {
  expect(toCompanyPath("/app/finance/expenses", "admakai", false)).toBe("/app/org/admakai/finance/expenses");
});