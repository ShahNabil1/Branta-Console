/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 4 — Historical / legacy allocation. Nothing is allocated automatically:
// every allocation is an explicit Finance/Admin action through the historical_allocate RPC.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { finance } from "./fund-reports.functions";

const n = (v: any) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
export const BATCH_LIMIT = 50;

export type HistStatus = "Legacy / Not Allocated" | "Allocation Required" | "Allocated" | "Reversed";

async function fetchAll(make: (from: number, to: number) => any, cap = 50000) {
  const out: any[] = [];
  for (let i = 0; i < cap; i += 1000) {
    const { data, error } = await make(i, i + 999);
    if (error) throw dbError(error);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Classify every paid, non-void installment. Shared by the page, bulk preview and Sheets. */
export async function classifyInstallments(sb: any) {
  const [insts, allocs, fails] = await Promise.all([
    fetchAll((a, b) => sb.from("invoice_installments")
      .select("id,invoice_id,label,sequence,amount,paid_amount,paid_at,payment_ref,invoices!inner(id,slug,title,currency,status,customer_id,project_id,customers(name,company),client_projects(title))")
      .eq("status", "paid").neq("invoices.status", "void").order("paid_at", { ascending: false }).order("id").range(a, b)),
    fetchAll((a, b) => sb.from("installment_allocations").select("id,installment_id,status,source,distributable_amount,received_amount,created_at").order("id").range(a, b)),
    sb.from("installment_allocation_failures").select("installment_id,error"),
  ]);
  const failMap = new Map((fails.data ?? []).map((f: any) => [f.installment_id, f.error]));
  const byInst = new Map<string, any[]>();
  allocs.forEach((a: any) => { const l = byInst.get(a.installment_id) ?? []; l.push(a); byInst.set(a.installment_id, l); });
  return insts.map((s: any) => {
    const inv = s.invoices; const list = byInst.get(s.id) ?? [];
    const active = list.find((a) => a.status === "active") ?? null;
    const reversed = list.filter((a) => a.status === "reversed");
    let status: HistStatus = "Legacy / Not Allocated";
    if (active) status = "Allocated";
    else if (failMap.has(s.id)) status = "Allocation Required";
    else if (reversed.length) status = "Reversed";
    const warnings: string[] = [];
    if (inv.currency !== "BDT") warnings.push(`${inv.currency} payment — no stored BDT conversion`);
    if (!inv.customer_id) warnings.push("Missing client");
    if (!inv.project_id) warnings.push("Missing project");
    if (!s.paid_at) warnings.push("Missing paid date");
    const eligibility = active ? "Already allocated" : inv.currency !== "BDT" ? "Not Eligible for BDT Fund Allocation" : warnings.length ? "Needs review" : "Eligible";
    return {
      installment_id: s.id, paid_at: s.paid_at, invoice_id: inv.id, invoice_slug: inv.slug, invoice_title: inv.title,
      currency: inv.currency as string, amount: n(s.paid_amount) || n(s.amount), is_partial: n(s.paid_amount) > 0 && n(s.paid_amount) < n(s.amount),
      label: s.label || `Installment ${s.sequence}`, reference: s.payment_ref,
      client: inv.customers?.company || inv.customers?.name || null, customer_id: inv.customer_id,
      project: inv.client_projects?.title ?? null, project_id: inv.project_id,
      status, eligibility, warnings, reason: (failMap.get(s.id) as string | undefined) ?? (reversed.length && !active ? `Reversed: previous allocation reversed` : status === "Legacy / Not Allocated" ? "Paid before Fund Ledger / never allocated" : null),
      active_allocation_id: active?.id ?? null, active_source: active?.source ?? null,
      historical_amount: active?.source === "historical" ? n(active.received_amount) : 0,
    };
  });
}

export function progress(rows: Awaited<ReturnType<typeof classifyInstallments>>) {
  const unalloc = rows.filter((r) => r.status !== "Allocated");
  const sum = (a: typeof rows) => r2(a.reduce((x, r) => x + (r.currency === "BDT" ? r.amount : 0), 0));
  return {
    legacy: unalloc.length,
    eligible: unalloc.filter((r) => r.eligibility === "Eligible").length,
    allocatedHistorically: rows.filter((r) => r.active_source === "historical").length,
    needsReview: unalloc.filter((r) => r.eligibility === "Needs review").length,
    notEligible: unalloc.filter((r) => r.currency !== "BDT").length,
    remainingBdt: sum(unalloc),
    remainingUsd: r2(unalloc.filter((r) => r.currency === "USD").reduce((x, r) => x + r.amount, 0)),
    historicalAmount: r2(rows.reduce((x, r) => x + r.historical_amount, 0)),
  };
}

export const listHistorical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    from: z.string().nullable().optional(), to: z.string().nullable().optional(),
    customerId: z.string().uuid().nullable().optional(), projectId: z.string().uuid().nullable().optional(),
    invoiceId: z.string().uuid().nullable().optional(), status: z.string().nullable().optional(),
    currency: z.enum(["BDT", "USD"]).nullable().optional(), search: z.string().max(80).nullable().optional(),
    page: z.number().int().min(0).default(0), pageSize: z.number().int().min(10).max(200).default(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const all = await classifyInstallments(sb);
    const t = data.search?.trim().toLowerCase();
    const rows = all.filter((r) =>
      (!data.from || (r.paid_at ?? "") >= `${data.from}T00:00:00+06:00`) && (!data.to || (r.paid_at ?? "") <= `${data.to}T23:59:59+06:00`) &&
      (!data.customerId || r.customer_id === data.customerId) && (!data.projectId || r.project_id === data.projectId) &&
      (!data.invoiceId || r.invoice_id === data.invoiceId) && (!data.currency || r.currency === data.currency) &&
      (data.status ? r.status === data.status : r.status !== "Allocated" || r.active_source === "historical") &&
      (!t || [r.client, r.project, r.invoice_slug, r.invoice_title, r.label, r.reference].some((x) => (x ?? "").toLowerCase().includes(t))));
    const uniq = (k: "customer_id" | "project_id" | "invoice_id", lab: (r: any) => string | null) =>
      [...new Map(all.filter((r) => r[k]).map((r) => [r[k] as string, lab(r) ?? "—"])).entries()].map(([id, label]) => ({ id, label }));
    return {
      progress: progress(all), total: rows.length,
      rows: rows.slice(data.page * data.pageSize, data.page * data.pageSize + data.pageSize),
      options: { clients: uniq("customer_id", (r) => r.client), projects: uniq("project_id", (r) => r.project), invoices: uniq("invoice_id", (r) => r.invoice_slug) },
    };
  });

const DedIn = z.array(z.object({ name: z.string().min(1).max(60), amount: z.number().min(0) })).max(10);

export const previewHistorical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    items: z.array(z.object({ installmentId: z.string().uuid(), versionId: z.string().uuid().nullable().optional(), deductions: DedIn.nullable().optional() })).min(1).max(BATCH_LIMIT),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const all = await classifyInstallments(sb);
    const byId = new Map(all.map((r) => [r.installment_id, r]));
    const [{ data: versions }, { data: vItems }, { data: dedRows }] = await Promise.all([
      sb.from("fund_allocation_versions").select("id,name,effective_from,created_at").order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("fund_allocation_version_items").select("version_id,fund_id,percent,finance_funds(name,display_order)"),
      sb.from("installment_deductions").select("installment_id,deduction_type,description,amount_type,value").in("installment_id", data.items.map((i) => i.installmentId)),
    ]);
    const V = (versions ?? []) as any[];
    const out = data.items.map((it) => {
      const r = byId.get(it.installmentId);
      if (!r) return { installmentId: it.installmentId, error: "Installment not found or not paid", blocked: true } as any;
      const warnings = [...r.warnings];
      if (r.status === "Allocated") warnings.push("Already has an active allocation (duplicate blocked)");
      const paidDay = (r.paid_at ?? "").slice(0, 10);
      const suggested = V.find((v) => paidDay && v.effective_from <= paidDay) ?? null;
      if (!suggested && !it.versionId) warnings.push("No allocation version existed on the payment date — choose one manually");
      const version = V.find((v) => v.id === (it.versionId ?? suggested?.id)) ?? null;
      // Reuse deductions already recorded on this installment (reliable evidence); never apply today's global rules.
      const recorded = (dedRows ?? []).filter((x: any) => x.installment_id === r.installment_id).map((x: any) => ({
        name: x.description || x.deduction_type || "Direct deduction",
        amount: r2(x.amount_type === "percent" ? (r.amount * n(x.value)) / 100 : n(x.value)),
      }));
      const deductions = it.deductions ?? recorded;
      const dedTotal = r2(deductions.reduce((a: number, x: { amount: number }) => a + x.amount, 0));
      if (dedTotal > r.amount) warnings.push("Deductions exceed received amount");
      if (!it.deductions && !recorded.length) warnings.push("No deduction evidence on record — defaults to no deduction; confirm");
      const dist = r2(Math.max(0, r.amount - dedTotal));
      // Same rounding as Phase 1: round each item, remainder to the last fund.
      const items = (vItems ?? []).filter((x: any) => version && x.version_id === version.id && n(x.percent) > 0)
        .sort((a: any, b: any) => n(a.finance_funds?.display_order) - n(b.finance_funds?.display_order))
        .map((x: any) => ({ fund_id: x.fund_id, fund: x.finance_funds?.name ?? "—", percent: n(x.percent), amount: r2((dist * n(x.percent)) / 100) }));
      const run = r2(items.reduce((a: number, x: any) => a + x.amount, 0));
      if (items.length && run !== dist) items[items.length - 1].amount = r2(items[items.length - 1].amount + (dist - run));
      const hard = r.currency !== "BDT" || r.status === "Allocated" || !version || dedTotal > r.amount;
      const soft = warnings.filter((w) => w.startsWith("Missing") || w.startsWith("No deduction evidence"));
      return {
        installmentId: r.installment_id, row: r, suggestedVersion: suggested, version, deductions, recordedDeductions: recorded,
        deductionTotal: dedTotal, distributable: dist, items, warnings, blocked: hard, needsReview: !hard && soft.length > 0,
      };
    });
    await sb.from("fund_audit_logs").insert({
      user_id: context.userId, action: "historical_allocation_previewed", record_type: "invoice_installment",
      record_id: data.items.length === 1 ? data.items[0].installmentId : null,
      next: { installments: data.items.map((i) => i.installmentId), versions: [...new Set(out.map((o: any) => o.version?.id).filter(Boolean))], distributable: r2(out.reduce((a: number, o: any) => a + n(o.distributable), 0)) },
    });
    return { versions: V, previews: out };
  });

