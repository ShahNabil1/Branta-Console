// Public signed URL that streams the branded salary slip PDF.
// URL: /api/public/salary/SAL-2608-001.pdf?exp=...&sig=...[&mode=print]
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/salary/$slip.pdf")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw =
          (params as Record<string, string>)["slip.pdf"] ??
          (params as Record<string, string>).slip ??
          "";
        const slip = raw.endsWith(".pdf") ? raw.slice(0, -4) : raw;
        const url = new URL(request.url);
        const exp = Number(url.searchParams.get("exp") ?? "0");
        const sig = url.searchParams.get("sig") ?? "";
        const mode = url.searchParams.get("mode") === "print" ? "print" : "digital";
        const { deviceFromUserAgent } = await import("@/lib/brand/pdf-brand.server");
        const generatedBy = { device: deviceFromUserAgent(request.headers.get("user-agent")) };
        if (!exp || !sig) return new Response("Missing signature", { status: 400 });
        if (exp * 1000 < Date.now()) return new Response("Link expired", { status: 410 });

        const { verifySalarySlipSig, loadSalarySlipPayload } = await import(
          "@/lib/invoice-pdf-signing.server"
        );
        if (!verifySalarySlipSig(slip, exp, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const payload = await loadSalarySlipPayload(supabaseAdmin, slip);
        if (!payload) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

        const { renderSalarySlipPdf } = await import("@/lib/invoice-pdf.server");
        const base = defaultSettings();
        const settings = payload.settings
          ? {
              ...base,
              ...payload.settings,
              header_text: "SALARY SLIP",
              sections: {
                ...base.sections,
                ...((payload.settings as { sections?: object }).sections ?? {}),
              },
            }
          : base;

        const bytes = await renderSalarySlipPdf(
          {
            slip: payload.slip,
            employeeName: payload.employeeName,
            employeeCode: payload.employeeCode,
            employeeRole: payload.employeeRole,
            preparedByName: payload.preparedByName,
            settings,
          },
          { mode, generatedBy },
        );

        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="Salary-${slip}${mode === "print" ? "-print" : ""}.pdf"`,
            "cache-control": "private, no-store",
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
    header_text: "SALARY SLIP",
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
