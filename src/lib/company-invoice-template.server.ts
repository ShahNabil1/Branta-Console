import { dbError } from "./db-errors";
import { completeInvoiceTemplate } from "./company-invoice-template";
import { DEFAULT_PAYMENT_INFO, DEFAULT_PAYMENT_NOTE } from "./invoice-pdf.server";

type Sb = { from: (table: string) => any; rpc: (name: string, args: object) => any };
export async function companyInvoiceSettings(sb: Sb, companyId: string) {
  const { data: row, error } = await sb.from("company_invoice_templates").select("settings,revision").eq("company_id", companyId).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (error) throw dbError(error);
  if (row) return { settings: completeInvoiceTemplate(row.settings), revision: row.revision as number };
  const { data: base, error: baseError } = await sb.rpc("company_invoice_base_settings", { _company: companyId });
  if (baseError) throw dbError(baseError);
  const settings = completeInvoiceTemplate(base ?? {});
  if (settings.use_branta_assets) {
    settings.payment_info ||= DEFAULT_PAYMENT_INFO;
    settings.payment_note ||= DEFAULT_PAYMENT_NOTE;
    if (!settings.logo_url) {
      const { BRAND_LOGO_COLOR_B64 } = await import("./brand/logo-color.server");
      settings.logo_url = `data:image/png;base64,${BRAND_LOGO_COLOR_B64}`;
    }
    if (!settings.logo_inverse_url) {
      const { BRAND_LOGO_WHITE_B64 } = await import("./brand/logo-white.server");
      settings.logo_inverse_url = `data:image/png;base64,${BRAND_LOGO_WHITE_B64}`;
    }
  }
  return { settings, revision: 0 };
}