import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_finance_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Finance access required");
  return ctx.supabase as any;
}
const uuid = z.string().uuid();
const money = z.number().positive();
function rpcErr(error: any) { if (error) throw new Error(error.message); }

export type FundOption = { id: string; code: string; name: string; available: number; ledger_balance: number };

export const listFundOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await (context.supabase as any).rpc("is_finance_admin", { _user_id: context.userId });
    if (!ok) return [] as FundOption[];
    const { data } = await (context.supabase as any).from("fund_balances").select("fund_id,code,name,ledger_balance,committed,is_active,display_order").eq("is_active", true).order("display_order");
    return (data ?? []).map((f: any) => ({ id: f.fund_id, code: f.code, name: f.name, ledger_balance: Number(f.ledger_balance), available: Number(f.ledger_balance) - Number(f.committed) })) as FundOption[];
  });

export const fundTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: uuid, to: uuid, amount: money, reason: z.string().min(5), expenseId: uuid.nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await fin(context);
    const { error } = await sb.rpc("fund_transfer", { _from: data.from, _to: data.to, _amount: data.amount, _reason: data.reason, _expense: data.expenseId ?? null });
    rpcErr(error); return { ok: true };
  });

export const fundLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: uuid, to: uuid, amount: money, reason: z.string().min(5), expenseId: uuid.nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await fin(context);
    const { error } = await sb.rpc("fund_loan_create", { _from: data.from, _to: data.to, _amount: data.amount, _reason: data.reason, _expense: data.expenseId ?? null });
    rpcErr(error); return { ok: true };
  });

export const repayLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ loanId: uuid, amount: money, notes: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await fin(context);
    const { error } = await sb.rpc("fund_loan_repay", { _loan: data.loanId, _amount: data.amount, _notes: data.notes ?? null });
    rpcErr(error); return { ok: true };
  });

export const cancelLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ loanId: uuid, reason: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await fin(context);
    const { error } = await sb.rpc("fund_loan_cancel", { _loan: data.loanId, _reason: data.reason });
    rpcErr(error); return { ok: true };
  });

export const listTransfersAndLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await fin(context);
    const [t, l, r, w] = await Promise.all([
      sb.from("fund_transfers").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("fund_loans").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("fund_loan_repayments").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("owner_withdrawals").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    return { transfers: t.data ?? [], loans: l.data ?? [], repayments: r.data ?? [], withdrawals: w.data ?? [] };
  });

export const ownerWithdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    amount: money, name: z.string().min(2), userId: uuid.nullable().optional(), method: z.string().nullable().optional(),
    ref: z.string().nullable().optional(), date: z.string().nullable().optional(), reason: z.string().min(5), notes: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await fin(context);
    const { error } = await sb.rpc("owner_withdraw", { _amount: data.amount, _name: data.name, _user: data.userId ?? null, _method: data.method ?? null, _ref: data.ref ?? null, _date: data.date || null, _reason: data.reason, _notes: data.notes ?? null });
    rpcErr(error); return { ok: true };
  });

// ---------- Employee fund payments ----------
export const PAYMENT_TYPES = ["project_payment", "salary", "bonus", "incentive", "commission", "overtime", "adjustment"] as const;

export const getEmployeePaymentContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await fin(context);
    const [pays, emps, projects, invoices] = await Promise.all([
      sb.from("employee_fund_payments").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("profiles").select("user_id,full_name,employee_code").order("full_name"),
      sb.from("client_projects").select("id,name").order("created_at", { ascending: false }).limit(500),
      sb.from("invoices").select("id,slug,title").order("created_at", { ascending: false }).limit(500),
    ]);
    return { payments: pays.data ?? [], employees: emps.data ?? [], projects: projects.data ?? [], invoices: invoices.data ?? [] };
  });