export const allocateHistorical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    reason: z.string().min(5).max(300),
    items: z.array(z.object({ installmentId: z.string().uuid(), versionId: z.string().uuid(), deductions: DedIn })).min(1).max(BATCH_LIMIT),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const batch = crypto.randomUUID();
    const results: { installmentId: string; ok: boolean; allocationId?: string; error?: string }[] = [];
    for (const it of data.items) {
      const { data: id, error } = await sb.rpc("historical_allocate", { _installment_id: it.installmentId, _version_id: it.versionId, _deductions: it.deductions, _reason: data.reason, _batch: batch });
      results.push(error ? { installmentId: it.installmentId, ok: false, error: error.message } : { installmentId: it.installmentId, ok: true, allocationId: id as string });
    }
    const ok = results.filter((r) => r.ok);
    if (data.items.length > 1 && ok.length) {
      const { data: allocs } = await sb.from("installment_allocations").select("received_amount,distributable_amount,version_id").in("id", ok.map((r) => r.allocationId));
      await sb.from("fund_audit_logs").insert({
        user_id: context.userId, action: "historical_bulk_allocation_created", record_type: "historical_batch", record_id: batch, reason: data.reason,
        next: { count: ok.length, failed: results.length - ok.length, installments: ok.map((r) => r.installmentId),
          total_received: r2((allocs ?? []).reduce((a: number, x: any) => a + n(x.received_amount), 0)),
          total_distributable: r2((allocs ?? []).reduce((a: number, x: any) => a + n(x.distributable_amount), 0)),
          versions: [...new Set((allocs ?? []).map((x: any) => x.version_id))] },
      });
    }
    return { batch, results };
  });

export const reverseHistorical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ allocationId: z.string().uuid(), reason: z.string().min(5).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await finance(context);
    const { data: a } = await sb.from("installment_allocations").select("id,installment_id,source,distributable_amount").eq("id", data.allocationId).maybeSingle();
    if (!a) throw new Error("Allocation not found");
    const { error } = await sb.rpc("reverse_installment_allocation", { _allocation_id: data.allocationId, _reason: data.reason });
    if (error) throw dbError(error);
    await sb.from("fund_audit_logs").insert({ user_id: context.userId, action: "historical_allocation_reversed", record_type: "installment_allocation", record_id: a.id, reason: data.reason, previous: { installment_id: a.installment_id, source: a.source, distributable: n(a.distributable_amount) } });
    return { ok: true };
  });
