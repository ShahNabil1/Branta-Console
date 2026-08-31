// Salary management server functions.
// Issuing a slip records a company expense (category = salary) AND credits
// the employee wallet with a manual payout, so both sides stay in sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type SalaryCurrency = "BDT" | "USD";

export interface SalaryComponent {
  label: string;
  /** Positive = earning, negative = deduction. */
  amount: number;
  /** Optional link to a real invoice this pay line came from. */
  invoice_id?: string | null;
  invoice_slug?: string | null;
}

export interface SalarySlipRow {
  id: string;
  slip_no: string | null;
  user_id: string;
  period_month: string;
  currency: SalaryCurrency;
  base_amount: number;
  components: SalaryComponent[];
  net_amount: number;
  reason: string | null;
  payment_method: string | null;
  bank_name: string | null;
  txn_id: string | null;
  paid_on: string;
  status: "issued" | "void";
  expense_id: string | null;
  payout_id: string | null;
  signed_slip_url: string | null;
  signed_slip_at: string | null;
  created_by: string | null;
  created_at: string;
  employee_name?: string | null;
  employee_code?: string | null;
}

const ComponentIn = z.object({
  label: z.string().trim().min(1).max(120),
  amount: z.number(),
  invoice_id: z.string().uuid().nullable().optional(),
  invoice_slug: z.string().trim().max(40).nullable().optional(),
});

const IssueIn = z.object({
  user_id: z.string().uuid(),
  period_month: z.string().regex(/^\d{4}-\d{2}$/),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  base_amount: z.number().nonnegative(),
  components: z.array(ComponentIn).max(24).default([]),
  reason: z.string().trim().max(600).nullable().optional(),
  payment_method: z.string().trim().max(80).nullable().optional(),
  bank_name: z.string().trim().max(120).nullable().optional(),
  txn_id: z.string().trim().max(120).nullable().optional(),
  paid_on: z.string(),
  department: z.string().trim().max(80).nullable().optional(),
});


async function ensureFinanceAdmin(
  supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  userId: string,
) {
  const { data, error } = await supabase.rpc("is_finance_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — finance role required");
}

function netOf(base: number, comps: SalaryComponent[]): number {
  return Number((Number(base) + comps.reduce((a, c) => a + Number(c.amount || 0), 0)).toFixed(2));
}

export const listSalarySlips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SalarySlipRow[]> => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("salary_slips")
      .select("*")
      .order("period_month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as SalarySlipRow[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    if (!ids.length) return rows;
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("user_id, full_name, employee_code")
      .in("user_id", ids);
    const byId = new Map(
      ((profs ?? []) as Array<{ user_id: string; full_name: string | null; employee_code: string | null }>)
        .map((p) => [p.user_id, p]),
    );
    return rows.map((r) => ({
      ...r,
      components: Array.isArray(r.components) ? r.components : [],
      employee_name: byId.get(r.user_id)?.full_name ?? null,
      employee_code: byId.get(r.user_id)?.employee_code ?? null,
    }));
  });

export const listMySalarySlips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SalarySlipRow[]> => {
    const { data, error } = await context.supabase
      .from("salary_slips")
      .select("*")
      .eq("user_id", context.userId)
      .order("period_month", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as SalarySlipRow[]).map((r) => ({
      ...r,
      components: Array.isArray(r.components) ? r.components : [],
    }));
  });

