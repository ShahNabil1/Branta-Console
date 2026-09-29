import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertFinance(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_finance_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Finance access required");
}

export type FundBalance = {
  fund_id: string; code: string; name: string; kind: string; is_active: boolean; display_order: number;
  ledger_balance: number; allocation_total: number; spent_total: number;
  committed: number; borrowed: number; lent: number; available: number; percent: number; paid_total: number;
};

export const getFundDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const };
    const [bal, ver, allocs, fails, invs] = await Promise.all([
      sb.from("fund_balances").select("*").order("display_order"),
      sb.from("fund_allocation_versions").select("id,name,effective_from").order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("installment_allocations").select("received_amount,deduction_total,distributable_amount").eq("status", "active"),
      sb.from("installment_allocation_failures").select("installment_id,error,attempts,last_attempt_at"),
      sb.from("invoices").select("total_amount,paid_amount,status").neq("status", "void"),
    ]);
    let pct: Record<string, number> = {};
    if (ver.data) {
      const { data: items } = await sb.from("fund_allocation_version_items").select("fund_id,percent").eq("version_id", ver.data.id);
      pct = Object.fromEntries((items ?? []).map((i: any) => [i.fund_id, Number(i.percent)]));
    }
    const funds: FundBalance[] = (bal.data ?? []).map((b: any) => ({
      ...b,
      ledger_balance: Number(b.ledger_balance), allocation_total: Number(b.allocation_total), spent_total: Number(b.spent_total),
      committed: Number(b.committed ?? 0), borrowed: Number(b.borrowed ?? 0), lent: Number(b.lent ?? 0),
      paid_total: Number(b.paid_total ?? 0),
      available: Number(b.ledger_balance) - Number(b.committed ?? 0), percent: pct[b.fund_id] ?? 0,
    }));
    const sum = (arr: any[], k: string) => arr.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    const a = allocs.data ?? [];
    const iv = invs.data ?? [];
    // failures enrich
    const failRows = fails.data ?? [];
    let failures: any[] = [];
    if (failRows.length) {
      const { data: insts } = await sb.from("invoice_installments").select("id,label,sequence,paid_amount,amount,invoice_id,invoices(slug,title,customers(name))").in("id", failRows.map((f: any) => f.installment_id));
      const m = new Map((insts ?? []).map((i: any) => [i.id, i]));
      failures = failRows.map((f: any) => {
        const i: any = m.get(f.installment_id);
        return { ...f, label: i?.label ?? `Installment ${i?.sequence ?? ""}`, amount: Number(i?.paid_amount || i?.amount || 0), invoice_slug: i?.invoices?.slug, invoice_title: i?.invoices?.title, client: i?.invoices?.customers?.name };
      });
    }
    const invoiced = sum(iv, "total_amount"), collected = sum(iv, "paid_amount");
    return {
      allowed: true as const,
      version: ver.data,
      funds,
      overview: {
        invoiced, collected, outstanding: invoiced - collected,
        deductions: sum(a, "deduction_total"), distributable: sum(a, "distributable_amount"),
        allocated: funds.reduce((x, f) => x + f.allocation_total, 0),
        spent: funds.reduce((x, f) => x + f.spent_total, 0),
        balance: funds.reduce((x, f) => x + f.ledger_balance, 0),
        available: funds.reduce((x, f) => x + f.available, 0),
        profit: funds.find((f) => f.code === "profit")?.ledger_balance ?? 0,
        unallocated: failures.length,
      },
      failures,
    };
  });

export const retryAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ installmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { error } = await (context.supabase as any).rpc("retry_installment_allocation", { _installment_id: data.installmentId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reverseAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ allocationId: z.string().uuid(), reason: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { error } = await (context.supabase as any).rpc("reverse_installment_allocation", { _allocation_id: data.allocationId, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getInvoiceAllocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const, rows: [] };
    const [{ data: insts }, { data: allocs }, { data: fails }] = await Promise.all([
      sb.from("invoice_installments").select("id,label,sequence,status,paid_amount,amount,paid_at").eq("invoice_id", data.invoiceId).order("sequence"),
      sb.from("installment_allocations").select("id,installment_id,status,received_amount,deduction_total,distributable_amount,created_at,reversal_reason,fund_allocation_versions(name),installment_allocation_items(fund_name,percent,amount),installment_allocation_deductions(name,amount_type,value,amount)").eq("invoice_id", data.invoiceId).order("created_at"),
      sb.from("installment_allocation_failures").select("installment_id,error"),
    ]);
    const failMap = new Map((fails ?? []).map((f: any) => [f.installment_id, f.error]));
    const rows = (insts ?? []).filter((i: any) => i.status === "paid").map((i: any) => {
      const list = (allocs ?? []).filter((a: any) => a.installment_id === i.id);
      return {
        installment: i,
        active: list.find((a: any) => a.status === "active") ?? null,
        history: list.filter((a: any) => a.status !== "active"),
        error: failMap.get(i.id) ?? null,
      };
    });
    return { allowed: true as const, rows };
  });

export const getFundSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const };
    const [funds, versions, rules] = await Promise.all([
      sb.from("finance_funds").select("*").order("display_order"),
      sb.from("fund_allocation_versions").select("id,name,effective_from,created_at,fund_allocation_version_items(fund_id,percent)").order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("fund_deduction_rules").select("*").order("created_at"),
    ]);
    return { allowed: true as const, funds: funds.data ?? [], versions: versions.data ?? [], rules: rules.data ?? [] };
  });

export const saveFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(2), code: z.string().regex(/^[a-z0-9_]{2,30}$/).optional(),
    description: z.string().nullable().optional(), is_active: z.boolean(), display_order: z.number().int(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const sb = context.supabase as any;
    const { id, ...rest } = data;
    const q = id ? sb.from("finance_funds").update({ name: rest.name, description: rest.description, is_active: rest.is_active, display_order: rest.display_order }).eq("id", id)
      : sb.from("finance_funds").insert({ ...rest, code: rest.code ?? rest.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30) });
    const { error } = await q;
    if (error) throw new Error(error.message);
    await sb.from("fund_audit_logs").insert({ user_id: context.userId, action: id ? "fund_update" : "fund_create", record_type: "finance_fund", record_id: id ?? null, next: rest });
    return { ok: true };
  });

export const saveAllocationVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().min(2), effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(5),
    items: z.array(z.object({ fund_id: z.string().uuid(), percent: z.number().min(0).max(100) })).min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const total = Math.round(data.items.reduce((a, i) => a + i.percent, 0) * 1000) / 1000;
    if (total !== 100) throw new Error(`Total must be exactly 100% (current ${total}%)`);
    const sb = context.supabase as any;
    const { data: v, error } = await sb.from("fund_allocation_versions").insert({ name: data.name, effective_from: data.effective_from, notes: data.reason, created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    const { error: e2 } = await sb.from("fund_allocation_version_items").insert(data.items.map((i) => ({ ...i, version_id: v.id })));
    if (e2) throw new Error(e2.message);
    await sb.from("fund_audit_logs").insert({ user_id: context.userId, action: "allocation_version_create", record_type: "fund_allocation_version", record_id: v.id, next: data, reason: data.reason });
    return { ok: true };
  });

export const saveDeductionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(), name: z.string().min(2),
    amount_type: z.enum(["percent", "fixed"]), value: z.number().nonnegative(), is_active: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const sb = context.supabase as any;
    const { id, ...rest } = data;
    const { error } = id ? await sb.from("fund_deduction_rules").update(rest).eq("id", id) : await sb.from("fund_deduction_rules").insert({ ...rest, created_by: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
