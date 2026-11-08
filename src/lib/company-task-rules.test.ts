import { describe, expect, it } from "vitest";
import { canManageCompanyTasks, parseAssetLinks, taskCapabilities } from "./company-task-rules";

const v = (o: Partial<Parameters<typeof canManageCompanyTasks>[0]>) => ({ groupAdmin: false, isHolding: false, holdingRoles: [], companyRole: null, ...o });

describe("company task permissions", () => {
  it("Group Admin manages every company", () => {
    expect(canManageCompanyTasks(v({ groupAdmin: true, companyRole: null }))).toBe(true);
  });
  it("sister C.E.O, C.O.O and HR manage their company", () => {
    for (const r of ["super_admin", "coo", "manager"]) expect(canManageCompanyTasks(v({ companyRole: r }))).toBe(true);
  });
  it("sister Accounts and Executive only view", () => {
    expect(canManageCompanyTasks(v({ companyRole: "finance" }))).toBe(false);
    expect(canManageCompanyTasks(v({ companyRole: "member" }))).toBe(false);
  });
  it("Branta Tech C.E.O / C.O.O / HR manage, Accounts / Executive do not", () => {
    expect(canManageCompanyTasks(v({ isHolding: true, holdingRoles: ["manager"] }))).toBe(true);
    expect(canManageCompanyTasks(v({ isHolding: true, holdingRoles: ["coo"] }))).toBe(true);
    expect(canManageCompanyTasks(v({ isHolding: true, holdingRoles: ["admin"] }))).toBe(true);
    expect(canManageCompanyTasks(v({ isHolding: true, holdingRoles: ["finance"] }))).toBe(false);
    expect(canManageCompanyTasks(v({ isHolding: true, holdingRoles: ["user"] }))).toBe(false);
  });
  it("only assignees (or managers) can work on a task", () => {
    expect(taskCapabilities(false, false)).toEqual({ edit: false, work: false, review: false });
    expect(taskCapabilities(false, true)).toEqual({ edit: false, work: true, review: false });
    expect(taskCapabilities(true, false)).toEqual({ edit: true, work: true, review: true });
  });
});

describe("asset links", () => {
  it("keeps unique http links and caps at 30", () => {
    expect(parseAssetLinks("https://a.com, https://a.com\nftp://x notalink http://b.com")).toEqual(["https://a.com", "http://b.com"]);
    const many = Array.from({ length: 40 }, (_, i) => `https://x.com/${i}`).join(" ");
    expect(parseAssetLinks(many)).toHaveLength(30);
  });
});
