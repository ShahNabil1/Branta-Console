// Expense audit trail + Recycle Bin server functions.
// Every meaningful action on an expense (create, edit, delete, restore, view,
// download, receipt access, sealed copy, share link) is written to
// public.expense_activity_logs so Finance has an A-to-Z history per voucher.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { expenseReadActionSchema } from "./expense-log-action";

export type ExpenseLogAction =
  | "created"
  | "updated"
  | "deleted"
  | "restored"
  | "purged"
  | "voucher_viewed"
  | "voucher_downloaded"
  | "receipt_viewed"
  | "receipt_downloaded"
  | "sealed_uploaded"
  | "sealed_removed"
  | "share_enabled"
  | "share_disabled";

export interface ExpenseChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface ExpenseLogRow {
  id: string;
  expense_id: string | null;
  voucher_no: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  title: string;
  reason: string | null;
  changes: ExpenseChange[];
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

export const ACTION_LABEL: Record<string, string> = {
  created: "Expense added",
  updated: "Expense edited",
  deleted: "Moved to Recycle Bin",
  restored: "Recovered from Recycle Bin",
  purged: "Permanently deleted (30-day auto purge)",
  voucher_viewed: "Voucher viewed",
  voucher_downloaded: "Voucher downloaded",
  voucher_printed: "Printed on letterhead",
  receipt_viewed: "Receipt viewed",
  receipt_downloaded: "Receipt downloaded",
  sealed_uploaded: "Sealed copy uploaded",
  sealed_removed: "Sealed copy removed",
  share_enabled: "Public share link turned on",
  share_disabled: "Public share link turned off",
};

/** Shared writer — used by finance.functions.ts and the client-side loggers. */
export async function writeExpenseLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: {
    expenseId: string | null;
    voucherNo?: string | null;
    actorId: string;
    action: ExpenseLogAction;
    reason?: string | null;
    changes?: ExpenseChange[];
    metadata?: Record<string, unknown>;
    title?: string;
  },
) {
  try {
    await supabase.from("expense_activity_logs").insert({
      expense_id: input.expenseId,
      voucher_no: input.voucherNo ?? null,
      actor_id: input.actorId,
      action: input.action,
      title: input.title ?? ACTION_LABEL[input.action] ?? input.action,
      reason: input.reason ?? null,
      changes: input.changes ?? [],
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    console.error("[writeExpenseLog] failed:", e);
  }
}

async function ensureFinance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data, error } = await supabase.rpc("is_finance_admin", { _user_id: userId });
  if (error) throw dbError(error);
  if (data) return;
  // Company CEOs pass; RLS limits them to their own company's expense logs.
  const { data: ceo } = await supabase.rpc("is_any_company_manager", { _user: userId });
  if (!ceo) throw new Error("Forbidden — finance role required");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachActorNames(supabase: any, rows: ExpenseLogRow[]) {
  const ids = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
  if (!ids.length) return rows;
  const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
  const nm = new Map<string, string>();
  ((data ?? []) as { user_id: string; full_name: string | null }[]).forEach((p) =>
    nm.set(p.user_id, p.full_name ?? ""),
  );
  rows.forEach((r) => {
    r.actor_name = r.actor_id ? nm.get(r.actor_id) ?? null : null;
  });
  return rows;
}

/** Full history for one expense, newest first. */
export const listExpenseLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { expenseId: string }) =>
    z.object({ expenseId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ExpenseLogRow[]> => {
    await ensureFinance(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("expense_activity_logs")
      .select("*")
      .eq("expense_id", data.expenseId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
    return attachActorNames(context.supabase, (rows ?? []) as unknown as ExpenseLogRow[]);
  });

/** Records a read-type action (view / download) triggered in the UI. */
export const logExpenseAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { expenseId: string; action: ExpenseLogAction; detail?: string | null }) =>
    z
      .object({
        expenseId: z.string().uuid(),
        action: expenseReadActionSchema,
        detail: z.string().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinance(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("expenses")
      .select("voucher_no")
      .eq("id", data.expenseId)
      .maybeSingle();
    await writeExpenseLog(context.supabase, {
      expenseId: data.expenseId,
      voucherNo: (row as { voucher_no: string | null } | null)?.voucher_no ?? null,
      actorId: context.userId,
      action: data.action,
      metadata: data.detail ? { detail: data.detail } : {},
    });
    return { ok: true as const };
  });

export interface DeletedExpenseRow {
  id: string;
  voucher_no: string | null;
  category: string;
  amount: number;
  currency: string;
  spent_on: string;
  vendor: string | null;
  department: string | null;
  request_purpose: string | null;
  notes: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
  delete_reason: string | null;
  purge_after: string | null;
  linked_invoice_id: string | null;
}

/** Recycle Bin listing. Sweeps anything past its 30-day window first. */
export const listDeletedExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data: input, context }): Promise<DeletedExpenseRow[]> => {
    await ensureFinance(context.supabase, context.userId);
    try {
      await (context.supabase.rpc as unknown as (n: string) => Promise<unknown>)("purge_expired_expenses");
    } catch (e) {
      console.error("[listDeletedExpenses] purge failed:", e);
    }
    // Orphan receipt sweep: new expense-form uploads under exp/ older than 24h and linked to no expense.
    try {
      const { data: orphans } = await (context.supabase as any).rpc("orphan_expense_receipts", { _older_hours: 24 });
      const names = ((orphans ?? []) as unknown[]).map((o) => (typeof o === "string" ? o : Object.values(o as object)[0])) as string[];
      if (names.length) await context.supabase.storage.from("expense-receipts").remove(names);
    } catch (e) {
      console.error("[listDeletedExpenses] orphan sweep failed:", e);
    }
    const co = await (await import("@/lib/lead-company.server")).resolveLeadCompany(context.supabase, context.userId, input.workspace);
    const { data, error } = await context.supabase
      .from("expenses")
      .select(
        "id, voucher_no, category, amount, currency, spent_on, vendor, department, request_purpose, notes, deleted_at, deleted_by, delete_reason, purge_after, linked_invoice_id",
      )
      .eq("company_id" as never, co.id as never)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
    const rows = (data ?? []) as unknown as DeletedExpenseRow[];
    const ids = Array.from(new Set(rows.map((r) => r.deleted_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const nm = new Map<string, string>();
      ((profs ?? []) as { user_id: string; full_name: string | null }[]).forEach((p) =>
        nm.set(p.user_id, p.full_name ?? ""),
      );
      rows.forEach((r) => {
        r.deleted_by_name = r.deleted_by ? nm.get(r.deleted_by) ?? null : null;
      });
    }
    return rows;
  });

/** Puts a recycled expense straight back into the live Expenses list. */
export const restoreExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string | null }) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(1000).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinance(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("expenses")
      .update({
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
        purge_after: null,
      } as never)
      .eq("id", data.id)
      .select("id, voucher_no, linked_invoice_id, is_project_cost")
      .single();
    if (error) throw dbError(error);
    const exp = row as unknown as {
      id: string;
      voucher_no: string | null;
      linked_invoice_id: string | null;
      is_project_cost: boolean;
    };
    if (exp.is_project_cost && exp.linked_invoice_id) {
      const { syncInvoiceExpenseCostsFor } = await import("@/lib/finance.functions");
      await syncInvoiceExpenseCostsFor(context.supabase, exp.linked_invoice_id);
    }
    await writeExpenseLog(context.supabase, {
      expenseId: exp.id,
      voucherNo: exp.voucher_no,
      actorId: context.userId,
      action: "restored",
      reason: data.reason ?? null,
    });
    return { ok: true as const };
  });
