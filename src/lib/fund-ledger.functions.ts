import { dbError } from "@/lib/db-errors";
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
      sb.from("invoices").select("total_amount,paid_amount,status").neq("status", "void").is("archived_at", null),
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
    if (error) throw dbError(error);
    return { ok: true };
  });

export const reverseAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ allocationId: z.string().uuid(), reason: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { error } = await (context.supabase as any).rpc("reverse_installment_allocation", { _allocation_id: data.allocationId, _reason: data.reason });
    if (error) throw dbError(error);
    return { ok: true };
  });

export const getInvoiceAllocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const, expectedPool: 0, rows: [] };
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

/* ---------- Branta Tech (holding) fund allocation, managed from Company Settings ---------- */

export const getHoldingFundConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const, funds: [], versions: [] };
    const [funds, versions] = await Promise.all([
      sb.from("finance_funds").select("id,name,is_active,display_order").order("display_order"),
      sb.from("fund_allocation_versions").select("id,name,effective_from,notes,created_at,fund_allocation_version_items(fund_id,percent)")
        .order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(20),
    ]);
    if (funds.error) throw dbError(funds.error);
    if (versions.error) throw dbError(versions.error);
    return { allowed: true as const, funds: funds.data ?? [], versions: versions.data ?? [] };
  });

export const saveHoldingFundConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    note: z.string().max(300).optional(),
    buckets: z.array(z.object({ fund_id: z.string().uuid().nullish(), label: z.string().trim().min(2).max(60), percent: z.number().min(0).max(100) })).min(1).max(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const sb = context.supabase as any;
    const total = Math.round(data.buckets.reduce((a, b) => a + b.percent, 0) * 1000) / 1000;
    if (total !== 100) throw new Error(`Percentages must total exactly 100% (now ${total}%)`);
    const names = data.buckets.map((b) => b.label.toLowerCase());
    if (new Set(names).size !== names.length) throw new Error("Fund names must be unique");
    const { data: existing, error: fe } = await sb.from("finance_funds").select("id,code,name,is_active,display_order");
    if (fe) throw dbError(fe);
    const byId = new Map<string, any>((existing ?? []).map((f: any) => [f.id, f]));
    const codes = new Set<string>((existing ?? []).map((f: any) => f.code));
    const items: { fund_id: string; percent: number }[] = [];
    for (const [i, b] of data.buckets.entries()) {
      const cur = b.fund_id ? byId.get(b.fund_id) : null;
      if (cur) {
        if (cur.name !== b.label || !cur.is_active || cur.display_order !== i + 1) {
          const { error } = await sb.from("finance_funds").update({ name: b.label, is_active: true, display_order: i + 1 }).eq("id", cur.id);
          if (error) throw dbError(error);
        }
        items.push({ fund_id: cur.id, percent: b.percent });
      } else {
        const base = b.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 26) || "fund";
        let code = base, n = 2; while (codes.has(code)) code = `${base}_${n++}`; codes.add(code);
        const { data: ins, error } = await sb.from("finance_funds").insert({ name: b.label, code, kind: "operating", is_active: true, display_order: i + 1 }).select("id").single();
        if (error) throw dbError(error);
        items.push({ fund_id: ins.id, percent: b.percent });
      }
    }
    const keep = new Set(items.map((x) => x.fund_id));
    const drop = (existing ?? []).filter((f: any) => f.is_active && !keep.has(f.id)).map((f: any) => f.id);
    if (drop.length) {
      const { error } = await sb.from("finance_funds").update({ is_active: false }).in("id", drop);
      if (error) throw dbError(error);
    }
    const { count } = await sb.from("fund_allocation_versions").select("id", { count: "exact", head: true });
    const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
    const { data: v, error } = await sb.from("fund_allocation_versions")
      .insert({ name: `v${(count ?? 0) + 1}`, effective_from: today, notes: data.note?.trim() || "Updated from Company Settings", created_by: context.userId }).select("id").single();
    if (error) throw dbError(error);
    const { error: e2 } = await sb.from("fund_allocation_version_items").insert(items.map((i) => ({ ...i, version_id: v.id })));
    if (e2) throw dbError(e2);
    await sb.from("fund_audit_logs").insert({ user_id: context.userId, action: "allocation_version_create", record_type: "fund_allocation_version", record_id: v.id, next: data, reason: data.note ?? null });
    return { ok: true };
  });

