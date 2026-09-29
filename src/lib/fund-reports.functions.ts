/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 3 — read-only Fund Ledger reporting. Nothing here writes finance data.
// All functions: signed-in + is_finance_admin (Super Admin / Admin / Finance); RLS still applies.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMP_TYPES = ["employee_payment", "salary_payment", "bonus", "incentive", "commission", "overtime", "adjustment"];
const INTERNAL = ["transfer_in", "transfer_out", "loan_in", "loan_out", "loan_repayment", "correction", "reversal"];

export async function finance(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_finance_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Finance access required");
  return ctx.supabase as any;
}

const n = (v: any) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const startIso = (d?: string | null) => (d ? `${d}T00:00:00+06:00` : null);
const endIso = (d?: string | null) => (d ? `${d}T23:59:59.999+06:00` : null);
const monthOf = (iso: string) => new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString().slice(0, 7);

export function txLabel(type: string, direction: string): string {
  const m: Record<string, string> = {
    "allocation/credit": "Invoice Allocation", "reversal/debit": "Allocation / Loan Reversal",
    "transfer_in/credit": "Transfer In", "transfer_out/debit": "Transfer Out",
    "loan_in/credit": "Loan In", "loan_out/debit": "Loan Out",
    "loan_repayment/credit": "Loan Repayment Received", "loan_repayment/debit": "Loan Repayment",
    "expense/debit": "Expense", "expense_restore/debit": "Expense (restored)", "expense_reversal/credit": "Expense Reversal",
    "employee_payment/debit": "Employee Payment", "salary_payment/debit": "Salary Payment", "bonus/debit": "Bonus",
    "incentive/debit": "Incentive", "commission/debit": "Commission", "overtime/debit": "Overtime", "adjustment/debit": "Adjustment",
    "owner_withdrawal/debit": "Owner Withdrawal", "correction/credit": "Correction Credit", "correction/debit": "Correction Debit",
  };
  return m[`${type}/${direction}`] ?? `${type.replace(/_/g, " ")} (${direction})`;
}

export async function nameMaps(sb: any, rows: any[]) {
  const ids = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const people = [...new Set([...ids("employee_id"), ...ids("created_by")])];
  const q = (t: string, cols: string, list: string[]) => (list.length ? sb.from(t).select(cols).in("id", list) : Promise.resolve({ data: [] }));
  const [c, p, i, s, pr, e, a] = await Promise.all([
    q("customers", "id,name,company", ids("customer_id")),
    q("client_projects", "id,title", ids("project_id")),
    q("invoices", "id,slug,title,currency", ids("invoice_id")),
    q("invoice_installments", "id,label,sequence", ids("installment_id")),
    q("profiles", "id,full_name", people),
    q("expenses", "id,category,vendor,voucher_no,request_purpose,notes", ids("expense_id")),
    q("installment_allocations", "id,fund_allocation_versions(name),installment_allocation_items(fund_id,percent)", ids("allocation_id")),
  ]);
  const mk = (d: any) => new Map((d.data ?? []).map((x: any) => [x.id, x]));
  return { c: mk(c), p: mk(p), i: mk(i), s: mk(s), pr: mk(pr), e: mk(e), a: mk(a) };
}

export function shapeRow(r: any, m: Awaited<ReturnType<typeof nameMaps>>) {
  const inv: any = m.i.get(r.invoice_id); const exp: any = m.e.get(r.expense_id); const al: any = m.a.get(r.allocation_id);
  const inst: any = m.s.get(r.installment_id); const cust: any = m.c.get(r.customer_id);
  const pct = al?.installment_allocation_items?.find((x: any) => x.fund_id === r.fund_id)?.percent;
  return {
    id: r.id, created_at: r.created_at, direction: r.direction, transaction_type: r.transaction_type,
    type_label: txLabel(r.transaction_type, r.direction), amount: n(r.amount),
    credit: n(r.credit), debit: n(r.debit), running_balance: r.running_balance == null ? null : n(r.running_balance),
    reference: r.reference ?? exp?.voucher_no ?? null, description: r.description, notes: r.notes,
    client: cust ? cust.company || cust.name : null, customer_id: r.customer_id,
    project: (m.p.get(r.project_id) as any)?.title ?? null, project_id: r.project_id,
    invoice_slug: inv?.slug ?? null, invoice_title: inv?.title ?? null,
    installment: inst ? inst.label || `Installment ${inst.sequence}` : null,
    version: al?.fund_allocation_versions?.name ?? null, percent: pct == null ? null : n(pct),
    employee: (m.pr.get(r.employee_id) as any)?.full_name ?? null,
    category: exp?.category ?? null, vendor: exp?.vendor ?? null, expense_purpose: exp?.request_purpose ?? null,
    created_by: (m.pr.get(r.created_by) as any)?.full_name ?? null,
    reversal_of: r.reversal_of, expense_id: r.expense_id, transfer_id: r.transfer_id, loan_id: r.loan_id,
  };
}

async function searchIds(sb: any, term: string) {
  const like = `%${term.replace(/[%,()]/g, " ")}%`;
  const [c, p, e, i, x] = await Promise.all([
    sb.from("customers").select("id").or(`name.ilike.${like},company.ilike.${like}`).limit(200),
    sb.from("client_projects").select("id").ilike("title", like).limit(200),
    sb.from("profiles").select("id").ilike("full_name", like).limit(200),
    sb.from("invoices").select("id").or(`slug.ilike.${like},title.ilike.${like}`).limit(200),
    sb.from("expenses").select("id").or(`voucher_no.ilike.${like},vendor.ilike.${like},request_purpose.ilike.${like}`).limit(200),
  ]);
  const ors = [`reference.ilike.${like}`, `description.ilike.${like}`, `notes.ilike.${like}`];
  const add = (col: string, d: any) => { const l = (d.data ?? []).map((r: any) => r.id); if (l.length) ors.push(`${col}.in.(${l.join(",")})`); };
  add("customer_id", c); add("project_id", p); add("employee_id", e); add("invoice_id", i); add("expense_id", x);
  return ors.join(",");
}

