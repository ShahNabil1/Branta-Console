import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";

export type WalletBalanceV2 = {
  employee_id: string; currency: string; migrated: boolean; ledger_balance: number; holds: number; available: number;
  pending_committed: number; legacy_pending: number; today_earned: number; week_earned: number; month_earned: number;
  total_earned: number; total_withdrawn: number;
};
export type WalletEntry = {
  id: string; employee_id: string; created_at: string; description: string | null; client: string | null; project: string | null;
  project_id: string | null; invoice_slug: string | null; installment: string | null; task: string | null; transaction_type: string;
  direction: "credit" | "debit"; credit: number; debit: number; status: string; reference: string | null; currency: string;
  source_type: string; source_id: string; reverses_id: string | null; created_by: string | null; balance: number;
};
export type WalletWithdrawalV2 = {
  id: string; employee_id: string; currency: string; amount: number; status: string; payment_method_snapshot: any;
  note: string | null; admin_note: string | null; transfer_ref: string | null; requested_at: string; paid_at: string | null;
};
const num = (o: any, keys: string[]) => { const r = { ...o }; for (const k of keys) r[k] = Number(r[k] ?? 0); return r; };
const BAL_KEYS = ["ledger_balance","holds","available","pending_committed","legacy_pending","today_earned","week_earned","month_earned","total_earned","total_withdrawn"];

function withRunning(rows: any[]): WalletEntry[] {
  const run = new Map<string, number>();
  return rows.map((r) => {
    const k = `${r.employee_id}:${r.currency}`;
    const credit = Number(r.credit), debit = Number(r.debit);
    const b = (run.get(k) ?? 0) + (r.status === "posted" ? credit - debit : 0);
    run.set(k, b);
    return { ...r, credit, debit, balance: b };
  });
}

const userIn = z.object({ userId: z.string().uuid().optional() });

/** Own wallet, or any employee for Finance/Admin (enforced in DB). */
export const getWalletV2 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => userIn.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const uid = data.userId ?? context.userId;
    const [b, s, lp] = await Promise.all([
      sb.rpc("wallet_balances_v2", { _user: uid }),
      sb.rpc("wallet_statement_v2", { _user: uid }),
      sb.rpc("wallet_legacy_pending", { _user: uid }),
    ]);
    for (const r of [b, s, lp]) if (r.error) throw dbError(r.error);
    return {
      balances: ((b.data ?? []) as any[]).map((x) => num(x, BAL_KEYS)) as WalletBalanceV2[],
      entries: withRunning(s.data ?? []),
      legacyPending: ((lp.data ?? []) as any[]).map((x) => ({ ...x, amount: Number(x.amount) })),
    };
  });

/** Finance → Employee Wallets overview. */
export const getWalletsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const [b, s, prof, efp] = await Promise.all([
      sb.rpc("wallet_balances_v2", { _user: null }),
      sb.rpc("wallet_statement_v2", { _user: null }),
      sb.from("profiles").select("user_id,full_name,legal_full_name,employee_code,avatar_url").not("user_id", "is", null),
      sb.from("employee_fund_payments").select("amount,status").eq("status", "committed"),
    ]);
    for (const r of [b, s]) if (r.error) throw dbError(r.error);
    const employees = ((prof.data ?? []) as any[]).map((p) => ({
      user_id: p.user_id as string, name: (p.full_name || p.legal_full_name || p.employee_code || "Unnamed") as string,
      code: p.employee_code ?? null, avatar: p.avatar_url ?? null,
    }));
    const committed = ((efp.data ?? []) as any[]).reduce((a, x) => a + Number(x.amount), 0);
    return {
      balances: ((b.data ?? []) as any[]).map((x) => num(x, BAL_KEYS)) as WalletBalanceV2[],
      entries: withRunning(s.data ?? []),
      employees,
      employeeFundCommitted: committed,
    };
  });

export const postWalletEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid(), type: z.enum(["salary","bonus","incentive","commission","overtime","adjustment_credit","adjustment_debit","correction"]),
    amount: z.number().positive(), currency: z.string().default("BDT"), reason: z.string().min(5).max(500),
    reference: z.string().max(200).optional(), idem: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("wallet_post_manual", {
      _user: data.userId, _type: data.type, _amount: data.amount, _currency: data.currency, _reason: data.reason,
      _project: null, _ref: data.reference ?? null, _idem: data.idem,
    });
    if (error) throw dbError(error);
    return { ok: true };
  });

export const reverseWalletEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().min(5).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("wallet_reverse", { _id: data.id, _reason: data.reason });
    if (error) throw dbError(error);
    return { ok: true };
  });

export const legacyPendingAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    payoutId: z.string().uuid(), action: z.enum(["convert","cancel","link","keep"]), reason: z.string().min(5).max(500),
    efpId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("wallet_legacy_pending_action", {
      _payout: data.payoutId, _action: data.action, _reason: data.reason, _efp: data.efpId ?? null,
    });
    if (error) throw dbError(error);
    return { ok: true };
  });

export const getWalletReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const [r, lp] = await Promise.all([sb.rpc("wallet_reconciliation"), sb.rpc("wallet_legacy_pending", { _user: null })]);
    if (r.error) throw dbError(r.error);
    if (lp.error) throw dbError(lp.error);
    return {
      rows: ((r.data ?? []) as any[]).map((x) => num(x, ["opening","credits","debits","ledger_balance","expected","difference","pending_payments","pending_withdrawals","total_earned","total_withdrawn"])),
      legacyPending: ((lp.data ?? []) as any[]).map((x) => ({ ...x, amount: Number(x.amount) })),
    };
  });
