import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertGroupAdmin } from "@/lib/group-admin";
import { dbError } from "@/lib/db-errors";
import type { FinanceExport, FinanceIncome } from "@/lib/finance-export";

export const FinanceExportRange = z
  .object({
    from: z.iso.date().nullable().default(null),
    to: z.iso.date().nullable().default(null),
  })
  .refine((r) => !r.from || !r.to || r.from <= r.to, {
    message: "From date must be on or before To date",
  });

export const getFinanceExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FinanceExportRange.parse(input))
  .handler(async ({ data, context }) => {
    await assertGroupAdmin(
      context.supabase,
      context.userId,
      "Only admin users can export finance reports.",
    );
    setResponseHeader("Cache-Control", "private, no-store");
    const sb = context.supabase;
    const income: FinanceIncome[] = [];
    // Receipts in income_vouchers describe these payments; never add receipts as extra income.
    for (let offset = 0; ; offset += 1000) {
      let query = sb
        .from("invoice_installments")
        .select(
          "id, paid_at, paid_amount, amount, payment_ref, payment_method, invoices!inner(title, currency, customers(name))",
        )
        .eq("status", "paid")
        .eq("invoices.currency", "BDT")
        .not("paid_at", "is", null)
        .order("paid_at")
        .order("id")
        .range(offset, offset + 999);
      if (data.from) query = query.gte("paid_at", `${data.from}T00:00:00Z`);
      if (data.to) query = query.lte("paid_at", `${data.to}T23:59:59.999999Z`);
      const { data: rows, error } = await query;
      if (error) throw dbError(error);
      for (const row of rows ?? [])
        income.push({
          date: (row.paid_at ?? "").slice(0, 10),
          transactionId: row.payment_ref ?? "",
          party: row.invoices?.customers?.name ?? "",
          purpose: row.invoices?.title ?? "",
          method: row.payment_method ?? "",
          amount: Number(row.paid_amount ?? row.amount),
        });
      if ((rows?.length ?? 0) < 1000) break;
    }
    let manualCount = 0;
    for (let offset = 0; ; offset += 1000) {
      let query = sb
        .from("company_ledger")
        .select("id, occurred_on, kind, notes, amount")
        .eq("currency", "BDT")
        .gt("amount", 0)
        .order("occurred_on")
        .order("id")
        .range(offset, offset + 999);
      if (data.from) query = query.gte("occurred_on", data.from);
      if (data.to) query = query.lte("occurred_on", data.to);
      const { data: rows, error } = await query;
      if (error) throw dbError(error);
      for (const row of rows ?? []) {
        manualCount++;
        income.push({
          date: row.occurred_on,
          transactionId: "",
          party: "Company",
          purpose: row.notes || row.kind.replace(/_/g, " "),
          method: "",
          amount: Number(row.amount),
        });
      }
      if ((rows?.length ?? 0) < 1000) break;
    }
    const { collectFinanceExpenses } = await import("@/lib/expense-report.server");
    const expenses = await collectFinanceExpenses(sb, data.from, data.to);
    const { data: company, error } = await sb
      .from("companies")
      .select("name")
      .eq("is_holding", true)
      .single();
    if (error) throw dbError(error);
    const report: FinanceExport = {
      ...data,
      companyName: company.name,
      income: income.sort((a, b) => a.date.localeCompare(b.date)),
      expenses,
      missingFields: manualCount
        ? ["Manual company ledger: Transaction ID", "Manual company ledger: Payment Method"]
        : [],
    };
    const { buildFinanceExportPdf } = await import("@/lib/finance-export-pdf.server");
    const bytes = await buildFinanceExportPdf(report);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { report, pdfBase64: btoa(binary) };
  });