/* ---------------------------- FUND DETAIL ---------------------------- */
const DetailIn = z.object({
  code: z.string().min(2).max(40),
  from: z.string().nullable().optional(), to: z.string().nullable().optional(),
  direction: z.enum(["all", "credit", "debit"]).default("all"),
  type: z.string().nullable().optional(), projectId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(), employeeId: z.string().uuid().nullable().optional(),
  invoiceId: z.string().uuid().nullable().optional(), category: z.string().nullable().optional(),
  search: z.string().max(80).nullable().optional(),
  page: z.number().int().min(0).default(0), pageSize: z.number().int().min(10).max(500).default(50),
});

function applyFilters(q: any, d: z.infer<typeof DetailIn>, fundId: string, extra: { or?: string; expenseIds?: string[] }) {
  q = q.eq("fund_id", fundId);
  if (d.from) q = q.gte("created_at", startIso(d.from));
  if (d.to) q = q.lte("created_at", endIso(d.to));
  if (d.direction !== "all") q = q.eq("direction", d.direction);
  if (d.type) q = q.eq("transaction_type", d.type);
  if (d.projectId) q = q.eq("project_id", d.projectId);
  if (d.customerId) q = q.eq("customer_id", d.customerId);
  if (d.employeeId) q = q.eq("employee_id", d.employeeId);
  if (d.invoiceId) q = q.eq("invoice_id", d.invoiceId);
  if (extra.expenseIds) q = q.in("expense_id", extra.expenseIds.length ? extra.expenseIds : ["00000000-0000-0000-0000-000000000000"]);
  if (extra.or) q = q.or(extra.or);
  return q;
}