/* ---------- Fund Ledger base correction (project cost before fund split) ---------- */

/** Active allocations whose distributable ignored the invoice project cost. Read-only preview. */
export const getAllocationBaseReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const, expectedPool: 0, rows: [] };
    const { data: allocs } = await sb.from("installment_allocations")
      .select("id,installment_id,received_amount,deduction_total,distributable_amount,status,source,invoices(slug,title,total_amount,project_cost_total),invoice_installments(label,sequence),installment_allocation_deductions(amount_type,amount)")
      .eq("status", "active").limit(5000);
    const rows = (allocs ?? []).flatMap((a: any) => {
      const total = Number(a.invoices?.total_amount ?? 0), cost = Number(a.invoices?.project_cost_total ?? 0);
      const recv = Number(a.received_amount);
      const hasCost = (a.installment_allocation_deductions ?? []).some((d: any) => d.amount_type === "project_cost");
      if (hasCost || cost <= 0 || total <= 0) return [];
      const share = Math.round(recv * Math.min(cost, total) / total * 100) / 100;
      const correct = Math.max(Number(a.distributable_amount) - share, 0);
      return [{
        allocation_id: a.id, invoice: a.invoices?.slug, title: a.invoices?.title,
        installment: a.invoice_installments?.label ?? `Installment ${a.invoice_installments?.sequence ?? ""}`,
        received: recv, project_cost: share, current: Number(a.distributable_amount), correct,
        difference: Math.round((Number(a.distributable_amount) - correct) * 100) / 100, status: a.status, source: a.source,
      }];
    });
    return { allowed: true as const, rows };
  });

export const correctAllocationBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ allocationId: z.string().uuid(), reason: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { data: id, error } = await (context.supabase as any).rpc("correct_allocation_base", { _allocation_id: data.allocationId, _reason: data.reason });
    if (error) throw dbError(error);
    return { ok: true, allocationId: id as string };
  });

/** Employee Fund pool for one allocation + employees for assignment. */
export const getAllocationEmployeePool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ allocationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertFinance(context);
    const [{ data: items }, { data: pays }, { data: emps }] = await Promise.all([
      sb.from("installment_allocation_items").select("amount,finance_funds!inner(code)").eq("allocation_id", data.allocationId).eq("finance_funds.code", "employee"),
      sb.from("employee_fund_payments").select("id,employee_id,amount,status,description").eq("allocation_id", data.allocationId).neq("status", "cancelled"),
      sb.from("profiles").select("id,full_name,legal_full_name,employee_code").is("deactivated_at", null).order("full_name").limit(1000),
    ]);
    const pool = (items ?? []).reduce((a: number, x: any) => a + Number(x.amount), 0);
    const assigned = (pays ?? []).reduce((a: number, x: any) => a + Number(x.amount), 0);
    const names = new Map((emps ?? []).map((e: any) => [e.id, e.full_name || e.legal_full_name || e.employee_code || "Unnamed"]));
    return {
      pool, assigned, remaining: Math.round((pool - assigned) * 100) / 100,
      payments: (pays ?? []).map((p: any) => ({ ...p, amount: Number(p.amount), name: names.get(p.employee_id) ?? "—" })),
      employees: (emps ?? []).map((e: any) => ({ id: e.id as string, name: (e.full_name || e.legal_full_name || e.employee_code || "Unnamed") as string })),
    };
  });

export const assignAllocationEmployeePayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    allocationId: z.string().uuid(), mode: z.enum(["fixed", "percent"]), note: z.string().max(500).optional(),
    rows: z.array(z.object({ employee_id: z.string().uuid(), value: z.number().positive() })).min(1).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { error } = await (context.supabase as any).rpc("assign_allocation_employee_payouts", { _allocation_id: data.allocationId, _mode: data.mode, _rows: data.rows, _note: data.note ?? null });
    if (error) throw dbError(error);
    return { ok: true };
  });

