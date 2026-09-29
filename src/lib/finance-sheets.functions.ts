/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 4 — one-way Finance reporting to Google Sheets (Console → Sheets only).
// Completely separate from the Leads Sheets sync. Never writes anything back into finance tables.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeAnalytics, computeReconciliation, finance, nameMaps, profitData, summarise, txLabel } from "./fund-reports.functions";
import { classifyInstallments, progress } from "./historical-allocation.functions";

const n = (v: any) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const dhaka = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString() : "");
const day = (iso?: string | null) => dhaka(iso).slice(0, 10);
const time = (iso?: string | null) => dhaka(iso).slice(11, 19);

type Cell = string | number | null;
type Tab = { title: string; headers: string[]; money: number[]; rows: Cell[][] };

export const TAB_NAMES = ["Finance Summary", "Fund Balances", "Fund Ledger", "Invoice Allocations", "Employee Payments", "Expenses", "Fund Transfers", "Fund Loans", "Project Profitability", "Monthly Report", "Reconciliation", "Historical Allocation Status"];

async function gw<T = any>(path: string, method = "GET", body?: unknown, query?: Record<string, any>): Promise<T> {
  const { callGateway } = await import("./connector-gateway.server");
  return callGateway<T>({ connector: "google_sheets", path: `/v4/spreadsheets/${path}`, method, body, query });
}