export const getFundDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DetailIn.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const { data: bal } = await sb.from("fund_balances").select("*").eq("code", data.code).maybeSingle();
    if (!bal) throw new Error("Fund not found");
    const fundId = bal.fund_id;
    const { data: ver } = await sb.from("fund_allocation_versions").select("id,name").order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    let percent = 0;
    if (ver) {
      const { data: it } = await sb.from("fund_allocation_version_items").select("percent").eq("version_id", ver.id).eq("fund_id", fundId).maybeSingle();
      percent = n(it?.percent);
    }
    const extra: { or?: string; expenseIds?: string[] } = {};
    if (data.search?.trim()) extra.or = await searchIds(sb, data.search.trim());
    if (data.category) {
      const { data: ex } = await sb.from("expenses").select("id").eq("category", data.category).not("fund_id", "is", null).limit(5000);
      extra.expenseIds = (ex ?? []).map((x: any) => x.id);
    }

    const pageQ = applyFilters(sb.from("fund_ledger_running").select("*", { count: "exact" }), data, fundId, extra)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(data.page * data.pageSize, data.page * data.pageSize + data.pageSize - 1);
    const sumQ = applyFilters(sb.from("fund_ledger").select("amount,direction,transaction_type"), data, fundId, extra).limit(50000);
    // Range (date only) rows for breakdowns
    let rangeQ = sb.from("fund_ledger").select("id,amount,direction,transaction_type,expense_id,employee_id,project_id,created_at").eq("fund_id", fundId);
    if (data.from) rangeQ = rangeQ.gte("created_at", startIso(data.from));
    if (data.to) rangeQ = rangeQ.lte("created_at", endIso(data.to));
    let itemsQ = sb.from("installment_allocation_items").select("amount,percent,installment_allocations!inner(status,project_id,customer_id,received_amount,distributable_amount,created_at)").eq("fund_id", fundId).eq("installment_allocations.status", "active");
    if (data.from) itemsQ = itemsQ.gte("installment_allocations.created_at", startIso(data.from));
    if (data.to) itemsQ = itemsQ.lte("installment_allocations.created_at", endIso(data.to));

    const [page, sums, range, items, opts] = await Promise.all([
      pageQ, sumQ, rangeQ.limit(50000), itemsQ.limit(20000),
      sb.from("fund_ledger").select("transaction_type,direction,project_id,customer_id,employee_id,invoice_id").eq("fund_id", fundId).order("created_at", { ascending: false }).limit(5000),
    ]);
    if (page.error) throw new Error(page.error.message);
    const maps = await nameMaps(sb, page.data ?? []);
    const rows = (page.data ?? []).map((r: any) => shapeRow(r, maps));

    const s = (sums.data ?? []);
    const totals = {
      credits: r2(s.filter((x: any) => x.direction === "credit").reduce((a: number, x: any) => a + n(x.amount), 0)),
      debits: r2(s.filter((x: any) => x.direction === "debit").reduce((a: number, x: any) => a + n(x.amount), 0)),
      count: page.count ?? 0,
    };

    // Source breakdown: which projects funded this fund
    const src = new Map<string, { project_id: string | null; customer_id: string | null; collected: number; distributable: number; allocated: number }>();
    for (const it of items.data ?? []) {
      const a = it.installment_allocations; const k = a.project_id ?? `c:${a.customer_id ?? "none"}`;
      const e = src.get(k) ?? { project_id: a.project_id, customer_id: a.customer_id, collected: 0, distributable: 0, allocated: 0 };
      e.collected += n(a.received_amount); e.distributable += n(a.distributable_amount); e.allocated += n(it.amount); src.set(k, e);
    }
    const srcMaps = await nameMaps(sb, [...src.values()]);
    const sources = [...src.values()].map((e) => ({
      project: (srcMaps.p.get(e.project_id!) as any)?.title ?? "No project linked",
      project_id: e.project_id,
      client: (() => { const c: any = srcMaps.c.get(e.customer_id!); return c ? c.company || c.name : "—"; })(),
      collected: r2(e.collected), allocated: r2(e.allocated), percent: e.distributable ? r2((e.allocated / e.distributable) * 100) : 0,
    })).sort((a, b) => b.allocated - a.allocated);

    // Usage breakdown (net of expense reversals, excludes internal transfers/loans)
    const rr = range.data ?? [];
    const expIds = [...new Set(rr.map((x: any) => x.expense_id).filter(Boolean))];
    const { data: exps } = expIds.length ? await sb.from("expenses").select("id,category,vendor").in("id", expIds) : { data: [] };
    const expMap = new Map((exps ?? []).map((e: any) => [e.id, e]));
    const usage = new Map<string, number>(); const vendors = new Map<string, number>();
    for (const x of rr) {
      const isExpDebit = x.direction === "debit" && (x.transaction_type === "expense" || x.transaction_type === "expense_restore");
      const isExpRev = x.direction === "credit" && x.transaction_type === "expense_reversal";
      let key: string | null = null; let sign = 1;
      if (isExpDebit || isExpRev) { key = `Expense · ${(expMap.get(x.expense_id) as any)?.category ?? "uncategorised"}`; sign = isExpRev ? -1 : 1; }
      else if (x.direction === "debit" && !INTERNAL.includes(x.transaction_type)) key = txLabel(x.transaction_type, "debit");
      if (!key) continue;
      usage.set(key, (usage.get(key) ?? 0) + sign * n(x.amount));
      if (isExpDebit || isExpRev) { const v = (expMap.get(x.expense_id) as any)?.vendor?.trim() || "Unspecified (no vendor recorded)"; vendors.set(v, (vendors.get(v) ?? 0) + sign * n(x.amount)); }
    }
    const toList = (m: Map<string, number>) => [...m.entries()].map(([label, amount]) => ({ label, amount: r2(amount) })).filter((x) => Math.abs(x.amount) > 0.001).sort((a, b) => b.amount - a.amount);

    // Employee special view
    let employees: { rows: { employee_id: string; name: string; committed: number; paid: number; project: number; salary: number; bonus: number; outstanding: number }[]; byProject: { project_id: string; project: string; amount: number }[] } | null = null;
    if (bal.code === "employee") {
      let eq = sb.from("employee_fund_payments").select("employee_id,project_id,payment_type,amount,status,created_at,paid_at").in("status", ["committed", "paid"]);
      if (data.from) eq = eq.gte("created_at", startIso(data.from));
      if (data.to) eq = eq.lte("created_at", endIso(data.to));
      if (data.projectId) eq = eq.eq("project_id", data.projectId);
      if (data.employeeId) eq = eq.eq("employee_id", data.employeeId);
      const { data: pays } = await eq.limit(20000);
      const byEmp = new Map<string, any>(); const byProj = new Map<string, number>();
      for (const p of pays ?? []) {
        const e = byEmp.get(p.employee_id) ?? { employee_id: p.employee_id, committed: 0, paid: 0, project: 0, salary: 0, bonus: 0 };
        const a = n(p.amount);
        if (p.status === "committed") e.committed += a; else e.paid += a;
        if (p.payment_type === "project_payment" || p.payment_type === "project") e.project += a;
        else if (p.payment_type === "salary") e.salary += a;
        else if (["bonus", "incentive"].includes(p.payment_type)) e.bonus += a;
        byEmp.set(p.employee_id, e);
        if (p.project_id) byProj.set(p.project_id, (byProj.get(p.project_id) ?? 0) + a);
      }
      const em = await nameMaps(sb, [...byEmp.values(), ...[...byProj.keys()].map((project_id) => ({ project_id }))]);
      employees = {
        rows: [...byEmp.values()].map((e) => ({ ...e, name: (em.pr.get(e.employee_id) as any)?.full_name ?? "—", outstanding: e.committed })).sort((a, b) => b.paid + b.committed - a.paid - a.committed),
        byProject: [...byProj.entries()].map(([id, amount]) => ({ project_id: id, project: (em.p.get(id) as any)?.title ?? "—", amount: r2(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 15),
      };
    }

    const o = opts.data ?? [];
    const om = await nameMaps(sb, o.slice(0, 2000));
    const uniq = (k: string, map: Map<any, any>, lab: (x: any) => string) => ([...new Set(o.map((x: any) => x[k]).filter(Boolean))] as string[]).map((id) => ({ id, label: map.get(id) ? lab(map.get(id)) : id.slice(0, 8) }));
    return {
      fund: {
        fund_id: fundId, code: bal.code, name: bal.name, kind: bal.kind, is_active: bal.is_active, percent,
        version: ver?.name ?? null,
        ledger_balance: n(bal.ledger_balance), committed: n(bal.committed), available: n(bal.ledger_balance) - n(bal.committed),
        allocated: n(bal.allocation_total), spent: n(bal.spent_total), borrowed: n(bal.borrowed), lent: n(bal.lent), paid_total: n(bal.paid_total),
        total_credits: n(bal.total_credits), total_debits: n(bal.total_debits),
      },
      rows, totals, sources, usage: toList(usage), vendors: toList(vendors), employees,
      options: {
        types: ([...new Set(o.map((x: any) => x.transaction_type))] as string[]).map((t) => ({ id: t, label: t.replace(/_/g, " ") })),
        projects: uniq("project_id", om.p, (x) => x.title), clients: uniq("customer_id", om.c, (x) => x.company || x.name),
        employees: uniq("employee_id", om.pr, (x) => x.full_name), invoices: uniq("invoice_id", om.i, (x) => x.slug),
      },
    };
  });

/* ------------------------ PROJECT PROFITABILITY ------------------------ */
const ProfIn = z.object({
  from: z.string().nullable().optional(), to: z.string().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(), status: z.string().nullable().optional(),
  projectType: z.string().nullable().optional(), service: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(), search: z.string().max(80).nullable().optional(),
});

type Money = { BDT: number; USD: number };
const zero = (): Money => ({ BDT: 0, USD: 0 });

export async function profitData(sb: any, d: z.infer<typeof ProfIn>, onlyProject?: string) {
  let pq = sb.from("client_projects").select("id,title,status,project_type,service,customer_id,client_manager_id,assignee_id,archived_at,customers(name,company)").order("created_at", { ascending: false }).limit(2000);
  if (onlyProject) pq = pq.eq("id", onlyProject);
  if (d.customerId) pq = pq.eq("customer_id", d.customerId);
  if (d.status) pq = pq.eq("status", d.status);
  if (d.projectType) pq = pq.eq("project_type", d.projectType);
  if (d.service) pq = pq.ilike("service", `%${d.service}%`);
  if (d.managerId) pq = pq.or(`client_manager_id.eq.${d.managerId},assignee_id.eq.${d.managerId}`);
  const { data: projects } = await pq;
  let list = (projects ?? []) as any[];
  if (d.search?.trim()) {
    const t = d.search.trim().toLowerCase();
    list = list.filter((p) => [p.title, p.customers?.name, p.customers?.company].some((x) => (x ?? "").toLowerCase().includes(t)));
  }
  const ids = list.map((p) => p.id);
  if (!ids.length) return { list, invs: [], insts: [], allocs: [], items: [], deds: [], pays: [], exps: [], fin: [] };
  const [invR, finR] = await Promise.all([
    sb.from("invoices").select("id,slug,title,currency,total_amount,paid_amount,status,project_id,created_at").in("project_id", ids).neq("status", "void").is("archived_at", null),
    sb.from("client_project_finance").select("project_id,currency,project_value,task_id").in("project_id", ids).is("task_id", null),
  ]);
  const invs = invR.data ?? []; const invIds = invs.map((i: any) => i.id);
  const inRange = (q: any, col: string) => { if (d.from) q = q.gte(col, startIso(d.from)); if (d.to) q = q.lte(col, endIso(d.to)); return q; };
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [instR, allocR, payR, expR] = await Promise.all([
    inRange(sb.from("invoice_installments").select("id,invoice_id,label,sequence,amount,paid_amount,status,paid_at,due_date").in("invoice_id", invIds.length ? invIds : none), "paid_at"),
    inRange(sb.from("installment_allocations").select("id,installment_id,invoice_id,project_id,received_amount,deduction_total,distributable_amount,status,created_at,fund_allocation_versions(name)").eq("status", "active").in("project_id", ids), "created_at"),
    sb.from("employee_fund_payments").select("id,employee_id,project_id,payment_type,amount,status,created_at,paid_at,description").in("project_id", ids).in("status", ["committed", "paid"]),
    (() => { let q = sb.from("expenses").select("id,voucher_no,category,vendor,amount,currency,spent_on,linked_invoice_id,is_project_cost,request_purpose,fund_id").is("deleted_at", null).in("linked_invoice_id", invIds.length ? invIds : none); if (d.from) q = q.gte("spent_on", d.from); if (d.to) q = q.lte("spent_on", d.to); return q; })(),
  ]);
  const allocs = allocR.data ?? []; const aIds = allocs.map((a: any) => a.id);
  const [itR, dedR] = await Promise.all([
    sb.from("installment_allocation_items").select("allocation_id,fund_id,fund_name,percent,amount,finance_funds(code)").in("allocation_id", aIds.length ? aIds : none),
    sb.from("installment_allocation_deductions").select("allocation_id,name,amount_type,value,amount").in("allocation_id", aIds.length ? aIds : none),
  ]);
  // Employee payments: paid in range by paid_at; committed = currently committed (point in time)
  const pays = (payR.data ?? []).filter((p: any) => p.status === "committed" || ((!d.from || p.paid_at >= startIso(d.from)!) && (!d.to || p.paid_at <= endIso(d.to)!)));
  return { list, invs, insts: instR.data ?? [], allocs, items: itR.data ?? [], deds: dedR.data ?? [], pays, exps: expR.data ?? [], fin: finR.data ?? [] };
}

export function summarise(D: Awaited<ReturnType<typeof profitData>>) {
  const invById = new Map(D.invs.map((i: any) => [i.id, i]));
  const allocById = new Map(D.allocs.map((a: any) => [a.id, a]));
  return D.list.map((p: any) => {
    const invs = D.invs.filter((i: any) => i.project_id === p.id);
    const invoiced = zero(), collected = zero(), outstanding = zero(), value = zero(), expenses = zero();
    invs.forEach((i: any) => { const c = i.currency as keyof Money; invoiced[c] += n(i.total_amount); outstanding[c] += Math.max(0, n(i.total_amount) - n(i.paid_amount)); });
    D.insts.filter((s: any) => s.status === "paid" && (invById.get(s.invoice_id) as any)?.project_id === p.id)
      .forEach((s: any) => { const c = (invById.get(s.invoice_id) as any).currency as keyof Money; collected[c] += n(s.paid_amount) || n(s.amount); });
    D.fin.filter((f: any) => f.project_id === p.id).forEach((f: any) => { value[(f.currency ?? "BDT") as keyof Money] += n(f.project_value); });
    D.exps.filter((e: any) => (invById.get(e.linked_invoice_id) as any)?.project_id === p.id).forEach((e: any) => { expenses[e.currency as keyof Money] += n(e.amount); });
    const allocs = D.allocs.filter((a: any) => a.project_id === p.id);
    const deductions = allocs.reduce((a: number, x: any) => a + n(x.deduction_total), 0);
    const distributable = allocs.reduce((a: number, x: any) => a + n(x.distributable_amount), 0);
    const items = D.items.filter((it: any) => (allocById.get(it.allocation_id) as any)?.project_id === p.id);
    const empAlloc = items.filter((it: any) => it.finance_funds?.code === "employee").reduce((a: number, x: any) => a + n(x.amount), 0);
    const otherAlloc = items.filter((it: any) => it.finance_funds?.code !== "employee").reduce((a: number, x: any) => a + n(x.amount), 0);
    const dedBreak = new Map<string, number>();
    D.deds.filter((x: any) => (allocById.get(x.allocation_id) as any)?.project_id === p.id).forEach((x: any) => dedBreak.set(x.name, (dedBreak.get(x.name) ?? 0) + n(x.amount)));
    const pays = D.pays.filter((x: any) => x.project_id === p.id);
    const empPaid = pays.filter((x: any) => x.status === "paid").reduce((a: number, x: any) => a + n(x.amount), 0);
    const empCommitted = pays.filter((x: any) => x.status === "committed").reduce((a: number, x: any) => a + n(x.amount), 0);
    return {
      project_id: p.id, project: p.title, client: p.customers?.company || p.customers?.name || "—", customer_id: p.customer_id,
      project_type: p.project_type, status: p.status, service: p.service, archived: !!p.archived_at,
      project_value: value, invoiced, collected, outstanding,
      direct_deductions: r2(deductions), deduction_breakdown: [...dedBreak.entries()].map(([label, amount]) => ({ label, amount: r2(amount) })),
      distributable: r2(distributable), employee_allocation: r2(empAlloc), other_allocations: r2(otherAlloc),
      employee_paid: r2(empPaid), employee_committed: r2(empCommitted),
      employee_variance: r2(empAlloc - empPaid - empCommitted),
      project_expenses: expenses,
      // Net Project Contribution (BDT, cash basis) = Collected − Direct deductions − Project expenses − Paid employee payments
      net_contribution_bdt: r2(collected.BDT - deductions - expenses.BDT - empPaid),
      invoice_count: invs.length,
    };
  });
}

export const getProjectProfitability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProfIn.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const D = await profitData(sb, data);
    const rows = summarise(D);
    const [{ data: customers }, { data: managers }] = await Promise.all([
      sb.from("customers").select("id,name,company").order("name").limit(1000),
      sb.from("profiles").select("id,full_name").order("full_name").limit(1000),
    ]);
    return {
      rows,
      options: {
        clients: (customers ?? []).map((c: any) => ({ id: c.id, label: c.company || c.name })),
        managers: (managers ?? []).map((m: any) => ({ id: m.id, label: m.full_name ?? "—" })),
        statuses: [...new Set(D.list.map((p: any) => p.status).filter(Boolean))],
        types: [...new Set(D.list.map((p: any) => p.project_type).filter(Boolean))],
      },
    };
  });

