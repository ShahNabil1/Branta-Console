import { describe, expect, it } from "vitest";
import { walletCsvCell } from "./wallet-csv";

describe("company wallet CSV fields", () => {
  it.each(["=HYPERLINK(\"https://example.com\")", "+SUM(1,2)", "-SUM(1,2)", "@SUM(1,2)", " \t=1+1", "\r=1+1", "\n=1+1", "\ttext", "-123"])("neutralizes untrusted text %j", (value) => {
    expect(walletCsvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
  });
  it("preserves numbers, quotes, delimiters and ordinary text", () => {
    expect(walletCsvCell(-123)).toBe('"-123"');
    expect(walletCsvCell('Loan, "approved"\nrecord')).toBe('"Loan, ""approved""\nrecord"');
    expect(walletCsvCell(null)).toBe('""');
  });
});