export const issueSalarySlip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IssueIn.parse(d))
  .handler(async ({ data, context }): Promise<SalarySlipRow> => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);

    const { data: prof } = await context.supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (!prof) throw new Error("Employee not found");
    const employeeName = (prof as { full_name: string | null }).full_name ?? "Employee";

    const periodDate = `${data.period_month}-01`;
    const comps = data.components.filter((c) => Number(c.amount) !== 0);
    const net = netOf(data.base_amount, comps);
    if (net <= 0) throw new Error("Net payable must be greater than zero.");

    // Guard the duplicate month before writing the expense/payout rows.
    const { data: dupe } = await context.supabase
      .from("salary_slips")
      .select("id, slip_no")
      .eq("user_id", data.user_id)
      .eq("period_month", periodDate)
      .neq("status", "void")
      .maybeSingle();
    if (dupe) {
      throw new Error(
        `A salary slip (${(dupe as { slip_no: string | null }).slip_no ?? "existing"}) already exists for this employee and month. Void it first.`,
      );
    }

    const monthLabel = new Date(`${periodDate}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    // 1) Company expense
    const { data: expRow, error: expErr } = await context.supabase
      .from("expenses")
      .insert({
        category: "salary",
        amount: net,
        currency: data.currency,
        spent_on: data.paid_on,
        paid_by: context.userId,
        vendor: employeeName,
        notes: [
          `Salary for ${monthLabel} — ${employeeName}`,
          data.reason ?? null,
          comps.length
          comps.length
            ? comps
                .map((c) => `${c.invoice_slug ? `[${c.invoice_slug}] ` : ""}${c.label}: ${c.amount > 0 ? "+" : ""}${c.amount}`)
                .join(" · ")
            : null,
          data.bank_name ? `Bank/Wallet: ${data.bank_name}` : null,
        ].filter(Boolean).join("\n"),
        txn_id: data.txn_id ?? null,
        payment_method: data.payment_method ?? null,

        department: data.department ?? "HR & Admin",
        requested_by: data.user_id,
        request_purpose: data.reason ?? `Monthly salary — ${monthLabel}`,
      } as never)
      .select("id")
      .single();
    if (expErr) throw new Error(expErr.message);
    const expenseId = (expRow as { id: string }).id;

    // 2) Employee wallet credit
    const { data: payRow, error: payErr } = await context.supabase
      .from("invoice_payouts")
      .insert({
        user_id: data.user_id,
        role: "worker",
        currency: data.currency,
        amount: net,
        status: "available",
        source: "manual",
        kind: "salary",
        notes: `Salary — ${monthLabel}`,
        unlocked_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    if (payErr) {
      await context.supabase.from("expenses").delete().eq("id", expenseId);
      throw new Error(payErr.message);
    }
    const payoutId = (payRow as { id: string }).id;

    // 3) The slip itself
    const { data: slipRow, error: slipErr } = await context.supabase
      .from("salary_slips")
      .insert({
        user_id: data.user_id,
        period_month: periodDate,
        currency: data.currency,
        base_amount: data.base_amount,
        components: comps,
        net_amount: net,
        reason: data.reason ?? null,
        payment_method: data.payment_method ?? null,
        bank_name: data.bank_name ?? null,
        txn_id: data.txn_id ?? null,

        paid_on: data.paid_on,
        status: "issued",
        expense_id: expenseId,
        payout_id: payoutId,
        created_by: context.userId,
      } as never)
      .select("*")
      .single();
    if (slipErr) {
      await context.supabase.from("invoice_payouts").delete().eq("id", payoutId);
      await context.supabase.from("expenses").delete().eq("id", expenseId);
      throw new Error(slipErr.message);
    }

    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "payout.available",
        recipients: [data.user_id],
        vars: {
          slug: `Salary ${monthLabel}`,
          amount: `${data.currency} ${net.toLocaleString()}`,
        },
        dedupeKey: `salary:${(slipRow as { id: string }).id}:issued`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[issueSalarySlip] notify failed:", e);
    }

    return {
      ...(slipRow as unknown as SalarySlipRow),
      employee_name: employeeName,
    };
  });

export const voidSalarySlip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().trim().max(300).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: row } = await context.supabase
      .from("salary_slips").select("*").eq("id", data.id).maybeSingle();
    const slip = row as unknown as SalarySlipRow | null;
    if (!slip) throw new Error("Salary slip not found");
    if (slip.status === "void") throw new Error("This slip is already void");

    // Reverse the wallet credit.
    let mode: "cancelled" | "clawback" | "none" = "none";
    if (slip.payout_id) {
      const { data: p } = await context.supabase
        .from("invoice_payouts")
        .select("id, status, user_id, currency, amount")
        .eq("id", slip.payout_id)
        .maybeSingle();
      const payout = p as { id: string; status: string; user_id: string; currency: string; amount: number } | null;
      if (payout) {
        if (payout.status === "requested") {
          throw new Error(
            "This salary is inside an active withdrawal request. Reject or cancel the withdrawal first.",
          );
        }
        if (payout.status === "available") {
          await context.supabase.from("invoice_payouts")
            .update({ status: "cancelled" } as never).eq("id", payout.id);
          mode = "cancelled";
        } else if (payout.status === "paid") {
          await context.supabase.from("invoice_payouts").insert({
            user_id: payout.user_id,
            role: "worker",
            currency: payout.currency,
            amount: -Number(payout.amount),
            status: "available",
            source: "manual",
            kind: "clawback",
            notes: data.note?.trim() || `Salary slip ${slip.slip_no ?? ""} voided`,
            unlocked_at: new Date().toISOString(),
          } as never);
          mode = "clawback";
        }
      }
    }

    // Remove the company expense so reports stop counting it.
    if (slip.expense_id) {
      await context.supabase.from("expenses").delete().eq("id", slip.expense_id);
    }

    const { error } = await context.supabase
      .from("salary_slips")
      .update({
        status: "void",
        expense_id: null,
        reason: [slip.reason, data.note?.trim() ? `Voided: ${data.note.trim()}` : null]
          .filter(Boolean).join("\n") || null,
      } as never)
      .eq("id", slip.id);
    if (error) throw new Error(error.message);

    return { ok: true as const, mode };
  });

export const getSignedSalarySlipUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), mode: z.enum(["digital", "print"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // RLS already limits visibility: finance sees all, employees see their own.
    const { data: row } = await context.supabase
      .from("salary_slips").select("id, slip_no").eq("id", data.id).maybeSingle();
    const slipNo = (row as { slip_no: string | null } | null)?.slip_no;
    if (!slipNo) throw new Error("Salary slip not found");

    const { getRequestOrigin } = await import("@/lib/invoice-request-origin.server");
    const { buildSignedSalarySlipUrl } = await import("@/lib/invoice-pdf-signing.server");
    let origin = await getRequestOrigin();
    if (!origin) origin = process.env.PUBLIC_BASE_URL || "https://console.brantatech.com";
    const base = buildSignedSalarySlipUrl(origin, slipNo);
    return { url: data.mode === "print" ? `${base}&mode=print` : base, slip_no: slipNo };
  });

export const listSalaryEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("profiles")
      .select("user_id, full_name, employee_code, job_role")
      .order("full_name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      employee_code: string | null;
      job_role: string | null;
    }>;
  });