/** Existing payouts / salary slips for an employee so finance can link instead of duplicating. */
export const findExistingCompensation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ employeeId: uuid, invoiceId: uuid.nullable().optional(), projectId: uuid.nullable().optional(), amount: z.number().nullable().optional(), type: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await fin(context);
    let pq = sb.from("invoice_payouts").select("id,invoice_id,amount,status,role,currency").eq("user_id", data.employeeId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50);
    if (data.invoiceId) pq = pq.eq("invoice_id", data.invoiceId);
    const [payouts, slips, linked, similar] = await Promise.all([
      pq,
      sb.from("salary_slips").select("id,slip_no,period_month,net_amount,status").eq("user_id", data.employeeId).order("period_month", { ascending: false }).limit(24),
      sb.from("employee_fund_payments").select("invoice_payout_id,salary_slip_id").eq("employee_id", data.employeeId).neq("status", "cancelled"),
      sb.from("employee_fund_payments").select("id,amount,payment_type,status,project_id,invoice_id,created_at").eq("employee_id", data.employeeId).neq("status", "cancelled"),
    ]);
    const usedPayouts = new Set((linked.data ?? []).map((l: any) => l.invoice_payout_id).filter(Boolean));
    const usedSlips = new Set((linked.data ?? []).map((l: any) => l.salary_slip_id).filter(Boolean));
    const amt = Number(data.amount ?? 0);
    const suspicious = (similar.data ?? []).filter((p: any) =>
      p.payment_type === data.type &&
      (!data.projectId || p.project_id === data.projectId) &&
      (!data.invoiceId || p.invoice_id === data.invoiceId) &&
      amt > 0 && Math.abs(Number(p.amount) - amt) <= Math.max(1, amt * 0.1));
    return {
      payouts: (payouts.data ?? []).map((p: any) => ({ ...p, linked: usedPayouts.has(p.id) })),
      slips: (slips.data ?? []).map((s: any) => ({ ...s, linked: usedSlips.has(s.id) })),
      suspicious,
    };
  });

export const createEmployeePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    employee_id: uuid, payment_type: z.enum(PAYMENT_TYPES), amount: money,
    project_id: uuid.nullable().optional(), invoice_id: uuid.nullable().optional(), task_id: uuid.nullable().optional(),
    salary_slip_id: uuid.nullable().optional(), invoice_payout_id: uuid.nullable().optional(),
    description: z.string().nullable().optional(), payment_method: z.string().nullable().optional(),
    transaction_reference: z.string().nullable().optional(), notes: z.string().nullable().optional(),
    status: z.enum(["draft", "approved"]).default("draft"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await fin(context);
    if (data.payment_type !== "salary" && data.salary_slip_id) throw new Error("Salary slip can only be linked to Salary payments");
    const { data: row, error } = await sb.from("employee_fund_payments").insert({ ...data, created_by: context.userId }).select("id").single();
    if (error) {
      if (String(error.message).includes("efp_one_payout")) throw new Error("This invoice payout is already linked to another employee fund payment");
      if (String(error.message).includes("efp_one_slip")) throw new Error("This salary slip is already linked to another employee fund payment");
      throw new Error(error.message);
    }
    await sb.from("fund_audit_logs").insert({ user_id: context.userId, action: "employee_payment_create", record_type: "employee_fund_payment", record_id: row.id, next: data });
    return { id: row.id as string };
  });

export const setEmployeePaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, status: z.enum(["approved", "committed", "paid", "cancelled"]), reason: z.string().nullable().optional(), method: z.string().nullable().optional(), ref: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await fin(context);
    const { error } = await sb.rpc("employee_payment_set_status", { _id: data.id, _status: data.status, _reason: data.reason ?? null, _method: data.method ?? null, _ref: data.ref ?? null });
    rpcErr(error); return { ok: true };
  });

/** Parse "INSUFFICIENT_FUND: required X, available Y, shortfall Z" errors. */
export function parseInsufficient(msg: string): { required: number; available: number; shortfall: number } | null {
  const m = /INSUFFICIENT_FUND: required ([\d.-]+), available ([\d.-]+), shortfall ([\d.-]+)/.exec(msg);
  return m ? { required: Number(m[1]), available: Number(m[2]), shortfall: Number(m[3]) } : null;
}
