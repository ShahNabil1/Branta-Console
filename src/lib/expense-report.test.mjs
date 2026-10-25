import { describe, expect, test } from "bun:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { formatCategory } from "./expense-categories.ts";
import { buildExpenseReportPdf, groupByCategory } from "./expense-report-pdf.server.ts";
import { collectExpenses } from "./expense-report.server.ts";

const row = (o) => ({
  date: "2026-10-20", voucher: "EXP-1", category: "Office", vendor: "Nesco", department: "Admin",
  requestedBy: "A", paidBy: "B", approvedBy: "", fund: "Ops", project: "", purpose: "Bill", items: "",
  method: "bKash", txnId: "X1", sealed: false, publicUrl: null, receiptUrl: null, amount: 100, ...o,
});

describe("expense report", () => {
  const expenses = [
    { id: "paid", category: "office", currency: "BDT", amount: 100, spent_on: "2026-10-20", txn_id: " TX-1 " },
    { id: "recorded", category: "office", currency: "BDT", amount: 50, spent_on: "2026-10-20", txn_id: null },
    { id: "blank", category: "office", currency: "BDT", amount: 25, spent_on: "2026-10-20", txn_id: "  " },
  ];
  const filters = { from: "2026-10-01", to: "2026-10-31", currency: "BDT", categories: [], invoiceId: null,
    paymentMethod: null, vendor: null, department: null, createdBy: null, minAmount: null, maxAmount: null,
    search: "", status: null, format: "pdf", periodLabel: "This month", filterLabels: [], fileBase: "expenses" };
  const sb = { from(table) {
    const result = { data: table === "expenses" ? expenses : [], error: null };
    const query = { then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    for (const method of ["select", "eq", "is", "gte", "lte", "order", "range", "in", "ilike", "or"]) {
      query[method] = () => query;
    }
    return query;
  } };

  test("paid expense export excludes recorded expenses and totals only paid amounts", async () => {
    const rows = await collectExpenses(sb, { ...filters, status: "paid" });
    expect(rows.map((r) => r.txnId)).toEqual(["TX-1"]);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(100);
  });

  test("recorded expense export includes missing and blank transaction IDs only", async () => {
    const rows = await collectExpenses(sb, { ...filters, status: "recorded" });
    expect(rows.map((r) => r.amount)).toEqual([50, 25]);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(75);
  });

  test("unfiltered expense export retains both payment statuses", async () => {
    const rows = await collectExpenses(sb, filters);
    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(175);
  });

  test("categories always start with a capital letter", () => {
    expect(formatCategory("office")).toBe("Office");
    expect(formatCategory("misc")).toBe("Miscellaneous");
    expect(formatCategory("other income")).toBe("Other Income");
  });

  test("groups by category with correct subtotals, largest first", () => {
    const g = groupByCategory([row({ amount: 100 }), row({ amount: 50 }), row({ category: "Tools & Software", amount: 500 })]);
    expect(g.map((x) => x.category)).toEqual(["Tools & Software", "Office"]);
    expect(g[1].total).toBe(150);
  });

  test("PDF renders with a clickable public link", async () => {
    const bytes = await buildExpenseReportPdf({
      periodLabel: "Test", generatedAt: "now", currency: "BDT", filters: ["Category: Office"],
      rows: [row({ publicUrl: "https://console.brantatech.com/x/EXP-1", sealed: true })],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const annots = doc.getPage(0).node.Annots();
    const uris = (annots?.asArray() ?? []).map((ref) => String(doc.context.lookup(ref).get(PDFName.of("A")).get(PDFName.of("URI"))));
    expect(uris.some((u) => u.includes("console.brantatech.com/x/EXP-1"))).toBe(true);
  });
});
