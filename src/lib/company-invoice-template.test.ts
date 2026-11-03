import { describe, expect, it } from "vitest";
import { applyInvoiceDefaults, completeInvoiceTemplate, CompanyInvoiceTemplateSchema, scopeInvoiceTemplate } from "./company-invoice-template";
import { loadInvoicePdfPayload } from "./invoice-pdf-signing.server";

describe("company invoice templates", () => {
  it("Admakai never enables Branta's logo, contacts or merchant QR", () => {
    const settings = scopeInvoiceTemplate(completeInvoiceTemplate({ company_name: "Admakai", use_branta_assets: true }), false);
    expect(settings.use_branta_assets).toBe(false);
  });
  it("invoice terms and notes override template defaults", () => {
    expect(applyInvoiceDefaults({ terms: "Signed terms", notes: "Client note" }, { default_terms: "Default terms", default_notes: "Default note" })).toEqual({ terms: "Signed terms", notes: "Client note" });
  });
  it("empty invoice content uses the saved template's defaults", () => {
    expect(applyInvoiceDefaults({ terms: null, notes: null }, { default_terms: "Due in 7 days", default_notes: "Thank you" })).toEqual({ terms: "Due in 7 days", notes: "Thank you" });
  });
  it("rejects arbitrary image URLs and unknown template fields", () => {
    const settings = completeInvoiceTemplate({ company_name: "Admakai", use_branta_assets: false });
    expect(CompanyInvoiceTemplateSchema.safeParse(settings).success).toBe(true);
    expect(CompanyInvoiceTemplateSchema.safeParse({ ...settings, logo_url: "http://internal/private" }).success).toBe(false);
    expect(CompanyInvoiceTemplateSchema.safeParse({ ...settings, total_amount: 1 }).success).toBe(false);
  });
  it("issued invoice PDFs use their snapshot rather than today's global settings", async () => {
    const snapshot = { company_name: "Admakai", brand_color: "#FF0000", use_branta_assets: false };
    const records: Record<string, unknown> = {
      invoices: { id: "invoice-1", customer_id: "customer-1", pdf_template_snapshot: snapshot },
      customers: { name: "Client", company_id: "admakai" }, invoice_installments: [], invoice_line_items: [],
      invoice_pdf_settings: { company_name: "Branta Tech", brand_color: "#E56A17" },
    };
    const sb = { from: (table: string) => {
      const result = { data: records[table], error: null };
      const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result) };
      return q;
    } };
    const payload = await loadInvoicePdfPayload(sb, "AD-1");
    expect(payload?.settings).toEqual(snapshot);
  });
});