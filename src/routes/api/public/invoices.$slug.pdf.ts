// Public signed URL that streams the branded invoice PDF.
// URL: /api/public/invoices/BT-01.pdf?exp=...&sig=...
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/invoices/$slug/pdf")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const rawSlug = params.slug;
        // The route file name is `invoices.$slug.pdf.ts` → slug param includes `.pdf` at end.
        const slug = rawSlug.endsWith(".pdf") ? rawSlug.slice(0, -4) : rawSlug;
        const url = new URL(request.url);
        const exp = Number(url.searchParams.get("exp") ?? "0");
        const sig = url.searchParams.get("sig") ?? "";
        if (!exp || !sig) return new Response("Missing signature", { status: 400 });
        if (exp * 1000 < Date.now()) return new Response("Link expired", { status: 410 });

        const { verifyInvoiceSlug, loadInvoicePdfPayload } = await import("@/lib/invoice-pdf-signing.server");
        if (!verifyInvoiceSlug(slug, exp, sig)) return new Response("Invalid signature", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const payload = await loadInvoicePdfPayload(supabaseAdmin, slug);
        if (!payload) return new Response("Not found", { status: 404 });

        const { renderInvoicePdf } = await import("@/lib/invoice-pdf.server");
        const bytes = await renderInvoicePdf({
          invoice: payload.invoice,
          customer: payload.customer,
          installments: payload.installments,
          settings: payload.settings ?? defaultSettings(),
        });

        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="Invoice-${slug}.pdf"`,
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
    company_tagline: "Software · Design · Growth",
    company_address: "Dhaka, Bangladesh",
    company_email: "finance@brantatech.com",
    company_website: "https://brantatech.com",
    logo_url: null,
    brand_color: "#E56A17",
    header_bg_color: "#FFFFFF",
    page_bg_color: "#FFFFFF",
    panel_bg_color: "#F9FAFB",
    text_color: "#111827",
    muted_color: "#6B7280",
    hairline_color: "#E5E7EB",
    header_text: "INVOICE",
    footer_text: "Thank you for your business.",
    signature_name: "Branta Tech · Finance",
    signature_title: "finance@brantatech.com",
    sections: { description: true, installments: true, stakeholders: false, notes: true, footer: true },
  };
}