export const getProjectProfitDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), from: z.string().nullable().optional(), to: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const D = await profitData(sb, { from: data.from, to: data.to }, data.projectId);
    if (!D.list.length) throw new Error("Project not found");
    const [summary] = summarise(D);
    const invById = new Map(D.invs.map((i: any) => [i.id, i]));
    const m = await nameMaps(sb, D.pays);
    const byFund = new Map<string, { fund: string; amount: number }>();
    D.items.forEach((it: any) => { const e = byFund.get(it.fund_id) ?? { fund: it.fund_name, amount: 0 }; e.amount += n(it.amount); byFund.set(it.fund_id, e); });
    const timeline = [
      ...D.insts.filter((s: any) => s.status === "paid").map((s: any) => ({ at: s.paid_at, kind: "Payment received", label: `${(invById.get(s.invoice_id) as any)?.slug} · ${s.label || `Installment ${s.sequence}`}`, amount: n(s.paid_amount) || n(s.amount), currency: (invById.get(s.invoice_id) as any)?.currency })),
      ...D.allocs.map((a: any) => ({ at: a.created_at, kind: "Fund allocation", label: `Distributable after ৳${n(a.deduction_total)} deductions`, amount: n(a.distributable_amount), currency: "BDT" })),
      ...D.pays.map((p: any) => ({ at: p.paid_at ?? p.created_at, kind: p.status === "paid" ? "Employee paid" : "Employee committed", label: `${(m.pr.get(p.employee_id) as any)?.full_name ?? "—"} · ${p.payment_type}`, amount: -n(p.amount), currency: "BDT" })),
      ...D.exps.map((e: any) => ({ at: `${e.spent_on}T12:00:00+06:00`, kind: "Project expense", label: `${e.voucher_no ?? ""} ${e.vendor ?? e.category}`, amount: -n(e.amount), currency: e.currency })),
    ].filter((x) => x.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return {
      summary,
      invoices: D.invs,
      installments: D.insts.map((s: any) => ({ ...s, invoice_slug: (invById.get(s.invoice_id) as any)?.slug, currency: (invById.get(s.invoice_id) as any)?.currency })),
      deductions: D.deds, allocationsByFund: [...byFund.values()].map((x) => ({ ...x, amount: r2(x.amount) })),
      payments: D.pays.map((p: any) => ({ ...p, employee: (m.pr.get(p.employee_id) as any)?.full_name ?? "—" })),
      expenses: D.exps, timeline,
    };
  });

