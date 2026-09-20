// Public signed URL that streams the branded expense voucher PDF.
// URL: /api/public/expenses/EXP-2608-001.pdf?exp=...&sig=...[&mode=print]
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/expenses/$voucher.pdf")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw =
          (params as Record<string, string>)["voucher.pdf"] ??
          (params as Record<string, string>).voucher ??
          "";
        const voucher = raw.endsWith(".pdf") ? raw.slice(0, -4) : raw;
        const url = new URL(request.url);
        const exp = Number(url.searchParams.get("exp") ?? "0");
        const sig = url.searchParams.get("sig") ?? "";
        const mode = url.searchParams.get("mode") === "print" ? "print" : "digital";
        const { deviceFromUserAgent } = await import("@/lib/brand/pdf-brand.server");
        const generatedBy = { device: deviceFromUserAgent(request.headers.get("user-agent")) };
        if (!exp || !sig) return new Response("Missing signature", { status: 400 });
        if (exp * 1000 < Date.now()) return new Response("Link expired", { status: 410 });

        const { verifyExpenseVoucherSig, loadExpenseVoucherPayload } = await import(
          "@/lib/invoice-pdf-signing.server"
        );
        if (!verifyExpenseVoucherSig(voucher, exp, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const payload = await loadExpenseVoucherPayload(supabaseAdmin, voucher);
        if (!payload) return new Response("Not found", { status: 404 });

        const { renderExpenseVoucherPdf } = await import("@/lib/invoice-pdf.server");
        const base = defaultSettings();
        const settings = payload.settings
          ? {
              ...base,
              ...payload.settings,
              sections: {
                ...base.sections,
                ...((payload.settings as { sections?: object }).sections ?? {}),
              },
            }
          : base;

        const bytes = await renderExpenseVoucherPdf(
          {
            expense: payload.expense,
            items: payload.items,
            attachments: payload.attachments,
            preparedByName: payload.preparedByName,
            paidToName: payload.paidToName,
            requestedByName: payload.requestedByName,
            linkedInvoiceSlug: payload.linkedInvoiceSlug,
            settings,
          },
          { mode, generatedBy },
        );

        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="Voucher-${voucher}${mode === "print" ? "-print" : ""}.pdf"`,
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
    company_address:
      "Office-1: Colony, Bogura, Bangladesh.\nOffice-2: Niketan, Gulshan-1, Dhaka, Bangladesh.",
    company_email: "support@brantatech.org",
    company_website: "brantatech.com",
    company_phone: "09644228678",
    logo_url: null,
    brand_color: "#E56A17",
    header_bg_color: "#FFFFFF",
    page_bg_color: "#FFFFFF",
    panel_bg_color: "#F9FAFB",
    text_color: "#111827",
    muted_color: "#6B7280",
    hairline_color: "#E5E7EB",
    header_text: "EXPENSE VOUCHER",
    footer_text:
      "Branta Tech - AI TVC/OVC, UGC, Motion Ads, SaaS Products, Website, CRM, ERP Solutions.",
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
