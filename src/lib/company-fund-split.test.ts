import { describe, expect, it } from "vitest";
import { percentTotal, splitInstallment, type FundRule } from "./company-fund-split";

const p = (label: string, percent: number): FundRule => ({ label, mode: "percent", percent, fixed_amount: 0 });
const f = (label: string, fixed_amount: number): FundRule => ({ label, mode: "fixed", percent: 0, fixed_amount });

describe("company fund split", () => {
  it("takes fixed amounts first, then splits the rest by percent", () => {
    const r = splitInstallment(100000, [f("Gateway fee", 1000), p("Employee Fund", 25), p("Company Profit", 75)]);
    expect(r.fixedTotal).toBe(1000);
    expect(r.net).toBe(99000);
    expect(r.shares.map((s) => s.amount)).toEqual([1000, 24750, 74250]);
  });
  it("caps fixed amounts at the installment", () => {
    const r = splitInstallment(500, [f("Gateway fee", 800), p("Profit", 100)]);
    expect(r.shares.map((s) => s.amount)).toEqual([500, 0]);
  });
  it("gives rounding remainder to the last percentage fund so nothing is lost", () => {
    const r = splitInstallment(100, [p("A", 33.333), p("B", 33.333), p("C", 33.334)]);
    expect(r.shares.reduce((s, x) => s + x.amount, 0)).toBe(100);
  });
  it("percent total ignores fixed funds", () => {
    expect(percentTotal([f("Fee", 250), p("A", 60), p("B", 40)])).toBe(100);
  });
});
