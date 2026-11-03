import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertGroupAdmin } from "./group-admin";
import { dbError } from "./db-errors";
import { CompanyInvoiceTemplateSchema, applyInvoiceDefaults, scopeInvoiceTemplate } from "./company-invoice-template";

async function authorize(sb: any, userId: string) {
  await assertGroupAdmin(sb, userId);
  const { data, error } = await sb.rpc("is_finance_admin", { _user_id: userId });
  if (error) throw dbError(error);
  if (!data) throw new Error("Finance access is required for Invoice Studio.");
}
const companyInput = z.object({ companyId: z.string().uuid() });
export const getCompanyInvoiceStudio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator((i: unknown) => companyInput.parse(i))
  .handler(async ({ data, context }) => {
    await authorize(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: company, error } = await sb.from("companies").select("id,is_holding,name").eq("id", data.companyId).single();
    if (error) throw dbError(error);
    const { companyInvoiceSettings } = await import("./company-invoice-template.server");
    const [template, versions, invoices, reference] = await Promise.all([
      companyInvoiceSettings(sb, data.companyId),
      sb.from("company_invoice_templates").select("revision,created_at,settings").eq("company_id", data.companyId).order("revision", { ascending: false }).limit(20),
      sb.from("invoices").select("id,slug,title,customers!inner(company_id)").eq("customers.company_id", data.companyId).is("archived_at", null).neq("status", "void").order("created_at", { ascending: false }).limit(30),
      sb.from("invoices").select("id,slug,title,customers!inner(companies!inner(is_holding))").eq("customers.companies.is_holding", true).is("archived_at", null).neq("status", "void").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const r of [versions, invoices, reference]) if (r.error) throw dbError(r.error);
    return { ...template, isHolding: Boolean(company.is_holding), versions: (versions.data ?? []) as { revision: number; created_at: string; settings: unknown }[],
      invoices: (invoices.data ?? []).map((r: any) => ({ id: r.id as string, slug: r.slug as string, title: r.title as string })),
      reference: reference.data ? { id: reference.data.id as string, slug: reference.data.slug as string, title: reference.data.title as string } : null };
  });

export const previewCompanyInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => companyInput.extend({ settings: CompanyInvoiceTemplateSchema, invoiceId: z.string().uuid(), mode: z.enum(["digital", "print"]) }).parse(i))
  .handler(async ({ data, context }) => {
    await authorize(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: company, error } = await sb.from("companies").select("is_holding").eq("id", data.companyId).single();
    if (error) throw dbError(error);
    const { data: inv, error: invError } = await sb.from("invoices").select("slug,customers!inner(company_id,companies!inner(is_holding))").eq("id", data.invoiceId).is("archived_at", null).neq("status", "void").single();
    if (invError) throw dbError(invError);
    if (inv.customers.company_id !== data.companyId && !inv.customers.companies.is_holding) throw new Error("This invoice belongs to another company.");
    const { loadInvoicePdfPayload } = await import("./invoice-pdf-signing.server");
    const payload = await loadInvoicePdfPayload(sb, inv.slug);
    if (!payload) throw new Error("Invoice not found.");
    const settings = scopeInvoiceTemplate(data.settings, company.is_holding);
    const { renderInvoicePdf } = await import("./invoice-pdf.server");
    const bytes = await renderInvoicePdf({ ...payload, invoice: applyInvoiceDefaults(payload.invoice, settings), settings }, { mode: data.mode });
    return { pdf: Buffer.from(bytes).toString("base64") };
  });

export const saveCompanyInvoiceTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => companyInput.extend({ settings: CompanyInvoiceTemplateSchema, expectedRevision: z.number().int().min(0) }).parse(i))
  .handler(async ({ data, context }) => {
    await authorize(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: company, error: companyError } = await supabaseAdmin.from("companies").select("is_holding").eq("id", data.companyId).single();
    if (companyError) throw dbError(companyError);
    const settings = scopeInvoiceTemplate(data.settings, company.is_holding);
    const { data: revision, error } = await supabaseAdmin.rpc("save_company_invoice_template", { _company: data.companyId, _settings: settings, _actor: context.userId, _expected_revision: data.expectedRevision });
    if (error) throw dbError(error);
    return { revision, settings };
  });