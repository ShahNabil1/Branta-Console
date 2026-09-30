import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";

export type WalletTxn = {
  txn_id: string; user_id: string; occurred_at: string; description: string; client: string | null; project: string | null;
  project_id: string | null; invoice_slug: string | null; installment: string | null; task: string | null; txn_type: string;
  source: string; credit: number; debit: number; pending: number; status: string; reference: string | null; currency: string;
  balance: number;
};

type Raw = Omit<WalletTxn, "balance">;

/** Adds a running balance per user+currency (credits − withdrawal debits), in chronological order. */
function withBalance(rows: Raw[]): WalletTxn[] {
  const run = new Map<string, number>();
  return rows.map((r) => {
    const k = `${r.user_id}:${r.currency}`;
    const b = (run.get(k) ?? 0) + Number(r.credit) - Number(r.debit);
    run.set(k, b);
    return { ...r, credit: Number(r.credit), debit: Number(r.debit), pending: Number(r.pending), balance: b };
  });
}

/** One bank-style statement built from existing wallet records (payouts, committed Employee Fund payments, withdrawals). Own only, or anyone for Finance/Admin (enforced in DB). */
export const getWalletStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<WalletTxn[]> => {
    const { data: rows, error } = await (context.supabase as any).rpc("wallet_transactions", { _user: data.userId ?? context.userId });
    if (error) throw dbError(error);
    return withBalance((rows ?? []) as Raw[]);
  });

export type ProjectEmployeeCost = { project_id: string | null; project: string | null; client: string | null; allocated: number; assigned: number; committed: number; paid: number; withdrawn: number };
export type EmployeeLite = { user_id: string; name: string; code: string | null; avatar: string | null };

/** Finance → Employee Earnings: every employee's transactions + project-wise Employee Fund usage. */
export const getEmployeeEarningsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const [tx, proj, prof] = await Promise.all([
      sb.rpc("wallet_transactions", { _user: null }),
      sb.rpc("employee_fund_project_summary"),
      sb.from("profiles").select("user_id,full_name,legal_full_name,employee_code,avatar_url").not("user_id", "is", null),
    ]);
    if (tx.error) throw dbError(tx.error);
    if (proj.error) throw dbError(proj.error);
    const employees: EmployeeLite[] = ((prof.data ?? []) as any[]).map((p) => ({
      user_id: p.user_id, name: p.full_name || p.legal_full_name || p.employee_code || "Unnamed", code: p.employee_code ?? null, avatar: p.avatar_url ?? null,
    }));
    const projects: ProjectEmployeeCost[] = ((proj.data ?? []) as any[]).map((r) => ({
      ...r, allocated: Number(r.allocated), assigned: Number(r.assigned), committed: Number(r.committed), paid: Number(r.paid), withdrawn: Number(r.withdrawn),
    }));
    return { transactions: withBalance((tx.data ?? []) as Raw[]), projects, employees };
  });
