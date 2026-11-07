import { describe, expect, it } from "vitest";
import { financeFilename, financeSummary, type FinanceExport } from "./finance-export";
import { buildFinanceExcel } from "./finance-export-xlsx";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";

const report: FinanceExport = {
  companyName: "Branta Tech",
  from: null,
  to: null,
  missingFields: [],
  income: [
    {
      date: "2026-11-07",
      transactionId: "",
      party: "=1+1",
      purpose: "Invoice",
      method: "Cash",
      amount: 10000,
    },
  ],
  expenses: [{ date: "2026-11-07", transactionId: "", purpose: "Project expense", amount: 2500 }],
};
describe("read-only finance export rules", () => {
  it("calculates income less expense: 10000 - 2500 = 7500", () => {
    expect(financeSummary(report)).toMatchObject({
      income: 10000,
      expense: 2500,
      net: 7500,
      status: "Profit",
    });
  });
  it("labels negative net as Loss", () => {
    expect(
      financeSummary({ ...report, expenses: [{ ...report.expenses[0], amount: 12500 }] }),
    ).toMatchObject({ net: -2500, status: "Loss" });
  });
  it("labels zero net as Break-even", () => {
    expect(financeSummary({ ...report, income: [], expenses: [] })).toMatchObject({
      net: 0,
      status: "Break-even",
    });
  });
  it("aggregates each calendar month separately", () => {
    expect(
      financeSummary({ ...report, expenses: [{ ...report.expenses[0], date: "2026-10-01" }] })
        .months,
    ).toEqual([
      { month: "2026-10", income: 0, expense: 2500, net: -2500 },
      { month: "2026-11", income: 10000, expense: 0, net: 10000 },
    ]);
  });
  it("produces exactly three sheets with numeric values and blank missing IDs", () => {
    const wb = XLSX.read(buildFinanceExcel(report), { type: "array" });
    expect(wb.SheetNames).toEqual(["Income", "Expenses", "Summary"]);
    expect(wb.Sheets.Income.G2.v).toBe(10000);
    expect(wb.Sheets.Expenses.E2.v).toBe(2500);
    expect(wb.Sheets.Summary.D2.v).toBe(7500);
    expect(wb.Sheets.Income.C2.v).toBe("");
    expect(wb.Sheets.Income.D2.t).toBe("s");
    expect(wb.Sheets.Income.D2.f).toBeUndefined();
    expect(wb.Sheets.Income.G3.f).toBe("SUM(G2:G2)");
    expect(wb.Sheets.Summary.B2.f).toBe("'Income'!G3");
  });
  it("sorts oldest first", () => {
    const wb = XLSX.read(
      buildFinanceExcel({
        ...report,
        income: [report.income[0], { ...report.income[0], date: "2026-01-01", amount: 5 }],
      }),
      { type: "array" },
    );
    expect(wb.Sheets.Income.G2.v).toBe(5);
  });
  it("names date-range exports explicitly", () => {
    expect(financeFilename({ ...report, from: "2026-11-01", to: "2026-11-07" }, "xlsx")).toBe(
      "Finance_Report_2026-11-01_to_2026-11-07.xlsx",
    );
  });
  it("does not truncate empty reports or invent income", () => {
    const wb = XLSX.read(buildFinanceExcel({ ...report, income: [], expenses: [] }), {
      type: "array",
    });
    expect(wb.Sheets.Income.G2.v).toBe(0);
    expect(wb.Sheets.Expenses.E2.v).toBe(0);
    expect(wb.Sheets.Summary.D2.v).toBe(0);
  });
  it("server requires authenticated group-admin authorization before any financial read", () => {
    const source = readFileSync(new URL("./finance-export.functions.ts", import.meta.url), "utf8");
    const firstRead = source.search(/\.from\("invoice_installments"\)/);
    expect(firstRead).toBeGreaterThan(-1);
    expect(source.indexOf("await assertGroupAdmin")).toBeLessThan(firstRead);
    expect(source).toContain(".middleware([requireSupabaseAuth])");
    expect(source).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});