/** Live Fund Ledger preview context for the invoice form: active version split, team members, project tasks. */
export const getInvoiceFundPreviewContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const, funds: [], employees: [], tasks: [] };
    const [{ data: ver }, { data: emps }, tasksRes, { data: bals }] = await Promise.all([
      sb.from("fund_allocation_versions").select("id,name,fund_allocation_version_items(percent,finance_funds(code,name,display_order))").order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("profiles").select("id,user_id,full_name,legal_full_name,avatar_url,employee_code,job_role").is("deactivated_at", null).order("full_name").limit(1000),
      data.projectId ? sb.from("client_tasks").select("id,title").eq("project_id", data.projectId).is("archived_at", null).order("created_at") : Promise.resolve({ data: [] }),
      sb.rpc("wallet_balances_v2", { _user: null }),
    ]);
    const wallet = new Map<string, number>();
    ((bals ?? []) as any[]).forEach((b) => { if (b.currency === "BDT") wallet.set(b.employee_id, Number(b.available ?? 0)); });
    const funds = ((ver?.fund_allocation_version_items ?? []) as any[])
      .map((i) => ({ code: i.finance_funds?.code as string, name: i.finance_funds?.name as string, order: Number(i.finance_funds?.display_order ?? 0), percent: Number(i.percent) }))
      .sort((a, b) => a.order - b.order);
    return {
      allowed: true as const, versionName: (ver?.name ?? null) as string | null, funds,
      employees: ((emps ?? []) as any[]).map((e) => ({
        id: e.id as string, name: (e.full_name || e.legal_full_name || e.employee_code || "Unnamed") as string, avatar: (e.avatar_url ?? null) as string | null,
        code: (e.employee_code ?? null) as string | null, role: (e.job_role ?? null) as string | null,
        walletAvailable: wallet.get(e.user_id) ?? 0,
      })),
      tasks: ((tasksRes.data ?? []) as any[]).map((t) => ({ id: t.id as string, title: t.title as string })),
    };
  });

/** Planned Employee Fund distribution saved on the invoice (Finance only). */
export const getInvoiceEmployeePlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const, expectedPool: 0, rows: [] };
    const [{ data: rows }, { data: inv }, { data: ver }] = await Promise.all([
      sb.from("invoice_employee_plans").select("*").eq("invoice_id", data.invoiceId).order("sequence"),
      sb.from("invoices").select("total_amount,project_cost_total").eq("id", data.invoiceId).maybeSingle(),
      sb.from("fund_allocation_versions").select("fund_allocation_version_items(percent,finance_funds(code))").order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const empPct = Number(((ver?.fund_allocation_version_items ?? []) as any[]).find((i) => i.finance_funds?.code === "employee")?.percent ?? 0);
    const expectedPool = Math.round(Math.max(Number(inv?.total_amount ?? 0) - Number(inv?.project_cost_total ?? 0), 0) * empPct) / 100;
    return { allowed: true as const, expectedPool, rows: ((rows ?? []) as any[]).map((r) => ({ ...r, value: Number(r.value), planned_amount: Number(r.planned_amount) })) };
  });

