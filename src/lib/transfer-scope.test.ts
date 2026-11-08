import { describe, expect, it } from "vitest";
import { filterCompanyTransfers } from "./transfer-scope";

const company = "admakai";
const leads = new Map<string, string | null>([
  ["lead-own", company],
  ["lead-other", "branta"],
  ["lead-none", null],
]);
const staff = new Set(["emp-a", "emp-b"]);

describe("company head transfer scope", () => {
  it("keeps a transfer of the company's lead between its own staff", () => {
    const rows = [{ id: "1", lead_id: "lead-own", from_user_id: "emp-a", to_user_id: "emp-b" }];
    expect(filterCompanyTransfers(rows, leads, company, staff).map((r) => r.id)).toEqual(["1"]);
  });

  it("drops transfers of another company's lead", () => {
    const rows = [
      { id: "2", lead_id: "lead-other", from_user_id: "emp-a", to_user_id: "emp-b" },
      { id: "3", lead_id: "lead-none", from_user_id: "emp-a", to_user_id: "emp-b" },
    ];
    expect(filterCompanyTransfers(rows, leads, company, staff)).toEqual([]);
  });

  it("drops transfers to or from someone outside the company's staff", () => {
    const rows = [
      { id: "4", lead_id: "lead-own", from_user_id: "emp-a", to_user_id: "group-admin" },
      { id: "5", lead_id: "lead-own", from_user_id: "group-admin", to_user_id: "emp-b" },
    ];
    expect(filterCompanyTransfers(rows, leads, company, staff)).toEqual([]);
  });
});
