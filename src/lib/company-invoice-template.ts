import { z } from "zod";
import type { PdfSettings } from "./invoice-pdf.server";

const text = (max: number) => z.string().max(max).regex(/^[\x20-\x7E\n\r]*$/, "Use English text for this PDF font");
const nullableText = (max: number) => text(max).nullable();
const colour = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex colour");
const logo = z.string().max(600_000).regex(/^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i, "Use a PNG or JPG logo").nullable();
export const INVOICE_LABELS = {
  bill_to: "BILL TO", details: "INVOICE DETAILS", services: "Service / Project Description",
  description: "DESCRIPTION", quantity: "QTY", unit_price: "UNIT PRICE", amount: "AMOUNT",
  schedule: "Payment Schedule", payment: "PAYMENT INFORMATION", terms: "Terms and Conditions",
  notes: "Notes", subtotal: "Subtotal", total: "Total Payable", balance: "Balance Due",
} as const;
export type InvoiceLabel = keyof typeof INVOICE_LABELS;
export const CompanyInvoiceTemplateSchema = z.object({
  company_name: text(120).min(1), company_tagline: nullableText(160), company_address: nullableText(1000),
  company_email: z.string().email().max(254).nullable().or(z.literal("")),
  company_website: nullableText(300), company_phone: nullableText(40),
  logo_url: logo, logo_inverse_url: logo,
  brand_color: colour, header_bg_color: colour, page_bg_color: colour, panel_bg_color: colour,
  text_color: colour, muted_color: colour, hairline_color: colour,
  header_text: text(30), footer_text: text(160), signature_name: nullableText(100), signature_title: nullableText(100),
  payment_info: nullableText(2400), payment_note: nullableText(600), payment_intro: nullableText(300),
  default_terms: text(2000), default_notes: text(2000), use_branta_assets: z.boolean(),
  logo_height: z.number().min(16).max(60), logo_align: z.enum(["left", "center", "right"]),
  signature_align: z.enum(["left", "right"]), font_family: z.enum(["Helvetica", "TimesRoman", "Courier"]),
  sections: z.object({ description: z.boolean(), installments: z.boolean(), notes: z.boolean(),
    footer: z.boolean(), payment_info: z.boolean(), terms: z.boolean(), signature: z.boolean(), contacts: z.boolean() }).strict(),
  labels: z.object(Object.fromEntries(Object.keys(INVOICE_LABELS).map(k => [k, text(40).min(1)])) as Record<InvoiceLabel, z.ZodString>).strict(),
}).strict();
export type CompanyInvoiceTemplate = z.infer<typeof CompanyInvoiceTemplateSchema>;

export function completeInvoiceTemplate(base: Partial<PdfSettings> & Record<string, unknown>): CompanyInvoiceTemplate {
  return {
    company_name: base.company_name ?? "", company_tagline: base.company_tagline ?? null,
    company_address: base.company_address ?? null, company_email: base.company_email ?? null,
    company_website: base.company_website ?? null, company_phone: base.company_phone ?? null,
    logo_url: base.logo_url ?? null, logo_inverse_url: typeof base.logo_inverse_url === "string" ? base.logo_inverse_url : null,
    brand_color: base.brand_color ?? "#E56A17", header_bg_color: base.header_bg_color ?? "#FFFFFF",
    page_bg_color: base.page_bg_color ?? "#FFFFFF", panel_bg_color: base.panel_bg_color ?? "#F9FAFB",
    text_color: base.text_color ?? "#111827", muted_color: base.muted_color ?? "#6B7280", hairline_color: base.hairline_color ?? "#E5E7EB",
    header_text: base.header_text ?? "INVOICE", footer_text: base.footer_text ?? "",
    signature_name: base.signature_name ?? null, signature_title: base.signature_title ?? null,
    payment_info: base.payment_info ?? null, payment_note: base.payment_note ?? null,
    payment_intro: typeof base.payment_intro === "string" ? base.payment_intro : null,
    default_terms: typeof base.default_terms === "string" ? base.default_terms : "",
    default_notes: typeof base.default_notes === "string" ? base.default_notes : "",
    use_branta_assets: base.use_branta_assets !== false,
    logo_height: typeof base.logo_height === "number" ? base.logo_height : 46,
    logo_align: base.logo_align === "center" || base.logo_align === "right" ? base.logo_align : "left",
    signature_align: base.signature_align === "left" ? "left" : "right",
    font_family: base.font_family === "TimesRoman" || base.font_family === "Courier" ? base.font_family : "Helvetica",
    sections: { description: true, installments: true, notes: true, footer: true, payment_info: true,
      terms: true, signature: true, contacts: true, ...base.sections },
    labels: { ...INVOICE_LABELS, ...(base.labels as Partial<Record<InvoiceLabel, string>> ?? {}) },
  };
}

/** Invoice content wins over template defaults; issued invoice amounts are never edited here. */
export function applyInvoiceDefaults<T extends { terms?: string | null; notes: string | null }>(invoice: T, settings: Partial<CompanyInvoiceTemplate>): T {
  return { ...invoice, terms: invoice.terms || settings.default_terms || null, notes: invoice.notes || settings.default_notes || null };
}

/** No Branta assets, merchant identity or contact defaults may appear in a sister's PDF. */
export function scopeInvoiceTemplate(settings: CompanyInvoiceTemplate, isHolding: boolean): CompanyInvoiceTemplate {
  return { ...settings, use_branta_assets: isHolding };
}