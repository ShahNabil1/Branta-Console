import { describe, expect, test } from "bun:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { formatCategory } from "./expense-categories.ts";
import { buildExpenseReportPdf, groupByCategory } from "./expense-report-pdf.server.ts";

const row = (o) => ({
  date: "2026-10-20", voucher: "EXP-1", category: "Office", vendor: "Nesco", department: "Admin",
  requestedBy: "A", paidBy: "B", approvedBy: "", fund: "Ops", project: "", purpose: "Bill", items: "",
  method: "bKash", txnId: "X1", sealed: false, publicUrl: null, receiptUrl: null, amount: 100, ...o,
});

describe("expense report", () => {
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
      rows: [row({ publicUrl: "https://console.brantatech.com/x/EXP-1?t=abc", sealed: true })],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const annots = doc.getPage(0).node.Annots();
    const uris = (annots?.asArray() ?? []).map((ref) => String(doc.context.lookup(ref).get(PDFName.of("A")).get(PDFName.of("URI"))));
    expect(uris.some((u) => u.includes("console.brantatech.com/x/EXP-1"))).toBe(true);
  });
});
