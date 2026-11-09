import { describe, expect, it } from "vitest";
import { autoInvoice, fillTemplate, isLinkExpired, otpUsable, EMPTY_FORM } from "./contract-template";

const ctx = { company_name: "Admakai", client_name: "Rahim", client_company: "", client_email: "r@x.com", client_phone: "", project_name: "UGC Ad", service: "AI video", project_description: "", invoice_no: "ADM-1", date: "1 January 2026" };

describe("contracts", () => {
  it("links the invoice automatically only when exactly one exists", () => {
    expect(autoInvoice([{ id: "a" }])).toBe("a");
    expect(autoInvoice([{ id: "a" }, { id: "b" }])).toBeNull();
    expect(autoInvoice([])).toBeNull();
  });
  it("signing link stops working once its expiry time passes", () => {
    const now = new Date("2026-01-15T00:00:00Z");
    expect(isLinkExpired("2026-01-14T23:59:59Z", now)).toBe(true);
    expect(isLinkExpired("2026-01-15T00:00:01Z", now)).toBe(false);
  });
  it("a code is rejected after 5 wrong attempts", () => {
    const exp = new Date(Date.now() + 60000).toISOString();
    expect(otpUsable({ attempts: 4, expires_at: exp })).toBe(true);
    expect(otpUsable({ attempts: 5, expires_at: exp })).toBe(false);
  });
  it("fills placeholders and marks missing ones", () => {
    expect(fillTemplate("{{client_name}}{{client_company_suffix}} pays {{fee}}", ctx, { ...EMPTY_FORM, fee: "৳10,000" })).toBe("Rahim pays ৳10,000");
    expect(fillTemplate("Length {{video_length}}", ctx, EMPTY_FORM)).toBe("Length —");
  });
});