async function fetchAll(make: (a: number, b: number) => any, cap = 100000) {
  const out: any[] = [];
  for (let i = 0; i < cap; i += 1000) {
    const { data, error } = await make(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const col = (i: number) => { let s = ""; let x = i; while (x >= 0) { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } return s; };
const q = (t: string) => `'${t.replace(/'/g, "''")}'`;

/** Upsert rows by the stable key in column A. Existing rows update in place, new rows append; nothing is deleted. */
async function upsertTab(sheetId: string, tab: Tab, sheets: Map<string, number>) {
  const last = col(tab.headers.length - 1);
  if (!sheets.has(tab.title)) {
    const res = await gw<any>(`${sheetId}:batchUpdate`, "POST", { requests: [{ addSheet: { properties: { title: tab.title, gridProperties: { frozenRowCount: 1 } } } }] });
    const sid = res.replies?.[0]?.addSheet?.properties?.sheetId;
    sheets.set(tab.title, sid);
    await gw(`${sheetId}:batchUpdate`, "POST", { requests: [
      { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
      ...tab.money.map((c) => ({ repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0.00;(#,##0.00);-" } } }, fields: "userEnteredFormat.numberFormat" } })),
      { setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: tab.headers.length } } } },
    ] });
  }
  await gw(`${sheetId}/values/${q(tab.title)}!A1:${last}1`, "PUT", { values: [tab.headers] }, { valueInputOption: "RAW" });
  const existing = await gw<{ values?: string[][] }>(`${sheetId}/values/${q(tab.title)}!A2:A`);
  const idx = new Map<string, number>();
  (existing.values ?? []).forEach((r, i) => { if (r[0]) idx.set(String(r[0]), i + 2); });
  const updates: { range: string; values: Cell[][] }[] = []; const appends: Cell[][] = [];
  for (const row of tab.rows) {
    const at = idx.get(String(row[0]));
    if (at) updates.push({ range: `${q(tab.title)}!A${at}:${last}${at}`, values: [row] }); else appends.push(row);
  }
  for (let i = 0; i < updates.length; i += 400) {
    await gw(`${sheetId}/values:batchUpdate`, "POST", { valueInputOption: "RAW", data: updates.slice(i, i + 400) });
  }
  for (let i = 0; i < appends.length; i += 2000) {
    await gw(`${sheetId}/values/${q(tab.title)}!A:${last}:append`, "POST", { values: appends.slice(i, i + 2000) }, { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" });
  }
  return { added: appends.length, updated: updates.length };
}

async function buildTabs(sb: any): Promise<Tab[]> {
  const asOf = dhaka(new Date().toISOString()).slice(0, 19).replace("T", " ");
  const [analytics, recon, bal, ver, ledger, allocItems, pays, exps, transfers, loans, invoices, hist] = await Promise.all([
    computeAnalytics(sb, {}), computeReconciliation(sb),
    sb.from("fund_balances").select("*").order("display_order"),
    sb.from("fund_allocation_versions").select("id").order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    fetchAll((a, b) => sb.from("fund_ledger_running").select("*").order("created_at").order("id").range(a, b)),
    fetchAll((a, b) => sb.from("installment_allocation_items").select("id,fund_name,percent,amount,installment_allocations!inner(id,status,source,received_amount,deduction_total,distributable_amount,created_at,installment_id,invoice_id,customer_id,project_id,fund_allocation_versions(name),invoice_installments(label,sequence,paid_at))").order("id").range(a, b)),
    fetchAll((a, b) => sb.from("employee_fund_payments").select("*").order("id").range(a, b)),
    fetchAll((a, b) => sb.from("expenses").select("id,voucher_no,category,vendor,request_purpose,amount,currency,spent_on,fund_id,txn_id,linked_invoice_id,deleted_at").order("id").range(a, b)),
    sb.from("fund_transfers").select("*"), sb.from("fund_loans").select("*"),
    sb.from("invoices").select("id,slug,currency,total_amount,paid_amount,status,project_id"),
    classifyInstallments(sb),
  ]);
  const funds = (bal.data ?? []) as any[];
  const fundName = new Map(funds.map((f) => [f.fund_id, f.name]));
  const pct = new Map<string, number>();
  if (ver.data) { const { data } = await sb.from("fund_allocation_version_items").select("fund_id,percent").eq("version_id", ver.data.id); (data ?? []).forEach((x: any) => pct.set(x.fund_id, n(x.percent))); }
  const invMap = new Map((invoices.data ?? []).map((i: any) => [i.id, i]));
  const people = await nameMaps(sb, [...ledger, ...pays.map((p: any) => ({ employee_id: p.employee_id, created_by: p.created_by, project_id: p.project_id, invoice_id: p.invoice_id })),
    ...(transfers.data ?? []).map((t: any) => ({ created_by: t.created_by })), ...(loans.data ?? []).map((t: any) => ({ created_by: t.created_by })),
    ...allocItems.map((x: any) => ({ customer_id: x.installment_allocations.customer_id, project_id: x.installment_allocations.project_id, invoice_id: x.installment_allocations.invoice_id }))]);
  const nm = (m: Map<any, any>, id: string | null, k: string) => (id ? (m.get(id) as any)?.[k] ?? "" : "");
  const k = analytics.kpis;
  const inv = { BDT: 0, USD: 0 } as Record<string, number>;
  (invoices.data ?? []).filter((i: any) => i.status !== "void").forEach((i: any) => { inv[i.currency] = (inv[i.currency] ?? 0) + n(i.total_amount); });
  const c = recon.components;
  const profit = analytics.profit;

  const tabs: Tab[] = [];
  tabs.push({ title: "Finance Summary", headers: ["Metric", "BDT", "USD", "As Of"], money: [1, 2], rows: ([
    ["Total Invoiced", inv.BDT, inv.USD], ["Total Collected", k.collected.BDT, k.collected.USD], ["Outstanding", k.outstanding.BDT, k.outstanding.USD],
    ["Direct Deductions", k.deductions, null], ["Distributable Amount", k.distributable, null], ["Total Allocated", k.allocated, null],
    ["Total Fund Balance", c.fundTotal, null], ["Total Available", r2(funds.reduce((a, f) => a + n(f.ledger_balance) - n(f.committed), 0)), null],
    ["Total Committed", k.committed, null], ["Total Employee Paid", k.employeePaid, null], ["Total Operating Expense", k.operatingExpenses, null],
    ["Retained Profit Reserve", k.profitRetained, null], ["Owner Withdrawals", profit?.withdrawals ?? 0, null],
    ["Unallocated Eligible Cash", c.unallocated, null], ["Legacy Cash", c.legacy, null], ["Reconciliation Difference", c.difference, null],
  ] as Cell[][]).map((r) => [...r, asOf]) });
  tabs.push({ title: "Fund Balances", headers: ["Fund Code", "Fund", "Allocation %", "Ledger Balance", "Available", "Allocated", "Spent", "Committed", "Borrowed", "Lent", "Active", "As Of"], money: [3, 4, 5, 6, 7, 8, 9], rows: funds.map((f) => [
    f.code, f.name, pct.get(f.fund_id) ?? 0, n(f.ledger_balance), r2(n(f.ledger_balance) - n(f.committed)), n(f.allocation_total), n(f.spent_total), n(f.committed), n(f.borrowed), n(f.lent), f.is_active ? "Yes" : "No", asOf]) });
  tabs.push({ title: "Fund Ledger", headers: ["Ledger ID", "Date", "Time", "Fund", "Transaction Type", "Direction", "Client", "Project", "Invoice", "Installment", "Employee", "Expense", "Reference", "Credit", "Debit", "Running Balance", "Created By", "Reversal Of"], money: [13, 14, 15], rows: ledger.map((r: any) => {
    const cust: any = people.c.get(r.customer_id); const ex: any = people.e.get(r.expense_id); const ins: any = people.s.get(r.installment_id);
    return [r.id, day(r.created_at), time(r.created_at), fundName.get(r.fund_id) ?? "", txLabel(r.transaction_type, r.direction), r.direction,
      cust ? cust.company || cust.name : "", nm(people.p, r.project_id, "title"), nm(people.i, r.invoice_id, "slug"), ins ? ins.label || `Installment ${ins.sequence}` : "",
      nm(people.pr, r.employee_id, "full_name"), ex ? ex.voucher_no ?? "" : "", r.reference ?? "", n(r.credit), n(r.debit), n(r.running_balance), nm(people.pr, r.created_by, "full_name") || "system", r.reversal_of ?? ""];
  }) });
  tabs.push({ title: "Invoice Allocations", headers: ["Allocation Item ID", "Allocation ID", "Status", "Source", "Payment Date", "Client", "Project", "Invoice", "Installment", "Amount Received", "Direct Deductions", "Distributable Amount", "Allocation Version", "Fund", "Fund %", "Fund Amount"], money: [9, 10, 11, 15], rows: allocItems.map((x: any) => {
    const a = x.installment_allocations; const cust: any = people.c.get(a.customer_id); const ii = a.invoice_installments;
    return [x.id, a.id, a.status, a.source, day(ii?.paid_at ?? a.created_at), cust ? cust.company || cust.name : "", nm(people.p, a.project_id, "title"), nm(people.i, a.invoice_id, "slug"),
      ii ? ii.label || `Installment ${ii.sequence}` : "", n(a.received_amount), n(a.deduction_total), n(a.distributable_amount), a.fund_allocation_versions?.name ?? "", x.fund_name, n(x.percent), n(x.amount)];
  }) });
  tabs.push({ title: "Employee Payments", headers: ["Employee Payment ID", "Date", "Employee", "Payment Type", "Project", "Task", "Invoice", "Amount", "Status", "Salary Slip", "Invoice Payout", "Payment Method", "Reference", "Paid At"], money: [7], rows: pays.map((p: any) => [
    p.id, day(p.created_at), nm(people.pr, p.employee_id, "full_name"), p.payment_type, nm(people.p, p.project_id, "title"), p.task_id ?? "", nm(people.i, p.invoice_id, "slug"),
    n(p.amount), p.status, p.salary_slip_id ?? "", p.invoice_payout_id ?? "", p.payment_method ?? "", p.transaction_reference ?? "", day(p.paid_at)]) });
  tabs.push({ title: "Expenses", headers: ["Expense ID", "Date", "Voucher", "Category", "Vendor / Description", "Project", "Fund", "Amount", "Currency", "Status", "Transaction Reference"], money: [7], rows: exps.map((e: any) => {
    const iv: any = invMap.get(e.linked_invoice_id);
    return [e.id, e.spent_on, e.voucher_no ?? "", e.category, e.vendor || e.request_purpose || "", iv?.project_id ? nm(people.p, iv.project_id, "title") || iv.project_id : "", e.fund_id ? fundName.get(e.fund_id) ?? "" : "Not fund-paid",
      n(e.amount), e.currency, e.deleted_at ? "Deleted (Recycle Bin)" : "Active", e.txn_id ?? ""];
  }) });
  tabs.push({ title: "Fund Transfers", headers: ["Transfer ID", "Date", "From Fund", "To Fund", "Amount", "Reason", "Created By", "Linked Expense", "Kind"], money: [4], rows: (transfers.data ?? []).map((t: any) => [
    t.id, day(t.created_at), fundName.get(t.from_fund_id) ?? "", fundName.get(t.to_fund_id) ?? "", n(t.amount), t.reason ?? "", nm(people.pr, t.created_by, "full_name"), t.linked_expense_id ?? "", "Internal transfer — not revenue/expense"]) });
  tabs.push({ title: "Fund Loans", headers: ["Loan ID", "Created Date", "From Fund", "To Fund", "Principal", "Repaid", "Outstanding", "Status", "Reason", "Created By"], money: [4, 5, 6], rows: (loans.data ?? []).map((l: any) => [
    l.id, day(l.created_at), fundName.get(l.from_fund_id) ?? "", fundName.get(l.to_fund_id) ?? "", n(l.principal_amount), n(l.repaid_amount),
    ["open", "partially_repaid"].includes(l.status) ? r2(n(l.principal_amount) - n(l.repaid_amount)) : 0, l.status, l.reason ?? "", nm(people.pr, l.created_by, "full_name")]) });
  const prof = summarise(await profitData(sb, {}));
  tabs.push({ title: "Project Profitability", headers: ["Project ID", "Project", "Client", "Project Status", "Project Value BDT", "Project Value USD", "Total Invoiced BDT", "Total Invoiced USD", "Collected BDT", "Collected USD", "Outstanding BDT", "Outstanding USD", "Direct Deductions", "Distributable Amount", "Employee Allocation", "Employee Paid", "Employee Committed", "Employee Variance", "Project Expenses BDT", "Project Expenses USD", "Net Project Contribution BDT"], money: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], rows: prof.map((p) => [
    p.project_id, p.project, p.client, p.status ?? "", p.project_value.BDT, p.project_value.USD, p.invoiced.BDT, p.invoiced.USD, p.collected.BDT, p.collected.USD, p.outstanding.BDT, p.outstanding.USD,
    p.direct_deductions, p.distributable, p.employee_allocation, p.employee_paid, p.employee_committed, p.employee_variance, p.project_expenses.BDT, p.project_expenses.USD, p.net_contribution_bdt]) });

  // Monthly report — built from the same ledger rows + allocation snapshots (no new formula).
  const months = new Map<string, any>();
  const M = (m: string) => { if (!months.has(m)) months.set(m, { cBDT: 0, cUSD: 0, ded: 0, dist: 0, empAlloc: 0, empPaid: 0, office: 0, software: 0, sales: 0, marketing: 0, tax: 0, reserve: 0, growth: 0, profitAlloc: 0, owner: 0, net: 0 }); return months.get(m); };
  const mo = (iso: string) => dhaka(iso).slice(0, 7);
  hist.filter((h) => h.paid_at).forEach((h) => { const x = M(mo(h.paid_at!)); if (h.currency === "USD") x.cUSD += h.amount; else x.cBDT += h.amount; });
  const seenAlloc = new Set<string>();
  allocItems.filter((x: any) => x.installment_allocations.status === "active").forEach((x: any) => {
    const a = x.installment_allocations; const m = M(mo(a.created_at));
    if (!seenAlloc.has(a.id)) { seenAlloc.add(a.id); m.ded += n(a.deduction_total); m.dist += n(a.distributable_amount); }
  });
  const codeOf = new Map(funds.map((f) => [f.fund_id, f.code]));
  const activeItems = new Map<string, any>();
  allocItems.filter((x: any) => x.installment_allocations.status === "active").forEach((x: any) => activeItems.set(x.id, x));
  const INTERNAL = ["transfer_in", "transfer_out", "loan_in", "loan_out", "loan_repayment", "correction", "reversal"];
  const EMP = ["employee_payment", "salary_payment", "bonus", "incentive", "commission", "overtime", "adjustment"];
  for (const x of activeItems.values()) { const m = M(mo(x.installment_allocations.created_at)); const fc = funds.find((f) => f.name === x.fund_name)?.code; if (fc === "employee") m.empAlloc += n(x.amount); if (fc === "profit") m.profitAlloc += n(x.amount); }
  ledger.forEach((r: any) => {
    const m = M(mo(r.created_at)); const code = codeOf.get(r.fund_id);
    m.net += r.direction === "credit" ? n(r.amount) : -n(r.amount);
    if (code === "reserve") m.reserve += r.direction === "credit" ? n(r.amount) : -n(r.amount);
    let spent = 0;
    if (r.direction === "debit" && !INTERNAL.includes(r.transaction_type)) spent = n(r.amount);
    if (r.direction === "credit" && r.transaction_type === "expense_reversal") spent = -n(r.amount);
    if (!spent) return;
    if (EMP.includes(r.transaction_type)) m.empPaid += spent;
    if (r.transaction_type === "owner_withdrawal") m.owner += spent;
    if (["office", "software", "sales", "marketing", "tax", "growth"].includes(code)) m[code] += spent;
  });
  let ending = 0;
  tabs.push({ title: "Monthly Report", headers: ["Month", "Collected BDT", "Collected USD", "Direct Deductions", "Distributable", "Employee Allocation", "Employee Paid", "Office Spending", "Subscription Spending", "Sales Spending", "Marketing Spending", "Tax Spending", "Reserve Movement", "Growth Spending", "Profit Allocation", "Owner Withdrawal", "Ending Fund Balances (BDT)"], money: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    rows: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, x]) => { ending += x.net; return [m, r2(x.cBDT), r2(x.cUSD), r2(x.ded), r2(x.dist), r2(x.empAlloc), r2(x.empPaid), r2(x.office), r2(x.software), r2(x.sales), r2(x.marketing), r2(x.tax), r2(x.reserve), r2(x.growth), r2(x.profitAlloc), r2(x.owner), r2(ending)]; }) });
  tabs.push({ title: "Reconciliation", headers: ["Item", "BDT", "As Of"], money: [1], rows: ([
    ["Real Company Cash", c.realCash], ["Fund Ledger Balance", c.fundTotal], ["Committed", c.committed], ["Borrowed (loans liability)", c.loansLiability], ["Lent (loans receivable)", c.loansReceivable],
    ["Unallocated Eligible Cash", c.unallocated], ["Legacy Cash", c.legacy], ["Direct Deductions", c.deductions], ["Expenses not fund-paid", c.nonFundExpenses], ["Company Ledger Adjustments", c.companyLedger],
    ["Employee Fund Payments Paid", c.employeePaid], ["Owner Withdrawals", c.ownerWithdrawals], ["Expected Fund Cash", c.expected], ["Difference", c.difference], ["Status", recon.status],
  ] as Cell[][]).map((r) => [...r, asOf]) });
  const pr = progress(hist);
  tabs.push({ title: "Historical Allocation Status", headers: ["Metric", "Value", "As Of"], money: [1], rows: ([
    ["Legacy Paid Installments", pr.legacy], ["Eligible", pr.eligible], ["Allocated Historically", pr.allocatedHistorically], ["Needs Review", pr.needsReview],
    ["USD / Not Eligible", pr.notEligible], ["Remaining Legacy Amount BDT", pr.remainingBdt], ["Remaining Legacy Amount USD", pr.remainingUsd], ["Historical Allocated Amount", pr.historicalAmount],
  ] as Cell[][]).map((r) => [...r, asOf]) });
  return tabs;
}

export const getFinanceSheetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await finance(context);
    const [{ data: s }, { data: logs }] = await Promise.all([
      sb.from("finance_sheet_settings").select("*").eq("id", 1).maybeSingle(),
      sb.from("finance_sheet_sync_logs").select("*").order("started_at", { ascending: false }).limit(60),
    ]);
    return { settings: s ?? null, logs: logs ?? [], tabs: TAB_NAMES };
  });

export const saveFinanceSheetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ spreadsheet: z.string().min(10).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const m = data.spreadsheet.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const id = m ? m[1] : data.spreadsheet.trim();
    if (!/^[a-zA-Z0-9-_]{20,}$/.test(id)) throw new Error("That does not look like a Google Sheets link or ID");
    let title: string;
    try { title = (await gw<any>(id, "GET", undefined, { fields: "properties.title" })).properties?.title ?? "Spreadsheet"; }
    catch (e) { throw new Error(`Could not open that spreadsheet with the connected Google account: ${(e as Error).message}`); }
    const { error } = await sb.from("finance_sheet_settings").upsert({ id: 1, spreadsheet_id: id, spreadsheet_name: title, updated_by: context.userId });
    if (error) throw new Error(error.message);
    return { id, title };
  });