/* ---------------------------- ANALYTICS ---------------------------- */
export async function computeAnalytics(sb: any, data: { from?: string | null; to?: string | null }) {
    const f = startIso(data.from), t = endIso(data.to);
    let lq = sb.from("fund_ledger").select("fund_id,amount,direction,transaction_type,expense_id,loan_id,created_at").order("created_at").order("id");
    if (t) lq = lq.lte("created_at", t);
    let iq = sb.from("invoice_installments").select("amount,paid_amount,status,paid_at,invoices!inner(currency,status)").eq("status", "paid").neq("invoices.status", "void");
    if (f) iq = iq.gte("paid_at", f); if (t) iq = iq.lte("paid_at", t);
    let aq = sb.from("installment_allocations").select("id,deduction_total,distributable_amount,received_amount").eq("status", "active");
    if (f) aq = aq.gte("created_at", f); if (t) aq = aq.lte("created_at", t);
    let pq = sb.from("employee_fund_payments").select("employee_id,project_id,payment_type,amount,status,paid_at,created_at").in("status", ["committed", "paid"]);
    const [led, bal, insts, allocs, invs, pays] = await Promise.all([
      lq.limit(100000), sb.from("fund_balances").select("*").order("display_order"), iq.limit(50000), aq.limit(50000),
      sb.from("invoices").select("currency,total_amount,paid_amount").neq("status", "void").is("archived_at", null), pq.limit(50000),
    ]);
    const aIds = (allocs.data ?? []).map((a: any) => a.id);
    const { data: items } = aIds.length ? await sb.from("installment_allocation_items").select("fund_id,amount,installment_allocations(created_at)").in("allocation_id", aIds) : { data: [] };
    const funds = (bal.data ?? []) as any[];
    const byId = new Map(funds.map((x) => [x.fund_id, x]));
    const inR = (at: string) => !f || at >= f;
    const L = (led.data ?? []) as any[];
    const expIds = [...new Set(L.filter((x) => x.expense_id && inR(x.created_at)).map((x) => x.expense_id))];
    const { data: exps } = expIds.length ? await sb.from("expenses").select("id,category,vendor").in("id", expIds) : { data: [] };
    const expMap = new Map((exps ?? []).map((e: any) => [e.id, e]));

    const per = new Map<string, any>(funds.map((x) => [x.fund_id, { code: x.code, name: x.name, allocated: 0, spent: 0, opening: 0, months: new Map<string, { allocated: number; spent: number; net: number }>(), usage: new Map<string, number>(), vendors: new Map<string, number>(), withdrawals: 0, transfersOut: 0, exceptional: 0 }]));
    let empPaidRange = 0, opExp = 0;
    for (const x of L) {
      const p = per.get(x.fund_id); if (!p) continue;
      const signed = x.direction === "credit" ? n(x.amount) : -n(x.amount);
      if (!inR(x.created_at)) { p.opening += signed; continue; }
      const mo = monthOf(x.created_at); const mm = p.months.get(mo) ?? { allocated: 0, spent: 0, net: 0 };
      mm.net += signed;
      let alloc = 0, spent = 0;
      // Allocated is NOT derived from ledger rows — see allocation items below (same definition as fund_balances).
      if (x.direction === "debit" && !INTERNAL.includes(x.transaction_type)) spent = n(x.amount);
      if (x.direction === "credit" && x.transaction_type === "expense_reversal") spent = -n(x.amount);
      mm.allocated += alloc; mm.spent += spent; p.months.set(mo, mm); p.allocated += alloc; p.spent += spent;
      if (spent) {
        const isExp = ["expense", "expense_restore", "expense_reversal"].includes(x.transaction_type);
        const key = isExp ? ((expMap.get(x.expense_id) as any)?.category ?? "uncategorised") : txLabel(x.transaction_type, "debit");
        p.usage.set(key, (p.usage.get(key) ?? 0) + spent);
        if (isExp) { opExp += spent; const v = (expMap.get(x.expense_id) as any)?.vendor?.trim() || "Unspecified (no vendor recorded)"; p.vendors.set(v, (p.vendors.get(v) ?? 0) + spent); if (p.code === "profit") p.exceptional += spent; }
        if (EMP_TYPES.includes(x.transaction_type)) empPaidRange += spent;
        if (x.transaction_type === "owner_withdrawal") p.withdrawals += spent;
      }
      if (x.transaction_type === "transfer_out") p.transfersOut += n(x.amount);
    }
    // Allocated = active installment allocation items (single definition shared with fund_balances.allocation_total)
    for (const it of (items ?? []) as any[]) {
      const p = per.get(it.fund_id); if (!p) continue;
      const mo = monthOf(it.installment_allocations.created_at); const mm = p.months.get(mo) ?? { allocated: 0, spent: 0, net: 0 };
      mm.allocated += n(it.amount); p.months.set(mo, mm); p.allocated += n(it.amount);
    }
    const distributable = (allocs.data ?? []).reduce((a: number, x: any) => a + n(x.distributable_amount), 0);
    const distByFund = new Map<string, number>();
    (items ?? []).forEach((i: any) => distByFund.set(i.fund_id, (distByFund.get(i.fund_id) ?? 0) + n(i.amount)));
    const list = (m: Map<string, number>) => [...m.entries()].map(([label, amount]) => ({ label, amount: r2(amount) })).filter((x) => Math.abs(x.amount) > 0.001).sort((a, b) => b.amount - a.amount);
    const fundRows = [...per.entries()].map(([id, p]) => {
      const b = byId.get(id); let run = p.opening;
      const months = [...p.months.entries()].sort(([a], [b2]) => a.localeCompare(b2)).map(([month, m]: any) => { run += m.net; return { month, allocated: r2(m.allocated), spent: r2(m.spent), ending: r2(run) }; });
      return {
        fund_id: id, code: p.code, name: p.name, allocated: r2(p.allocated), spent: r2(p.spent),
        distributed: r2(distByFund.get(id) ?? 0), share: distributable ? r2(((distByFund.get(id) ?? 0) / distributable) * 100) : 0,
        balance: n(b.ledger_balance), committed: n(b.committed), available: n(b.ledger_balance) - n(b.committed),
        months, usage: list(p.usage), vendors: list(p.vendors), withdrawals: r2(p.withdrawals), transfersOut: r2(p.transfersOut), exceptional: r2(p.exceptional),
      };
    });
    const collected = zero(); (insts.data ?? []).forEach((s: any) => { collected[s.invoices.currency as keyof Money] += n(s.paid_amount) || n(s.amount); });
    const outstanding = zero(); (invs.data ?? []).forEach((i: any) => { outstanding[i.currency as keyof Money] += Math.max(0, n(i.total_amount) - n(i.paid_amount)); });
    // Employee cost analytics
    const P = ((pays.data ?? []) as any[]).filter((p) => p.status === "committed" || ((!f || p.paid_at >= f) && (!t || p.paid_at <= t)));
    const grp = (key: (p: any) => string | null) => { const m = new Map<string, { paid: number; committed: number }>(); P.forEach((p) => { const k = key(p) ?? "—"; const e = m.get(k) ?? { paid: 0, committed: 0 }; if (p.status === "paid") e.paid += n(p.amount); else e.committed += n(p.amount); m.set(k, e); }); return m; };
    const byEmp = grp((p) => p.employee_id), byProj = grp((p) => p.project_id), byType = grp((p) => p.payment_type), byMonth = grp((p) => (p.paid_at ? monthOf(p.paid_at) : "committed (unpaid)"));
    const nm = await nameMaps(sb, [...[...byEmp.keys()].map((employee_id) => ({ employee_id })), ...[...byProj.keys()].map((project_id) => ({ project_id }))]);
    const out = (m: Map<string, any>, lab: (k: string) => string) => [...m.entries()].map(([k, v]) => ({ key: k, label: lab(k), paid: r2(v.paid), committed: r2(v.committed) })).sort((a, b) => b.paid + b.committed - a.paid - a.committed);
    const emp = fundRows.find((x) => x.code === "employee");
    const profit = fundRows.find((x) => x.code === "profit");
    return {
      calculatedAt: new Date().toISOString(),
      kpis: {
        collected, outstanding,
        deductions: r2((allocs.data ?? []).reduce((a: number, x: any) => a + n(x.deduction_total), 0)),
        distributable: r2(distributable),
        allocated: r2(fundRows.reduce((a, x) => a + x.allocated, 0)),
        spending: r2(fundRows.reduce((a, x) => a + x.spent, 0)),
        employeePaid: r2(empPaidRange), operatingExpenses: r2(opExp),
        committed: r2(funds.reduce((a, x) => a + n(x.committed), 0)),
        profitRetained: profit?.balance ?? 0,
      },
      funds: fundRows,
      employee: {
        allocated: emp?.allocated ?? 0, paid: r2(P.filter((p) => p.status === "paid").reduce((a, p) => a + n(p.amount), 0)),
        committed: emp?.committed ?? 0, available: emp?.available ?? 0,
        byEmployee: out(byEmp, (k) => (nm.pr.get(k) as any)?.full_name ?? "—"),
        byProject: out(byProj, (k) => (k === "—" ? "No project" : (nm.p.get(k) as any)?.title ?? "—")),
        byType: out(byType, (k) => k.replace(/_/g, " ")), byMonth: out(byMonth, (k) => k),
      },
      profit: profit ? { allocated: profit.allocated, withdrawals: profit.withdrawals, transfersOut: profit.transfersOut, exceptional: profit.exceptional, retained: profit.balance } : null,
    };
}
export const getFundAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: z.string().nullable().optional(), to: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => computeAnalytics(await finance(context), data));

