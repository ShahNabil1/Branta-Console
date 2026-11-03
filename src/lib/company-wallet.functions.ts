/* eslint-disable @typescript-eslint/no-explicit-any */
// Company-scoped finance (sister companies). Writes go only through SECURITY DEFINER RPCs
// that re-check Finance / company access; the wallet ledger is append-only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";

const bucketSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1).max(60),
  mode: z.enum(["percent", "fixed"]),
  percent: z.number().min(0).max(100),
  fixed_amount: z.number().min(0).max(1e10),
});

export const getCompanyFundConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { companyId: string }) => z.object({ companyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: cfgs, error } = await sb
      .from("company_fund_configs")
      .select("id, version, is_active, note, created_at, company_fund_buckets(id, key, label, mode, percent, fixed_amount, sort)")
      .eq("company_id", data.companyId)
      .order("version", { ascending: false })
      .limit(20);
    if (error) throw dbError(error);
    return { active: (cfgs ?? []).find((c: any) => c.is_active) ?? null, history: cfgs ?? [] };
  });

export const saveCompanyFundConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ companyId: z.string().uuid(), note: z.string().max(300).optional(), buckets: z.array(bucketSchema).min(1).max(20) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("save_company_fund_config", {
      _company: data.companyId, _buckets: data.buckets, _note: data.note ?? null,
    });
    if (error) throw dbError(error);
    return { id: id as string };
  });

export const getCompanyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { companyId: string; limit?: number }) =>
    z.object({ companyId: z.string().uuid(), limit: z.number().int().min(1).max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const [bal, stmt, loans] = await Promise.all([
      sb.from("company_wallet_balances").select("bucket_key, bucket_kind, balance").eq("company_id", data.companyId),
      sb.from("company_wallet_running")
        .select("id, occurred_at, description, record_ref, bucket_key, bucket_kind, direction, amount, entry_type, movement_id, reverses_id, running_balance")
        .eq("company_id", data.companyId)
        .order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false })
        .limit(data.limit ?? 200),
      sb.from("company_loan_requests")
        .select("id, amount, currency, purpose, tenure_months, status, decision_note, created_at, decided_at")
        .eq("company_id", data.companyId).order("created_at", { ascending: false }).limit(50),
    ]);
    for (const r of [bal, stmt, loans]) if (r.error) throw dbError(r.error);
    const buckets = (bal.data ?? []).map((b: any) => ({ ...b, balance: Number(b.balance) }));
    return {
      total: buckets.reduce((s: number, b: any) => s + b.balance, 0),
      buckets,
      statement: stmt.data ?? [],
      loans: loans.data ?? [],
    };
  });

export const requestCompanyLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      companyId: z.string().uuid(),
      amount: z.number().positive().max(1e10),
      purpose: z.string().trim().min(3).max(500),
      tenureMonths: z.number().int().min(1).max(60).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("company_loan_request", {
      _company: data.companyId, _amount: data.amount, _purpose: data.purpose, _tenure: data.tenureMonths ?? null,
    });
    if (error) throw dbError(error);
    return { id: id as string };
  });

export const decideCompanyLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ loanId: z.string().uuid(), approve: z.boolean(), note: z.string().max(300).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("company_loan_decide", {
      _loan: data.loanId, _approve: data.approve, _note: data.note ?? null,
    });
    if (error) throw dbError(error);
    return { ok: true };
  });

export const moveCompanyWalletFunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ companyId: z.string().uuid(), from: z.string(), to: z.string(), amount: z.number().positive(), reason: z.string().trim().min(3).max(300) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("company_wallet_move", {
      _company: data.companyId, _from: data.from, _to: data.to, _amount: data.amount, _reason: data.reason,
    });
    if (error) throw dbError(error);
    return { movementId: id as string };
  });


/** Invoice form: which company a customer belongs to, and that sister company's active fund split. */
export const getCustomerFundContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { customerId?: string | null; companyId?: string | null }) => z.object({ customerId: z.string().uuid().nullish(), companyId: z.string().uuid().nullish() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let companyId = data.companyId ?? null;
    if (!companyId && data.customerId) {
      const { data: cu } = await sb.from("customers").select("company_id").eq("id", data.customerId).maybeSingle();
      companyId = cu?.company_id ?? null;
    }
    if (!companyId) return { sister: false as const };
    const { data: co } = await sb.from("companies").select("id, name, slug, is_holding").eq("id", companyId).maybeSingle();
    if (!co || co.is_holding) return { sister: false as const };
    const { data: cfg, error } = await sb.from("company_fund_configs")
      .select("version, company_fund_buckets(key, label, mode, percent, fixed_amount, sort)")
      .eq("company_id", co.id).eq("is_active", true).maybeSingle();
    if (error) throw dbError(error);
    const funds = [...(cfg?.company_fund_buckets ?? [])].sort((a: any, b: any) => a.sort - b.sort).map((b: any) => ({
      key: b.key as string, label: b.label as string, mode: (b.mode === "fixed" ? "fixed" : "percent") as "fixed" | "percent",
      percent: Number(b.percent), fixed_amount: Number(b.fixed_amount ?? 0),
    }));
    return { sister: true as const, company: { id: co.id as string, name: co.name as string, slug: co.slug as string }, version: (cfg?.version ?? null) as number | null, funds };
  });
