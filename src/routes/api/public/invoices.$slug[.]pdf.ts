// Public signed URL that streams the branded invoice PDF.
// URL: /api/public/invoices/BT-01.pdf?exp=...&sig=...[&mode=print]
//  - default (digital): full Branta Tech letterhead drawn into the reserved margins
//  - mode=print: margins left blank for pre-printed letterhead paper
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/invoices/$slug.pdf")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw = (params as Record<string, string>)["slug.pdf"] ?? (params as Record<string, string>).slug ?? "";
        const slug = raw.endsWith(".pdf") ? raw.slice(0, -4) : raw;
        const url = new URL(request.url);
        const exp = Number(url.searchParams.get("exp") ?? "0");
        const sig = url.searchParams.get("sig") ?? "";
        const mode = url.searchParams.get("mode") === "print" ? "print" : "digital";
        if (!exp || !sig) return new Response("Missing signature", { status: 400 });
        if (exp * 1000 < Date.now()) return new Response("Link expired", { status: 410 });

        const { verifyInvoiceSlug, loadInvoicePdfPayload } = await import("@/lib/invoice-pdf-signing.server");
        if (!verifyInvoiceSlug(slug, exp, sig)) return new Response("Invalid signature", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const payload = await loadInvoicePdfPayload(supabaseAdmin, slug);
        if (!payload) return new Response("Not found", { status: 404 });

        const { renderInvoicePdf } = await import("@/lib/invoice-pdf.server");
        const base = defaultSettings();
        const settings = payload.settings
          ? { ...base, ...payload.settings, sections: { ...base.sections, ...((payload.settings as { sections?: object }).sections ?? {}) } }
          : base;

        const bytes = await renderInvoicePdf(
          {
            invoice: payload.invoice,
            customer: payload.customer,
            installments: payload.installments,
            lineItems: payload.lineItems,
            settings,
          },
          { mode },
        );

        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="Invoice-${slug}${mode === "print" ? "-print" : ""}.pdf"`,
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});

function defaultSettings() {
  return {
    company_name: "Branta Tech",
    company_tagline: "Creative Technology Company",
    company_address: "Office-1: Colony, Bogura, Bangladesh.\nOffice-2: Niketan, Gulshan-1, Dhaka, Bangladesh.",
    company_email: "hello@brantatech.com",
    company_website: "brantatech.com",
    company_phone: "+88 01933228681",
    logo_url: null,
    brand_color: "#E56A17",
    header_bg_color: "#FFFFFF",
    page_bg_color: "#FFFFFF",
    panel_bg_color: "#F9FAFB",
    text_color: "#111827",
    muted_color: "#6B7280",
    hairline_color: "#E5E7EB",
    header_text: "INVOICE",
    footer_text: "Branta Tech - AI TVC/OVC, UGC, Motion Ads, SaaS Products, Website, CRM, ERP Solutions.",
    signature_name: "Branta Tech - Finance",
    signature_title: "Authorized Signature",
    payment_info: null,
    payment_note: null,
    sections: {
      description: true,
      installments: true,
      stakeholders: false,
      notes: true,
      footer: true,
      payment_info: true,
      terms: true,
    },
  };
}
