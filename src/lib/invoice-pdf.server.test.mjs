import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { renderInvoicePdf } from "./invoice-pdf.server.ts";

const fixture = {
  invoice: {
    slug: "BT-32", title: "Website product 5th & 6th order",
    description: "Website Ai Product Photoshoot Design", currency: "BDT",
    total_amount: 22000, paid_amount: 0, status: "sent", project_type: "one_time",
    starts_on: null, ends_on: null, due_date: "2026-10-11", notes: null,
    created_at: "2026-10-11T10:00:00Z",
  },
  customer: {
    name: "Fahim Hasan", customer_code: "BTC-013", company: "Gentle Park",
    email: "ecommommerce@gentlepark.com", phone: "01321137094", address: null,
  },
  installments: [{ sequence: 1, label: "Full payment", due_date: "2026-10-11", amount: 22000, status: "pending", paid_at: null }],
  lineItems: [{ sequence: 1, description: "Website product 5th & 6th order", quantity: 22, unit_price: 1000 }],
  settings: {
    company_name: "Branta Tech", company_tagline: null, company_address: null,
    company_email: "support@brantatech.org", company_website: "brantatech.com",
    company_phone: "09644228678", logo_url: null, brand_color: "#E56A17",
    header_bg_color: "#FFFFFF", page_bg_color: "#FFFFFF", panel_bg_color: "#F9FAFB",
    text_color: "#111827", muted_color: "#6B7280", hairline_color: "#E5E7EB",
    header_text: "INVOICE", footer_text: "", signature_name: "Branta Tech - Finance",
    signature_title: "hello@brantatech.com",
    sections: { description: true, installments: true, notes: true, payment_info: true, terms: true, footer: true },
  },
};

describe("invoice PDF pagination", () => {
  test("Admakai renders its own template and font without Branta QR or logos", async () => {
    const settings = { ...fixture.settings, use_branta_assets: false, company_name: "Admakai",
      company_email: "info@admakai.com", company_phone: null, company_website: "admakai.com",
      payment_info: "Account Name: Admakai", payment_note: "Pay to this account.", payment_intro: "Bank transfer",
      signature_name: "Admakai - Finance", signature_title: "Authorized Signature",
      logo_url: null, logo_inverse_url: null, font_family: "TimesRoman", signature_align: "left" };
    const bytes = await renderInvoicePdf({ ...fixture, settings });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const images = doc.getPages()[0].node.Resources().lookupMaybe((await import("pdf-lib")).PDFName.of("XObject"), (await import("pdf-lib")).PDFDict);
    expect(images?.keys().length ?? 0).toBe(0);
    if (process.env.INVOICE_PDF_QA_DIR) await Bun.write(`${process.env.INVOICE_PDF_QA_DIR}/admakai.pdf`, bytes);
  });
  for (const mode of ["digital", "print"]) {
    test(`BT-32 single-item invoice stays on one page (${mode})`, async () => {
      const bytes = await renderInvoicePdf(fixture, { mode });
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
      if (process.env.INVOICE_PDF_QA_DIR) await Bun.write(`${process.env.INVOICE_PDF_QA_DIR}/bt32-${mode}.pdf`, bytes);
    });
  }

  test("short terms and notes do not orphan the signature", async () => {
    const bytes = await renderInvoicePdf({ ...fixture, invoice: { ...fixture.invoice,
      terms: "Payment is due on the invoice due date.", notes: "Please include BT-32 with your payment.",
    } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    if (process.env.INVOICE_PDF_QA_DIR) await Bun.write(`${process.env.INVOICE_PDF_QA_DIR}/bt32-notes.pdf`, bytes);
  });

  test("large invoices continue across pages without losing rows", async () => {
    const bytes = await renderInvoicePdf({ ...fixture,
      lineItems: Array.from({ length: 40 }, (_, i) => ({ sequence: i + 1, description: `Service deliverable ${i + 1}`, quantity: 1, unit_price: 550 })),
      invoice: { ...fixture.invoice, notes: "Final delivery confirmation." },
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    if (process.env.INVOICE_PDF_QA_DIR) await Bun.write(`${process.env.INVOICE_PDF_QA_DIR}/large.pdf`, bytes);
  });
});