/* --------------------------- RECONCILIATION --------------------------- */
export async function computeReconciliation(sb: any) {
    // Real company cash = same formula as getCompanyWallet (finance.functions.ts):
    //   real_balance(BDT) = Σ paid installment amounts (non-void invoices) + Σ company_ledger − Σ live expenses
    const [insts, cl, exps, bal, allocs, fails, efp, ow, loans] = await Promise.all([
      sb.from("invoice_installments").select("id,invoice_id,label,sequence,amount,paid_amount,paid_at,invoices!inner(slug,title,currency,status,customers(name,company))").eq("status", "paid").neq("invoices.status", "void").limit(50000),
      sb.from("company_ledger").select("id,kind,currency,amount,notes,occurred_on").eq("currency", "BDT").limit(50000),
      sb.from("expenses").select("id,voucher_no,currency,amount,fund_id,spent_on,vendor,category").is("deleted_at", null).eq("currency", "BDT").limit(50000),
      sb.from("fund_balances").select("*").order("display_order"),
      sb.from("installment_allocations").select("installment_id,deduction_total").eq("status", "active").limit(50000),
      sb.from("installment_allocation_failures").select("installment_id,error,attempts,last_attempt_at"),
      sb.from("employee_fund_payments").select("amount,status"),
      sb.from("owner_withdrawals").select("amount"),
      sb.from("fund_loans").select("principal_amount,repaid_amount,status").in("status", ["open", "partially_repaid"]),
    ]);
    const paid = ((insts.data ?? []) as any[]).filter((s) => s.invoices.currency === "BDT");
    const allocated = new Map<string, number>((allocs.data ?? []).map((a: any) => [a.installment_id as string, n(a.deduction_total)]));
    const failed = new Map((fails.data ?? []).map((x: any) => [x.installment_id, x]));
    const amt = (s: any) => n(s.paid_amount) || n(s.amount);
    const shape = (s: any, extra: any = {}) => ({ installment_id: s.id, invoice_slug: s.invoices.slug, invoice_title: s.invoices.title, client: s.invoices.customers?.company || s.invoices.customers?.name, label: s.label || `Installment ${s.sequence}`, paid_at: s.paid_at, amount: amt(s), ...extra });
    const unallocated = paid.filter((s) => !allocated.has(s.id) && failed.has(s.id)).map((s) => shape(s, { error: (failed.get(s.id) as any).error }));
    const legacy = paid.filter((s) => !allocated.has(s.id) && !failed.has(s.id)).map((s) => shape(s));
    const received = paid.reduce((a, s) => a + amt(s), 0);
    const ledgerTotal = (cl.data ?? []).reduce((a: number, x: any) => a + n(x.amount), 0);
    const expAll = (exps.data ?? []) as any[];
    const expTotal = expAll.reduce((a, x) => a + n(x.amount), 0);
    const realCash = received + ledgerTotal - expTotal;
    const nonFundExp = expAll.filter((x) => !x.fund_id);
    const S = (arr: any[], f: (x: any) => number) => arr.reduce((a, x) => a + f(x), 0);
    const legacyCash = S(legacy, (x) => x.amount), unallocCash = S(unallocated, (x) => x.amount);
    const deductions = [...allocated.values()].reduce((a, v) => a + v, 0);
    const nonFundExpTotal = S(nonFundExp, (x) => n(x.amount));
    const empPaid = S((efp.data ?? []).filter((x: any) => x.status === "paid"), (x) => n(x.amount));
    const empCommitted = S((efp.data ?? []).filter((x: any) => x.status === "committed"), (x) => n(x.amount));
    const ownerW = S(ow.data ?? [], (x) => n(x.amount));
    const funds = (bal.data ?? []) as any[];
    const fundTotal = S(funds.filter((x) => x.is_active), (x) => n(x.ledger_balance));
    const outstandingLoans = S(loans.data ?? [], (x) => n(x.principal_amount) - n(x.repaid_amount));
    // Expected Fund-Ledger cash — every term is an explicit, visible compatibility item:
    //   Real cash − Legacy cash − Unallocated eligible cash − Direct deductions (kept outside funds)
    //   + Expenses NOT paid from a fund (they reduced real cash but never touched funds)
    //   − Company ledger adjustments (wallet-only entries; funds never see them)
    //   − Employee fund payments paid + owner withdrawals (reduce funds; the Wallet formula does not track them)
    const expected = realCash - legacyCash - unallocCash - deductions + nonFundExpTotal - ledgerTotal - empPaid - ownerW;
    const difference = r2(fundTotal - expected);
    const status = Math.abs(difference) < 0.01 ? (unallocated.length ? "Unallocated Cash" : "Matched") : legacy.length && Math.abs(Math.abs(difference) - legacyCash) < 0.01 ? "Legacy Difference" : "Needs Review";
    return {
      calculatedAt: new Date().toISOString(), currency: "BDT" as const, status,
      components: {
        realCash: r2(realCash), received: r2(received), companyLedger: r2(ledgerTotal), expensesTotal: r2(expTotal),
        fundTotal: r2(fundTotal), committed: r2(empCommitted), loansReceivable: r2(outstandingLoans), loansLiability: r2(outstandingLoans),
        unallocated: r2(unallocCash), legacy: r2(legacyCash), deductions: r2(deductions), nonFundExpenses: r2(nonFundExpTotal),
        employeePaid: r2(empPaid), ownerWithdrawals: r2(ownerW), expected: r2(expected), difference,
      },
      funds: funds.map((x) => ({ code: x.code, name: x.name, balance: n(x.ledger_balance), committed: n(x.committed), active: x.is_active })),
      unallocatedRows: unallocated, legacyRows: legacy.slice(0, 500), legacyCount: legacy.length,
      nonFundExpenses: nonFundExp.slice(0, 500).map((x) => ({ id: x.id, voucher_no: x.voucher_no, amount: n(x.amount), spent_on: x.spent_on, vendor: x.vendor, category: x.category })),
      companyLedgerRows: (cl.data ?? []).slice(0, 500),
    };
}
export const getReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => computeReconciliation(await finance(context)));

/* ------------------------------ EXPORT ------------------------------ */
export const exportFundTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    title: z.string().max(120), format: z.enum(["csv", "xlsx"]),
    columns: z.array(z.object({ header: z.string(), type: z.enum(["text", "number", "date"]).optional() })).max(40),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(20000),
    preamble: z.array(z.string()).max(10).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await finance(context);
    const { buildXlsx, buildCsv } = await import("./xlsx.server");
    const base = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (data.format === "csv") {
      const csv: any = buildCsv(data.columns.map((c) => c.header), data.rows, data.preamble ?? []);
      const b64 = typeof csv === "string" ? Buffer.from(csv, "utf8").toString("base64") : Buffer.from(csv).toString("base64");
      return { filename: `${base}.csv`, mime: "text/csv", base64: b64 };
    }
    const bytes = buildXlsx([{ name: data.title.slice(0, 30), columns: data.columns, rows: data.rows, preamble: data.preamble }]);
    return { filename: `${base}.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: Buffer.from(bytes).toString("base64") };
  });