export const syncFinanceSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tabs: z.array(z.string()).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const { data: s } = await sb.from("finance_sheet_settings").select("spreadsheet_id").eq("id", 1).maybeSingle();
    if (!s?.spreadsheet_id) throw new Error("Connect a Finance spreadsheet first");
    const run = crypto.randomUUID();
    const results: { tab: string; ok: boolean; added: number; updated: number; error?: string }[] = [];
    // Everything below only READS finance data and writes to Sheets + sync logs. A failure can never touch finance records.
    try {
      const meta = await gw<any>(s.spreadsheet_id, "GET", undefined, { fields: "sheets.properties(sheetId,title)" });
      const sheets = new Map<string, number>((meta.sheets ?? []).map((x: any) => [x.properties.title, x.properties.sheetId]));
      const tabs = (await buildTabs(sb)).filter((t) => !data.tabs?.length || data.tabs.includes(t.title));
      for (const tab of tabs) {
        const { data: log } = await sb.from("finance_sheet_sync_logs").insert({ run_id: run, tab: tab.title, initiated_by: context.userId, rows_processed: tab.rows.length }).select("id").single();
        try {
          const r = await upsertTab(s.spreadsheet_id, tab, sheets);
          results.push({ tab: tab.title, ok: true, ...r });
          await sb.from("finance_sheet_sync_logs").update({ status: "success", completed_at: new Date().toISOString(), rows_added: r.added, rows_updated: r.updated }).eq("id", log?.id);
        } catch (e) {
          const msg = (e as Error).message.slice(0, 1000);
          results.push({ tab: tab.title, ok: false, added: 0, updated: 0, error: msg });
          await sb.from("finance_sheet_sync_logs").update({ status: "failed", completed_at: new Date().toISOString(), error: msg }).eq("id", log?.id);
        }
      }
    } catch (e) {
      const msg = (e as Error).message.slice(0, 1000);
      results.push({ tab: "(setup)", ok: false, added: 0, updated: 0, error: msg });
      await sb.from("finance_sheet_sync_logs").insert({ run_id: run, tab: "(setup)", initiated_by: context.userId, status: "failed", completed_at: new Date().toISOString(), error: msg });
    }
    const failed = results.filter((r) => !r.ok);
    await sb.from("finance_sheet_settings").update(failed.length
      ? { last_failure_at: new Date().toISOString(), last_error: failed.map((f) => `${f.tab}: ${f.error}`).join(" | ").slice(0, 2000) }
      : { last_success_at: new Date().toISOString(), last_error: null }).eq("id", 1);
    return { run, results };
  });