/** Active fund allocations whose installment is no longer Paid — Finance must review and reverse. */
export const listAllocationMismatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const sb = context.supabase as any;
    const { data: allocs, error } = await sb.from("installment_allocations")
      .select("id, status, received_amount, distributable_amount, installment_id, invoice_id, created_at")
      .eq("status", "active").limit(1000);
    if (error) throw dbError(error);
    const rows = (allocs ?? []) as { id: string; status: string; received_amount: number; distributable_amount: number; installment_id: string; invoice_id: string; created_at: string }[];
    if (!rows.length) return [];
    const [{ data: insts }, { data: invs }] = await Promise.all([
      sb.from("invoice_installments").select("id, sequence, label, status, amount").in("id", rows.map((r) => r.installment_id)),
      sb.from("invoices").select("id, slug, title").in("id", Array.from(new Set(rows.map((r) => r.invoice_id)))),
    ]);
    const im = new Map((insts ?? []).map((i: any) => [i.id, i]));
    const vm = new Map((invs ?? []).map((i: any) => [i.id, i]));
    return rows
      .filter((r) => (im.get(r.installment_id) as any)?.status !== "paid")
      .map((r) => {
        const i = im.get(r.installment_id) as any; const v = vm.get(r.invoice_id) as any;
        return {
          allocationId: r.id, invoiceSlug: v?.slug ?? "—", invoiceTitle: v?.title ?? "",
          installment: i?.label || `Installment ${i?.sequence ?? "?"}`, installmentStatus: i?.status ?? "missing",
          allocationStatus: r.status, amount: Number(r.received_amount), fundImpact: Number(r.distributable_amount),
        };
      });
  });

/** Per-employee planned vs earned (paid installments) vs pending, with wallet status. Finance only. */
export const getInvoiceEmployeeEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: allowed } = await sb.rpc("is_finance_admin", { _user_id: context.userId });
    if (!allowed) return { allowed: false as const, rows: [] };
    const [{ data: plans }, { data: pays }] = await Promise.all([
      sb.from("invoice_employee_plans").select("id,employee_id,planned_amount").eq("invoice_id", data.invoiceId).order("sequence"),
      sb.from("employee_fund_payments").select("id,employee_id,amount,status,plan_id,invoice_payout_id").eq("invoice_id", data.invoiceId).neq("status", "cancelled"),
    ]);
    const empIds = Array.from(new Set([...(plans ?? []), ...(pays ?? [])].map((r: any) => r.employee_id)));
    const payoutIds = (pays ?? []).map((p: any) => p.invoice_payout_id).filter(Boolean);
    const [{ data: profs }, { data: pos }] = await Promise.all([
      empIds.length ? sb.from("profiles").select("id,full_name,legal_full_name,avatar_url,employee_code").in("id", empIds) : Promise.resolve({ data: [] }),
      payoutIds.length ? sb.from("invoice_payouts").select("id,status").in("id", payoutIds) : Promise.resolve({ data: [] }),
    ]);
    const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const posm = new Map((pos ?? []).map((p: any) => [p.id, p.status]));
    const rows = empIds.map((id) => {
      const planned = (plans ?? []).filter((p: any) => p.employee_id === id).reduce((a: number, p: any) => a + Number(p.planned_amount), 0);
      const mine = (pays ?? []).filter((p: any) => p.employee_id === id);
      const earned = mine.reduce((a: number, p: any) => a + Number(p.amount), 0);
      const inWallet = mine.filter((p: any) => p.status === "paid").reduce((a: number, p: any) => a + Number(p.amount), 0);
      const statuses = mine.map((p: any) => (p.status === "paid" ? `wallet:${posm.get(p.invoice_payout_id) ?? "available"}` : p.status));
      const walletStatus = !mine.length ? "Waiting for client payment"
        : statuses.every((s: string) => s.startsWith("wallet:")) ? (statuses.some((s: string) => s === "wallet:paid") ? "Withdrawn" : statuses.some((s: string) => s === "wallet:requested") ? "Requested" : "Available")
        : statuses.some((s: string) => s.startsWith("wallet:")) ? "Partly in wallet" : statuses.includes("committed") || statuses.includes("approved") ? "Committed (not yet available)" : "Draft (not in wallet)";
      const p: any = pm.get(id);
      return {
        employeeId: id, name: (p?.full_name || p?.legal_full_name || "—") as string, avatar: (p?.avatar_url ?? null) as string | null, code: (p?.employee_code ?? null) as string | null,
        planned: Math.round(planned * 100) / 100, earned: Math.round(earned * 100) / 100, inWallet: Math.round(inWallet * 100) / 100,
        pending: Math.max(Math.round((planned - earned) * 100) / 100, 0), walletStatus,
      };
    });
    return { allowed: true as const, rows };
  });
