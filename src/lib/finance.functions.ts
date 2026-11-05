// Finance module server functions — invoices, installments, stakeholders,
// payouts, wallet, withdrawals, expenses, reporting.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { writeExpenseLog, type ExpenseChange } from "@/lib/expense-logs.functions";

// ==================== Types ====================
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";
export type InstallmentStatus =
  | "pending"
  | "invoiced"
  | "paid"
  | "overdue"
  | "cancelled";
export type PayoutStatus =
  | "locked"
  | "available"
  | "requested"
  | "paid"
  | "cancelled";
export type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";
export type StakeholderRole =
  | "outreach"
  | "lead_closer"
  | "worker"
  | "company";
export type ExpenseCategory =
  | "salary"
  | "tools"
  | "ads"
  | "office"
  | "misc"
  | "tax"
  | "refund";
export type Currency = "BDT" | "USD";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface InvoiceRow {
  id: string;
  slug: string;
  customer_id: string;
  title: string;
  description: string | null;
  project_type: "one_time" | "monthly_retainer";
  starts_on: string | null;
  ends_on: string | null;
  currency: Currency;
  total_amount: number;
  project_cost_total: number;
  paid_amount: number;
  status: InvoiceStatus;
  notes: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string | null;
  customer_code?: string | null;
}

export interface ProjectCostRow {
  id: string;
  invoice_id: string;
  sequence: number;
  name: string;
  amount: number;
  description: string | null;
  cost_type?: string | null;
  amount_mode?: string | null;
  value?: number | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstallmentRow {
  id: string;
  invoice_id: string;
  sequence: number;
  label: string;
  amount: number;
  due_date: string;
  status: InstallmentStatus;
  paid_at: string | null;
  paid_amount: number | null;
  payment_ref: string | null;
  payment_method: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface StakeholderRow {
  id: string;
  invoice_id: string;
  user_id: string;
  role: StakeholderRole;
  percent: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string | null;
  user_email?: string | null;
}

export interface PayoutRow {
  id: string;
  invoice_id: string | null;
  installment_id: string | null;
  stakeholder_id: string | null;
  user_id: string;
  role: StakeholderRole;
  currency: Currency;
  amount: number;
  status: PayoutStatus;
  source: "invoice" | "manual" | "employee_fund";
  kind: string | null;
  notes: string | null;
  unlocked_at: string | null;
  requested_at: string | null;
  paid_at: string | null;
  withdrawal_request_id: string | null;
  created_at: string;
  updated_at: string;
  invoice_slug?: string;
  installment_label?: string;
  installment_due?: string;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  currency: Currency;
  payment_method_id: string | null;
  payment_method_snapshot: {
    kind?: string;
    label?: string;
    account?: string;
    bank_name?: string | null;
    account_holder?: string | null;
    account_number?: string | null;
    branch?: string | null;
    mfs_provider?: string | null;
    mfs_number?: string | null;
  } | null;
  status: WithdrawalStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  admin_note: string | null;
  transfer_ref: string | null;
  user_name?: string | null;
  user_email?: string | null;
}

export interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  amount: number;
  currency: Currency;
  spent_on: string;
  paid_by: string | null;
  vendor: string | null;
  receipt_url: string | null;
  notes: string | null;
  linked_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  paid_by_name?: string | null;
  voucher_no: string | null;
  signed_voucher_url: string | null;
  signed_voucher_at: string | null;
  signed_voucher_by: string | null;
  txn_id?: string | null;
  payment_method?: string | null;
  department?: string | null;
  requested_by?: string | null;
  request_purpose?: string | null;
  requested_by_name?: string | null;
  is_project_cost?: boolean | null;
  share_enabled?: boolean | null;
  share_token?: string | null;
  items?: ExpenseItemRow[];
  attachments?: ExpenseAttachmentRow[];
}


export interface InvoiceActivityLogRow {
  id: string;
  invoice_id: string | null;
  invoice_slug: string;
  actor_id: string | null;
  action: string;
  title: string;
  body: string | null;
  related_table: string | null;
  related_id: string | null;
  deep_link: string | null;
  metadata: { [key: string]: JsonValue } | null;
  created_at: string;
  actor_name?: string | null;
}

export interface WalletBalance {
  user_id: string;
  currency: Currency;
  locked: number;
  available: number;
  requested: number;
  paid_total: number;
}

// ==================== Invoices ====================
const InstallmentIn = z.object({
  label: z.string().trim().min(1).max(80),
  amount: z.number().nonnegative(),
  due_date: z.string().min(4),
});
const StakeholderIn = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["outreach", "lead_closer", "worker", "company"]),
  percent: z.number().min(0).max(100),
  note: z.string().trim().max(200).nullable().optional(),
});
const ProjectCostIn = z.object({
  name: z.string().trim().min(1).max(80),
  amount: z.number().nonnegative(),
  description: z.string().trim().max(500).nullable().optional(),
  cost_type: z.string().trim().max(40).optional().default("other"),
  amount_mode: z.enum(["fixed", "percent"]).optional().default("fixed"),
  value: z.number().nonnegative().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
const EmployeePlanIn = z.object({
  employee_id: z.string().uuid(),
  mode: z.enum(["fixed", "percent"]),
  value: z.number().positive(),
  task_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
const CreateInvoiceIn = z.object({
  customer_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  project_type: z.enum(["one_time", "monthly_retainer"]).default("one_time"),
  starts_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  total_amount: z.number().nonnegative(),
  quantity: z.number().positive().optional(),
  unit_price: z.number().nonnegative().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  internal_notes: z.string().trim().max(4000).nullable().optional(),
  installments: z.array(InstallmentIn).min(1).max(24),
  stakeholders: z.array(StakeholderIn).max(20).default([]),
  project_costs: z.array(ProjectCostIn).max(30).optional().default([]),
  employee_plans: z.array(EmployeePlanIn).max(50).optional(),
});
const UpdateInvoiceIn = CreateInvoiceIn.extend({
  id: z.string().uuid(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveInvoiceQtyLine(sb: any, invoiceId: string, d: { title: string; quantity?: number; unit_price?: number }) {
  if (d.quantity == null || d.unit_price == null) return;
  await sb.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
  const { error } = await sb.from("invoice_line_items").insert({
    invoice_id: invoiceId, sequence: 1, description: d.title, quantity: d.quantity, unit_price: d.unit_price,
  });
  if (error) throw dbError(error);
}

/** Saves the planned Employee Fund split; blocks totals above the expected Employee Fund share. */
async function saveEmployeePlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, invoiceId: string, net: number, rows: z.infer<typeof EmployeePlanIn>[], userId: string,
) {
  const { data: ver } = await sb.from("fund_allocation_versions")
    .select("fund_allocation_version_items(percent,finance_funds(code))")
    .order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empPct = Number(((ver?.fund_allocation_version_items ?? []) as any[]).find((i) => i.finance_funds?.code === "employee")?.percent ?? 0);
  const pool = Math.round(Math.max(net, 0) * empPct) / 100;
  const planned = rows.map((r) => ({ ...r, amount: Math.round((r.mode === "percent" ? pool * r.value / 100 : r.value) * 100) / 100 }));
  const total = planned.reduce((a, r) => a + r.amount, 0);
  if (total > pool + 0.01) throw new Error("Employee allocation exceeds available Employee Fund amount.");
  await sb.from("invoice_employee_plans").delete().eq("invoice_id", invoiceId);
  if (!planned.length) return;
  const { error } = await sb.from("invoice_employee_plans").insert(planned.map((r, i) => ({
    invoice_id: invoiceId, employee_id: r.employee_id, mode: r.mode, value: r.value, planned_amount: r.amount,
    task_id: r.task_id ?? null, note: r.note ?? null, sequence: i + 1, created_by: userId,
  })));
  if (error) throw dbError(error);
}

function sumCosts(costs: Array<{ amount: number }> | undefined): number {
  return Number(((costs ?? []).reduce((a, c) => a + Number(c.amount || 0), 0)).toFixed(2));
}

async function ensureFinanceAdmin(supabase: {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}, userId: string) {
  const { data, error } = await supabase.rpc("is_finance_admin", { _user_id: userId });
  if (error) throw dbError(error);
  if (data) return;
  // Company CEOs pass here; row-level rules limit them to their own company.
  const { data: ceo } = await supabase.rpc("is_any_company_manager", { _user: userId });
  if (ceo) return;
  // Company-scoped Finance members pass; row-level rules keep them to that company.
  const sb = supabase as unknown as { from: (t: string) => any };
  const { data: prof } = await sb.from("profiles").select("id").eq("user_id", userId).maybeSingle();
  const { data: fm } = prof
    ? await sb.from("company_members").select("company_id").eq("user_id", prof.id).eq("role", "finance").eq("is_active", true).limit(1)
    : { data: null };
  if (!fm?.length) throw new Error("Forbidden — finance role required");
}

// Log an activity on the lead that backs an invoice's customer, so all
// invoice/payment events surface in the Lead/Customer Activity Logs feed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logInvoiceActivity(supabase: any, invoiceId: string, actorId: string, kind: string, body: string, meta: Record<string, unknown> = {}) {
  const { data: inv } = await supabase
    .from("invoices")
    .select("customer_id, slug")
    .eq("id", invoiceId)
    .maybeSingle();
  const customerId = (inv as { customer_id?: string } | null)?.customer_id;
  const slug = (inv as { slug?: string } | null)?.slug ?? null;
  if (slug) {
    await supabase.from("invoice_activity_logs").insert({
      invoice_id: invoiceId,
      invoice_slug: slug,
      actor_id: actorId,
      action: String(meta.event ?? kind),
      title: body,
      body: meta.body_detail ?? null,
      related_table: meta.related_table ?? null,
      related_id: meta.related_id ?? null,
      deep_link: meta.deep_link ?? `/app/finance/invoices/${slug}#activity`,
      metadata: meta,
    });
  }
  if (!customerId) return;
  const { data: cust } = await supabase
    .from("customers")
    .select("converted_from_lead_id")
    .eq("id", customerId)
    .maybeSingle();
  const leadId = (cust as { converted_from_lead_id: string | null } | null)?.converted_from_lead_id ?? null;
  if (!leadId) return;
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: actorId,
    kind,
    body,
    meta: { ...meta, invoice_id: invoiceId, invoice_slug: slug },
  });
}

function fmtMoney(n: number | null | undefined, cur: string): string {
  return `${cur} ${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logInvoicePayoutLocks(supabase: any, invoiceId: string, actorId: string, event: string) {
  const { data: payouts } = await supabase
    .from("invoice_payouts")
    .select("id, user_id, role, currency, amount, status, installment_id")
    .eq("invoice_id", invoiceId)
    .eq("status", "locked");
  const rows = (payouts ?? []) as Array<{ id: string; user_id: string; role: string; currency: string; amount: number; status: string; installment_id: string | null }>;
  if (!rows.length) return;
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
  const names = new Map<string, string | null>();
  (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) => names.set(p.user_id, p.full_name));
  const byUser = new Map<string, { name: string | null; role: string; currency: string; total: number; count: number }>();
  rows.forEach((p) => {
    const key = `${p.user_id}:${p.currency}:${p.role}`;
    const cur = byUser.get(key) ?? { name: names.get(p.user_id) ?? null, role: p.role, currency: p.currency, total: 0, count: 0 };
    cur.total += Number(p.amount);
    cur.count += 1;
    byUser.set(key, cur);
  });
  for (const row of byUser.values()) {
    await logInvoiceActivity(
      supabase,
      invoiceId,
      actorId,
      "note",
      `Wallet locked — ${row.name ?? row.role} ${fmtMoney(row.total, row.currency)}`,
      { event, wallet_role: row.role, amount: row.total, currency: row.currency, payout_count: row.count },
    );
  }
}

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data: input, context }): Promise<InvoiceRow[]> => {
    // Only the selected company's invoices (Branta Tech = holding company).
    const co = await (await import("@/lib/lead-company.server")).resolveLeadCompany(context.supabase, context.userId, input.workspace);
    const { data, error } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("company_id" as never, co.id as never)
      .is("archived_at" as never, null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
    const rows = (data ?? []) as unknown as InvoiceRow[];
    const custIds = Array.from(new Set(rows.map((r) => r.customer_id)));
    if (custIds.length) {
      const { data: custs } = await context.supabase
        .from("customers")
        .select("id, name, customer_code")
        .in("id", custIds);
      const map = new Map<string, { name: string; customer_code: string }>();
      (custs ?? []).forEach((c: { id: string; name: string; customer_code: string }) =>
        map.set(c.id, { name: c.name, customer_code: c.customer_code }),
      );
      return rows.map((r) => ({
        ...r,
        customer_name: map.get(r.customer_id)?.name ?? null,
        customer_code: map.get(r.customer_id)?.customer_code ?? null,
      }));
    }
    return rows;
  });

export const getInvoiceBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { slug: string; workspace?: string | null }) =>
    z.object({ slug: z.string().trim().min(1), workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).nullable().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const co = await (await import("@/lib/lead-company.server")).resolveLeadCompany(context.supabase, context.userId, data.workspace);
    const { data: inv, error } = await context.supabase
      .from("invoices").select("*").eq("slug", data.slug).eq("company_id" as never, co.id as never).maybeSingle();
    if (error) throw dbError(error);
    if (!inv) throw new Error("Invoice not found");
    const invoice = inv as unknown as InvoiceRow;

    const [{ data: custs }, { data: insts }, { data: stks }, { data: payouts }] =
      await Promise.all([
        context.supabase.from("customers").select("id, name, customer_code").eq("id", invoice.customer_id),
        context.supabase.from("invoice_installments").select("*").eq("invoice_id", invoice.id).order("sequence"),
        context.supabase.from("invoice_stakeholders").select("*").eq("invoice_id", invoice.id),
        context.supabase.from("invoice_payouts").select("*").eq("invoice_id", invoice.id),
      ]);
    const { data: costs } = await context.supabase
      .from("invoice_project_costs").select("*").eq("invoice_id", invoice.id).order("sequence");
    const cust = (custs ?? [])[0] as { name: string; customer_code: string } | undefined;
    invoice.customer_name = cust?.name ?? null;
    invoice.customer_code = cust?.customer_code ?? null;

    const stakeholders = (stks ?? []) as unknown as StakeholderRow[];
    const userIds = Array.from(new Set(stakeholders.map((s) => s.user_id)));
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("user_id, full_name").in("user_id", userIds);
      const nm = new Map<string, string>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
        nm.set(p.user_id, p.full_name ?? ""),
      );
      stakeholders.forEach((s) => (s.user_name = nm.get(s.user_id) ?? null));
    }

    return {
      invoice,
      installments: (insts ?? []) as unknown as InstallmentRow[],
      stakeholders,
      projectCosts: (costs ?? []) as unknown as ProjectCostRow[],
      payouts: (payouts ?? []) as unknown as PayoutRow[],
    };
  });

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInvoiceIn.parse(data))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);

    // New invoices are Fund Ledger invoices: no stakeholder revenue split (employees are paid from the Employee Fund).
    const instSum = data.installments.reduce((a, i) => a + i.amount, 0);
    if (Math.abs(instSum - data.total_amount) > 0.01)
      throw new Error(`Installment amounts must sum to total (got ${instSum})`);
    const costTotal = sumCosts(data.project_costs);
    if (costTotal > data.total_amount + 0.01)
      throw new Error("Total project cost cannot exceed the invoice total amount");

    const { data: inv, error: invErr } = await context.supabase
      .from("invoices")
      .insert({
        customer_id: data.customer_id,
        title: data.title,
        description: data.description ?? null,
        project_type: data.project_type,
        starts_on: data.starts_on ?? null,
        ends_on: data.ends_on ?? null,
        currency: data.currency,
        total_amount: data.total_amount,
        project_cost_total: costTotal,
        notes: data.notes ?? null,
        internal_notes: data.internal_notes ?? null,
        project_id: data.project_id ?? null,
        created_by: context.userId,
        status: "sent" as InvoiceStatus,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("id, slug")
      .single();
    if (invErr || !inv) throw new Error(invErr?.message ?? "Failed to create invoice");
    const invoiceId = (inv as { id: string; slug: string }).id;
    const slug = (inv as { id: string; slug: string }).slug;
    await saveInvoiceQtyLine(context.supabase, invoiceId, data);

    if ((data.project_costs ?? []).length) {
      const { error: cErr } = await context.supabase.from("invoice_project_costs").insert(
        (data.project_costs ?? []).map((c, idx) => ({
          invoice_id: invoiceId,
          sequence: idx + 1,
          name: c.name,
          amount: c.amount,
          description: c.description ?? null,
          cost_type: c.cost_type ?? "other", amount_mode: c.amount_mode ?? "fixed", value: c.value ?? c.amount, note: c.note ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any,
      );
      if (cErr) throw dbError(cErr);
    }

    // Fund Ledger invoice: no stakeholder rows are created.
    if (data.employee_plans) await saveEmployeePlan(context.supabase, invoiceId, data.total_amount - costTotal, data.employee_plans, context.userId);

    const { error: iErr } = await context.supabase.from("invoice_installments").insert(
      data.installments.map((i, idx) => ({
        invoice_id: invoiceId,
        sequence: idx + 1,
        label: i.label,
        amount: i.amount,
        due_date: i.due_date,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
    );
    if (iErr) throw dbError(iErr);

    // Activity log on the invoice and the customer's underlying lead.
    const { data: custRow } = await context.supabase
      .from("customers")
      .select("converted_from_lead_id, customer_code, name")
      .eq("id", data.customer_id)
      .maybeSingle();
    const linkedLeadId = (custRow as { converted_from_lead_id: string | null } | null)
      ?.converted_from_lead_id ?? null;
    if (linkedLeadId) {
      const cur = data.currency;
      const amt = data.total_amount.toLocaleString();
      await context.supabase.from("lead_activities").insert({
        lead_id: linkedLeadId,
        actor_id: context.userId,
        kind: "note",
        body: `Invoice ${slug} created — ${data.title} (${cur} ${amt})`,
        meta: { event: "invoice_created", invoice_id: invoiceId, invoice_slug: slug },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
    await context.supabase.from("invoice_activity_logs").insert({
      invoice_id: invoiceId,
      invoice_slug: slug,
      actor_id: context.userId,
      action: "invoice_created",
      title: `Invoice ${slug} created — ${data.title}`,
      body: `${fmtMoney(data.total_amount, data.currency)} · ${data.installments.length} installment(s) · ${data.stakeholders.length} stakeholder(s)`,
      deep_link: `/app/finance/invoices/${slug}`,
      metadata: { event: "invoice_created", total: data.total_amount, currency: data.currency },
    } as never);
    await logInvoicePayoutLocks(context.supabase, invoiceId, context.userId, "payout_locked");

    // Auto-email the invoice PDF to the customer (respects settings toggle).
    try {
      const { autoSendInvoiceEmail } = await import("@/lib/invoice-email.functions");
      await autoSendInvoiceEmail({
        slug,
        trigger: "auto_created",
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[createInvoice] auto-send failed:", e);
    }

    try {
      const { notify } = await import("@/lib/notify.server");
      const stakeholderIds = Array.from(new Set(data.stakeholders.map((s) => s.user_id)));
      await notify({
        event: "invoice.created",
        recipientRoles: ["finance", "super_admin"],
        recipients: stakeholderIds,
        vars: {
          slug,
          amount: `${data.currency} ${data.total_amount.toLocaleString()}`,
          title: data.title,
        },
        dedupeKey: `invoice:${invoiceId}:created`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[createInvoice] notify failed:", e);
    }

    return { id: invoiceId, slug };
  });

export const updateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateInvoiceIn.parse(data))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: flRow } = await context.supabase.from("invoices").select("fund_ledger_mode").eq("id", data.id).maybeSingle();
    const fundLedger = !!(flRow as { fund_ledger_mode?: boolean } | null)?.fund_ledger_mode;
    if (!fundLedger) {
      const pctSum = data.stakeholders.reduce((a, s) => a + s.percent, 0);
      if (Math.abs(pctSum - 100) > 0.01)
        throw new Error(`Stakeholder percentages must sum to 100 (got ${pctSum})`);
    }
    const instSum = data.installments.reduce((a, i) => a + i.amount, 0);
    if (Math.abs(instSum - data.total_amount) > 0.01)
      throw new Error(`Installment amounts must sum to total (got ${instSum})`);
    const costTotal = sumCosts(data.project_costs);
    if (costTotal > data.total_amount + 0.01)
      throw new Error("Total project cost cannot exceed the invoice total amount");

    const [{ data: before }, { data: paidInst }, { data: activeWithdrawals }] = await Promise.all([
      context.supabase.from("invoices").select("id, slug, title, currency, total_amount").eq("id", data.id).maybeSingle(),
      context.supabase.from("invoice_installments").select("id").eq("invoice_id", data.id).eq("status", "paid").limit(1),
      context.supabase.from("invoice_payouts").select("id").eq("invoice_id", data.id).in("status", ["requested", "paid"]).limit(1),
    ]);
    if (!before) throw new Error("Invoice not found");
    if ((activeWithdrawals ?? []).length) {
      throw new Error("This invoice has payouts that were already requested or paid, so its money structure can't be edited.");
    }
    if (!fundLedger && (paidInst ?? []).length) {
      throw new Error("This invoice already has paid installments. Revert those before editing its money structure.");
    }
    // Fund Ledger invoices: installments are edited in place; paid/allocated ones are locked.
    type ExInst = { id: string; sequence: number; label: string; amount: number; due_date: string; status: string };
    let existing: ExInst[] = [];
    const lockedIds = new Set<string>();
    if (fundLedger) {
      const [{ data: ex }, { data: al }] = await Promise.all([
        context.supabase.from("invoice_installments").select("id, sequence, label, amount, due_date, status").eq("invoice_id", data.id).order("sequence"),
        context.supabase.from("installment_allocations" as never).select("installment_id, status").eq("invoice_id", data.id),
      ]);
      existing = (ex ?? []) as unknown as ExInst[];
      const allocs = (al ?? []) as unknown as { installment_id: string; status: string }[];
      allocs.forEach((a) => lockedIds.add(a.installment_id));
      existing.forEach((e) => { if (e.status === "paid") lockedIds.add(e.id); });
      if (allocs.some((a) => a.status === "active")) {
        const prevTotal = Number((before as { total_amount: number }).total_amount);
        const { data: prevCost } = await context.supabase.from("invoices").select("project_cost_total").eq("id", data.id).maybeSingle();
        if (Math.abs(prevTotal - data.total_amount) > 0.01 || Math.abs(Number((prevCost as { project_cost_total?: number } | null)?.project_cost_total ?? 0) - costTotal) > 0.01)
          throw new Error("Money is already split into the funds for this invoice, so the total and project cost are locked. Revert the paid installments first.");
      }
      data.installments.forEach((inp, k) => {
        const e = existing[k];
        if (e && lockedIds.has(e.id) && Math.abs(Number(e.amount) - inp.amount) > 0.01)
          throw new Error(`Installment #${k + 1} is paid or has a fund split, so its amount is locked.`);
      });
      existing.slice(data.installments.length).forEach((e) => {
        if (lockedIds.has(e.id)) throw new Error(`Installment #${e.sequence} has payment or fund history and can't be removed.`);
      });
    }

    const { error: invErr } = await context.supabase
      .from("invoices")
      .update({
        customer_id: data.customer_id,
        title: data.title,
        description: data.description ?? null,
        project_type: data.project_type,
        starts_on: data.starts_on ?? null,
        ends_on: data.ends_on ?? null,
        currency: data.currency,
        total_amount: data.total_amount,
        project_cost_total: costTotal,
        notes: data.notes ?? null,
        internal_notes: data.internal_notes ?? null,
        ...(data.project_id !== undefined ? { project_id: data.project_id } : {}),
      } as never)
      .eq("id", data.id);
    if (invErr) throw dbError(invErr);
    await saveInvoiceQtyLine(context.supabase, data.id, data);

    if (!fundLedger) {
      await context.supabase.from("invoice_payouts").delete().eq("invoice_id", data.id);
      const { error: dErr } = await context.supabase.from("invoice_installments").delete().eq("invoice_id", data.id);
      if (dErr) throw dbError(dErr);
      await context.supabase.from("invoice_stakeholders").delete().eq("invoice_id", data.id);
    }
    await context.supabase.from("invoice_project_costs").delete().eq("invoice_id", data.id);
    if ((data.project_costs ?? []).length) {
      const { error: cErr } = await context.supabase.from("invoice_project_costs").insert(
        (data.project_costs ?? []).map((c, idx) => ({
          invoice_id: data.id, sequence: idx + 1, name: c.name, amount: c.amount, description: c.description ?? null,
          cost_type: c.cost_type ?? "other", amount_mode: c.amount_mode ?? "fixed", value: c.value ?? c.amount, note: c.note ?? null,
        })) as never,
      );
      if (cErr) throw dbError(cErr);
    }

    if (fundLedger && data.employee_plans) await saveEmployeePlan(context.supabase, data.id, data.total_amount - costTotal, data.employee_plans, context.userId);
    if (!fundLedger) {
      const { error: sErr } = await context.supabase.from("invoice_stakeholders").insert(
        data.stakeholders.map((s) => ({ invoice_id: data.id, user_id: s.user_id, role: s.role, percent: s.percent, note: s.note ?? null })) as never,
      );
      if (sErr) throw dbError(sErr);
    }
    if (!fundLedger) {
      const { error: iErr } = await context.supabase.from("invoice_installments").insert(
        data.installments.map((i, idx) => ({ invoice_id: data.id, sequence: idx + 1, label: i.label, amount: i.amount, due_date: i.due_date })) as never,
      );
      if (iErr) throw dbError(iErr);
    } else {
      for (const e of existing.slice(data.installments.length)) {
        const { error: rErr } = await context.supabase.from("invoice_installments").delete().eq("id", e.id);
        if (rErr) throw dbError(rErr);
      }
      for (let k = 0; k < data.installments.length; k++) {
        const inp = data.installments[k]!;
        const e = existing[k];
        if (e) {
          const patch = lockedIds.has(e.id) ? { label: inp.label, due_date: inp.due_date } : { label: inp.label, amount: inp.amount, due_date: inp.due_date };
          const { error: uErr } = await context.supabase.from("invoice_installments").update(patch as never).eq("id", e.id);
          if (uErr) throw dbError(uErr);
        } else {
          const maxSeq = existing.reduce((m, x) => Math.max(m, x.sequence), 0);
          const { error: nErr } = await context.supabase.from("invoice_installments").insert({ invoice_id: data.id, sequence: maxSeq + (k - existing.length) + 1, label: inp.label, amount: inp.amount, due_date: inp.due_date } as never);
          if (nErr) throw dbError(nErr);
        }
      }
    }
    await logInvoicePayoutLocks(context.supabase, data.id, context.userId, "payout_relocked_after_edit");

    const prior = before as { slug: string; title: string; currency: string; total_amount: number };
    await logInvoiceActivity(
      context.supabase,
      data.id,
      context.userId,
      "note",
      `Invoice ${prior.slug} edited — ${prior.title} → ${data.title}`,
      { event: "invoice_updated", before: { title: prior.title, total: prior.total_amount, currency: prior.currency }, after: { title: data.title, total: data.total_amount, currency: data.currency } },
    );
    return { ok: true as const, slug: prior.slug };
  });

export const listInvoiceActivityLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<InvoiceActivityLogRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("invoice_activity_logs")
      .select("*")
      .eq("invoice_slug", data.slug)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw dbError(error);
    const logs = (rows ?? []) as unknown as InvoiceActivityLogRow[];
    const uids = Array.from(new Set(logs.map((l) => l.actor_id).filter(Boolean) as string[]));
    if (uids.length) {
      const { data: profs } = await context.supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
      const names = new Map<string, string>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) => names.set(p.user_id, p.full_name ?? ""));
      logs.forEach((l) => { if (l.actor_id) l.actor_name = names.get(l.actor_id) ?? null; });
    }
    return logs;
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: inv } = await context.supabase
      .from("invoices")
      .select("id, slug, title, currency, total_amount, paid_amount, status")
      .eq("id", data.id)
      .maybeSingle();
    if (inv) {
      const r = inv as { slug: string; title: string; currency: string; total_amount: number; paid_amount: number; status: string };
      await logInvoiceActivity(
        context.supabase,
        data.id,
        context.userId,
        "note",
        `Invoice ${r.slug} cancelled — ${r.title} (${fmtMoney(r.total_amount, r.currency)}, was ${r.status})`,
        { event: "invoice_cancelled", prior_status: r.status, total: r.total_amount, paid: r.paid_amount },
      );
    }
    const { data: result, error } = await (context.supabase as never as { rpc: (f: string, a: object) => Promise<{ data: string | null; error: { message: string; code?: string } | null }> })
      .rpc("archive_invoice", { _invoice_id: data.id, _reason: "Removed from invoice page" });
    if (error) throw dbError(error);
    return { ok: true as const, result: (result ?? "archived") as "deleted" | "archived" };
  });

export const markInstallmentPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    installment_id: string;
    payment_ref?: string | null;
    payment_method?: string | null;
    paid_amount?: number | null;
  }) =>
    z.object({
      installment_id: z.string().uuid(),
      payment_ref: z.string().max(200).nullable().optional(),
      payment_method: z.string().max(80).nullable().optional(),
      paid_amount: z.number().nonnegative().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);

    // Snapshot installment + invoice prior state for a rich activity log.
    const { data: instBefore } = await context.supabase
      .from("invoice_installments")
      .select("id, invoice_id, sequence, label, amount")
      .eq("id", data.installment_id)
      .maybeSingle();
    const inst = instBefore as { invoice_id: string; sequence: number; label: string; amount: number } | null;
    type PriorInvFull = { slug: string; currency: string; status: string; total_amount: number; paid_amount: number };
    let priorInv: PriorInvFull | null = null;
    if (inst) {
      const { data: pi } = await context.supabase
        .from("invoices")
        .select("slug, currency, status, total_amount, paid_amount")
        .eq("id", inst.invoice_id)
        .maybeSingle();
      priorInv = (pi as unknown) as PriorInvFull;
    }

    const { error } = await context.supabase
      .from("invoice_installments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_amount: data.paid_amount ?? null,
        payment_ref: data.payment_ref ?? null,
        payment_method: data.payment_method ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .eq("id", data.installment_id);
    if (error) throw dbError(error);

    // Log payment received + any resulting invoice status change (partially_paid → paid).
    if (inst && priorInv) {
      const amt = data.paid_amount ?? inst.amount;
      const cur = priorInv.currency;
      const parts = [
        `Payment received — installment #${inst.sequence} ${inst.label} (${fmtMoney(amt, cur)})`,
      ];
      if (data.payment_method) parts.push(`method: ${data.payment_method}`);
      if (data.payment_ref) parts.push(`ref: ${data.payment_ref}`);
      await logInvoiceActivity(
        context.supabase,
        inst.invoice_id,
        context.userId,
        "note",
        parts.join(" · "),
        {
          event: "payment_received",
          installment_id: data.installment_id,
          installment_label: inst.label,
          installment_sequence: inst.sequence,
          amount: amt,
          currency: cur,
          payment_method: data.payment_method ?? null,
          payment_ref: data.payment_ref ?? null,
        },
      );

      // Recompute status trigger already ran — read invoice again to detect change.
      const { data: invAfter } = await context.supabase
        .from("invoices")
        .select("status, paid_amount, total_amount")
        .eq("id", inst.invoice_id)
        .maybeSingle();
      const after = invAfter as { status: string; paid_amount: number; total_amount: number } | null;
      if (after && after.status !== priorInv.status) {
        await logInvoiceActivity(
          context.supabase,
          inst.invoice_id,
          context.userId,
          "status_change",
          `Invoice ${priorInv.slug} status: ${priorInv.status} → ${after.status} (${fmtMoney(after.paid_amount, cur)} / ${fmtMoney(after.total_amount, cur)})`,
          { event: "invoice_status_change", from: priorInv.status, to: after.status, paid: after.paid_amount, total: after.total_amount, currency: cur },
        );
      }

      // Fire branded email to customer + primary contact.
      try {
        const { autoSendInvoiceEmail } = await import("@/lib/invoice-email.functions");
        const fullyPaid = after && Number(after.paid_amount) >= Number(after.total_amount) && Number(after.total_amount) > 0;
        await autoSendInvoiceEmail({
          slug: priorInv.slug,
          trigger: fullyPaid ? "auto_fully_paid" : "auto_installment_paid",
          installment_id: data.installment_id,
          actorId: context.userId,
        });
      } catch (e) {
        console.error("[markInstallmentPaid] auto-send failed:", e);
      }

      try {
        const { notify } = await import("@/lib/notify.server");
        const cur = priorInv.currency;
        const amtPaid = data.paid_amount ?? inst.amount;
        await notify({
          event: "invoice.installment.paid",
          recipientRoles: ["finance", "super_admin"],
          vars: {
            slug: priorInv.slug,
            amount: `${cur} ${Number(amtPaid).toLocaleString()}`,
            label: inst.label,
          },
          dedupeKey: `installment:${data.installment_id}:paid`,
          actorId: context.userId,
        });
        const fullyPaid = after && Number(after.paid_amount) >= Number(after.total_amount) && Number(after.total_amount) > 0;
        if (fullyPaid) {
          const { data: payouts } = await context.supabase
            .from("invoice_payouts")
            .select("user_id, amount, currency")
            .eq("invoice_id", inst.invoice_id)
            .eq("status", "available")
            .neq("role", "company");
          for (const p of ((payouts ?? []) as Array<{ user_id: string; amount: number; currency: string }>)) {
            await notify({
              event: "payout.available",
              recipients: [p.user_id],
              vars: {
                slug: priorInv.slug,
                amount: `${p.currency} ${Number(p.amount).toLocaleString()}`,
              },
              dedupeKey: `payout:${inst.invoice_id}:${p.user_id}:available`,
              actorId: context.userId,
            });
          }
        }
      } catch (e) {
        console.error("[markInstallmentPaid] notify failed:", e);
      }
    }
    return { ok: true as const };
  });

export const revertInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { installment_id: string; reason?: string }) =>
    z.object({ installment_id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);

    const { data: instBefore } = await context.supabase
      .from("invoice_installments")
      .select("id, invoice_id, sequence, label, amount, paid_amount")
      .eq("id", data.installment_id)
      .maybeSingle();
    const inst = instBefore as { invoice_id: string; sequence: number; label: string; amount: number; paid_amount: number | null } | null;
    type PriorInvShort = { slug: string; currency: string; status: string };
    let priorInv: PriorInvShort | null = null;
    if (inst) {
      const { data: pi } = await context.supabase
        .from("invoices")
        .select("slug, currency, status")
        .eq("id", inst.invoice_id)
        .maybeSingle();
      priorInv = (pi as unknown) as PriorInvShort;
    }

    // Atomic: reverses the Fund Ledger allocation (if any) and resets the installment.
    const { error } = await (context.supabase as never as { rpc: (f: string, a: object) => Promise<{ error: { message: string; code?: string } | null }> })
      .rpc("revert_installment_payment", { _installment_id: data.installment_id, _reason: data.reason && data.reason.length >= 5 ? data.reason : "Payment reverted from invoice page" });
    if (error) throw dbError(error);

    if (inst && priorInv) {
      const amt = inst.paid_amount ?? inst.amount;
      await logInvoiceActivity(
        context.supabase,
        inst.invoice_id,
        context.userId,
        "note",
        `Payment reverted — installment #${inst.sequence} ${inst.label} (${fmtMoney(amt, priorInv.currency)})`,
        { event: "payment_reverted", installment_id: data.installment_id, amount: amt, currency: priorInv.currency },
      );

      const { data: invAfter } = await context.supabase
        .from("invoices")
        .select("status, paid_amount, total_amount")
        .eq("id", inst.invoice_id)
        .maybeSingle();
      const after = invAfter as { status: string; paid_amount: number; total_amount: number } | null;
      if (after && after.status !== priorInv.status) {
        await logInvoiceActivity(
          context.supabase,
          inst.invoice_id,
          context.userId,
          "status_change",
          `Invoice ${priorInv.slug} status: ${priorInv.status} → ${after.status} (${fmtMoney(after.paid_amount, priorInv.currency)} / ${fmtMoney(after.total_amount, priorInv.currency)})`,
          { event: "invoice_status_change", from: priorInv.status, to: after.status, paid: after.paid_amount, total: after.total_amount, currency: priorInv.currency },
        );
      }
    }
    return { ok: true as const };
  });

// ==================== Expenses ====================

/**
 * Keeps the invoice's project-cost total in sync with expenses that were
 * tagged "count as project cost" for that invoice. A single auto-managed row
 * mirrors the tagged expense total so stakeholder payouts scale off the net.
 */
const AUTO_COST_NAME = "Tagged expenses (auto)";

/** Re-exported for the Recycle Bin restore flow. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncInvoiceExpenseCostsFor(supabase: any, invoiceId: string | null | undefined) {
  return syncInvoiceExpenseCosts(supabase, invoiceId);
}

async function syncInvoiceExpenseCosts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  invoiceId: string | null | undefined,
) {
  if (!invoiceId) return;
  const { data: tagged } = await supabase
    .from("expenses")
    .select("amount")
    .eq("linked_invoice_id", invoiceId)
    .eq("is_project_cost", true)
    .is("deleted_at", null);
  const sum = (tagged ?? []).reduce(
    (a: number, r: { amount: number }) => a + Number(r.amount || 0),
    0,
  );
  await supabase
    .from("invoice_project_costs")
    .delete()
    .eq("invoice_id", invoiceId)
    .eq("name", AUTO_COST_NAME);
  if (sum > 0) {
    await supabase.from("invoice_project_costs").insert({
      invoice_id: invoiceId,
      sequence: 900,
      name: AUTO_COST_NAME,
      amount: sum,
      description: "Auto-synced from tagged expenses",
    });
  }
  const { data: all } = await supabase
    .from("invoice_project_costs")
    .select("amount")
    .eq("invoice_id", invoiceId);
  const total = (all ?? []).reduce(
    (a: number, r: { amount: number }) => a + Number(r.amount || 0),
    0,
  );
  await supabase.from("invoices").update({ project_cost_total: total }).eq("id", invoiceId);
  // Touch installments so the payout-sync trigger recomputes with the new net.
  const { data: insts } = await supabase
    .from("invoice_installments")
    .select("id, amount")
    .eq("invoice_id", invoiceId);
  for (const i of (insts ?? []) as { id: string; amount: number }[]) {
    await supabase.from("invoice_installments").update({ amount: i.amount }).eq("id", i.id);
  }
}

export interface ExpenseItemRow {
  id: string;
  expense_id: string;
  sequence: number;
  name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  amount: number;
  note: string | null;
}

export interface ExpenseAttachmentRow {
  id: string;
  expense_id: string;
  sequence: number;
  path: string;
  caption: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  kind: string;
}

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data: input, context }): Promise<ExpenseRow[]> => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const co = await (await import("@/lib/lead-company.server")).resolveLeadCompany(context.supabase, context.userId, input.workspace);
    const { data, error } = await context.supabase
      .from("expenses")
      .select("*")
      .eq("company_id" as never, co.id as never)
      .is("deleted_at", null)
      .order("spent_on", { ascending: false })
      .limit(1000);
    if (error) throw dbError(error);
    const rows = (data ?? []) as unknown as ExpenseRow[];
    const uids = Array.from(new Set(
      rows.flatMap((r) => [r.paid_by, r.requested_by]).filter(Boolean) as string[],
    ));
    if (uids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("user_id, full_name").in("user_id", uids);
      const nm = new Map<string, string>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
        nm.set(p.user_id, p.full_name ?? ""),
      );
      rows.forEach((r) => {
        if (r.paid_by) r.paid_by_name = nm.get(r.paid_by) ?? null;
        if (r.requested_by) r.requested_by_name = nm.get(r.requested_by) ?? null;
      });
    }
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const [{ data: items }, { data: atts }] = await Promise.all([
        context.supabase.from("expense_items").select("*").in("expense_id", ids).order("sequence"),
        context.supabase.from("expense_attachments").select("*").in("expense_id", ids).order("sequence"),
      ]);
      const byId = new Map(rows.map((r) => [r.id, r]));
      rows.forEach((r) => { r.items = []; r.attachments = []; });
      ((items ?? []) as unknown as ExpenseItemRow[]).forEach((i) =>
        byId.get(i.expense_id)?.items?.push(i),
      );
      ((atts ?? []) as unknown as ExpenseAttachmentRow[]).forEach((a) =>
        byId.get(a.expense_id)?.attachments?.push(a),
      );
    }
    return rows;
  });

const ExpenseItemIn = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().nonnegative().default(1),
  unit: z.string().max(40).nullable().optional(),
  unit_price: z.number().nonnegative().default(0),
  amount: z.number().nonnegative().default(0),
  note: z.string().max(500).nullable().optional(),
});

const ExpenseAttachmentIn = z.object({
  path: z.string().min(1).max(600),
  caption: z.string().max(300).nullable().optional(),
  mime_type: z.string().max(120).nullable().optional(),
  size_bytes: z.number().nonnegative().nullable().optional(),
  kind: z.enum(["receipt", "signed"]).default("receipt"),
});

const ExpenseIn = z.object({
  workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).nullable().optional(),
  /** Sister companies only: wallet fund key to pay from (same transaction). */
  wallet_bucket: z.string().regex(/^[a-z0-9_]{1,40}$/).nullable().optional(),
  paying_fund_id: z.string().uuid().nullable().optional(),
  fund_exception_reason: z.string().nullable().optional(),
  idempotency_key: z.string().uuid().nullable().optional(),
  category: z.enum(["salary", "tools", "ads", "office", "misc", "tax", "refund"]),
  amount: z.number().nonnegative(),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  spent_on: z.string(),
  paid_by: z.string().uuid().nullable().optional(),
  vendor: z.string().max(160).nullable().optional(),
  receipt_url: z.string().max(600).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  linked_invoice_id: z.string().uuid().nullable().optional(),
  is_project_cost: z.boolean().optional(),
  txn_id: z.string().max(120).nullable().optional(),
  payment_method: z.string().max(80).nullable().optional(),
  department: z.string().max(80).nullable().optional(),
  requested_by: z.string().uuid().nullable().optional(),
  request_purpose: z.string().max(2000).nullable().optional(),
  items: z.array(ExpenseItemIn).max(50).optional(),
  attachments: z.array(ExpenseAttachmentIn).max(20).optional(),
});

async function writeExpenseChildren(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  expenseId: string,
  userId: string,
  items: z.infer<typeof ExpenseItemIn>[] | undefined,
  attachments: z.infer<typeof ExpenseAttachmentIn>[] | undefined,
) {
  if (items) {
    await supabase.from("expense_items").delete().eq("expense_id", expenseId);
    if (items.length) {
      const { error } = await supabase.from("expense_items").insert(
        items.map((i, idx) => ({
          expense_id: expenseId,
          sequence: idx + 1,
          name: i.name,
          quantity: i.quantity ?? 1,
          unit: i.unit ?? null,
          unit_price: i.unit_price ?? 0,
          amount: i.amount ?? (i.quantity ?? 1) * (i.unit_price ?? 0),
          note: i.note ?? null,
        })),
      );
      if (error) throw dbError(error);
    }
  }
  if (attachments) {
    await supabase
      .from("expense_attachments")
      .delete()
      .eq("expense_id", expenseId)
      .eq("kind", "receipt");
    const receipts = attachments.filter((a) => (a.kind ?? "receipt") === "receipt");
    if (receipts.length) {
      const { error } = await supabase.from("expense_attachments").insert(
        receipts.map((a, idx) => ({
          expense_id: expenseId,
          sequence: idx + 1,
          path: a.path,
          caption: a.caption ?? null,
          mime_type: a.mime_type ?? null,
          size_bytes: a.size_bytes ?? null,
          kind: "receipt",
          created_by: userId,
        })),
      );
      if (error) throw dbError(error);
    }
  }
}

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExpenseIn.refine((v) => v.category !== "salary", { message: "Salary can no longer be added as an expense", path: ["category"] }).refine((v) => v.currency === "BDT", { message: "Expenses are recorded in BDT only", path: ["currency"] }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { items, attachments, paying_fund_id, fund_exception_reason, ...base } = data;
    if (paying_fund_id) {
      // Pre-check so an underfunded expense is never created (Fund Ledger rule).
      const { data: fb } = await (context.supabase as any).from("fund_balances").select("code,ledger_balance,committed").eq("fund_id", paying_fund_id).maybeSingle();
      if (!fb) throw new Error("Paying fund not found");
      if (base.currency !== "BDT") throw new Error("Fund-backed expenses must be in BDT");
      if (fb.code === "profit" && (fund_exception_reason ?? "").trim().length < 5) throw new Error("PROFIT_FUND_PROTECTED: exceptional reason required");
      const av = Number(fb.ledger_balance) - Number(fb.committed);
      if (base.amount > av) throw new Error(`INSUFFICIENT_FUND: required ${base.amount}, available ${av}, shortfall ${base.amount - av}`);
    }
    // One DB transaction: expense + line items + receipt rows + fund debit + audit.
    // Receipts are already uploaded to storage (staged); only their rows are written here.
    // idempotency_key makes double-click / retries return the same expense.
    const { idempotency_key, workspace, wallet_bucket, ...expenseFields } = base as typeof base & { idempotency_key?: string | null };
    const co = await (await import("@/lib/lead-company.server")).resolveLeadCompany(context.supabase, context.userId, workspace);
    const { data: newId, error: rpcError } = await (context.supabase as any).rpc("create_expense_atomic", {
      _expense: { ...expenseFields, company_id: co.id, wallet_bucket: co.isHolding ? null : wallet_bucket ?? null },
      _items: items ?? [],
      _attachments: attachments ?? [],
      _fund: paying_fund_id ?? null,
      _exceptional_reason: fund_exception_reason ?? null,
      _idem: idempotency_key ?? null,
    });
    if (rpcError) throw new Error(rpcError.message);
    const { data: row, error } = await context.supabase.from("expenses").select("*").eq("id", newId as string).single();
    if (error) throw dbError(error);
    const expense = row as unknown as ExpenseRow;
    if (expense.is_project_cost) {
      await syncInvoiceExpenseCosts(context.supabase, expense.linked_invoice_id);
    }
    if (expense.linked_invoice_id) {
      await logInvoiceActivity(
        context.supabase,
        expense.linked_invoice_id,
        context.userId,
        "note",
        `Expense added — ${expense.category} ${fmtMoney(expense.amount, expense.currency)}`,
        { event: "expense_created", expense_id: expense.id, category: expense.category, vendor: expense.vendor ?? null, related_table: "expenses", related_id: expense.id },
      );
    }
    await writeExpenseLog(context.supabase, {
      expenseId: expense.id,
      voucherNo: expense.voucher_no,
      actorId: context.userId,
      action: "created",
      metadata: {
        amount: `${expense.currency} ${Number(expense.amount).toLocaleString()}`,
        category: expense.category,
        vendor: expense.vendor ?? null,
        items: (items ?? []).length,
        receipts: (attachments ?? []).length,
      },
    });
    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "expense.added",
        recipientRoles: ["finance", "super_admin"],
        vars: {
          category: expense.category,
          amount: `${expense.currency} ${Number(expense.amount).toLocaleString()}`,
        },
        dedupeKey: `expense:${expense.id}:added`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[createExpense] notify failed:", e);
    }
    return expense;
  });

const TRACKED_FIELDS: { key: string; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount" },
  { key: "currency", label: "Currency" },
  { key: "spent_on", label: "Date" },
  { key: "vendor", label: "Vendor" },
  { key: "department", label: "Department" },
  { key: "payment_method", label: "Payment method" },
  { key: "txn_id", label: "Transaction ID" },
  { key: "requested_by", label: "Requested by" },
  { key: "paid_by", label: "Paid by" },
  { key: "linked_invoice_id", label: "Linked invoice" },
  { key: "is_project_cost", label: "Counted as project cost" },
  { key: "request_purpose", label: "Purpose of request" },
  { key: "notes", label: "Notes" },
];

function asText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function diffExpense(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ExpenseChange[] {
  const out: ExpenseChange[] = [];
  for (const f of TRACKED_FIELDS) {
    const b = asText(before[f.key]);
    const a = asText(after[f.key]);
    if (b !== a) out.push({ field: f.label, before: b, after: a });
  }
  return out;
}

export const updateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    ExpenseIn.extend({
      id: z.string().uuid(),
      edit_reason: z.string().trim().min(5, "Please write why this expense is being edited").max(1000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { id, items, attachments, edit_reason, paying_fund_id: _pf, fund_exception_reason: _fr, workspace: _ws, wallet_bucket: _wb, ...patch } = data;
    void _pf; void _fr; void _ws; void _wb;
    const { data: before } = await context.supabase
      .from("expenses").select("*").eq("id", id).maybeSingle();
    const beforeRow = (before ?? {}) as Record<string, unknown>;
    const beforeCounts = await Promise.all([
      context.supabase.from("expense_items").select("id", { count: "exact", head: true }).eq("expense_id", id),
      context.supabase.from("expense_attachments").select("id", { count: "exact", head: true }).eq("expense_id", id).eq("kind", "receipt"),
    ]);
    const { data: row, error } = await context.supabase
      .from("expenses")
      .update({ ...patch, last_edit_reason: edit_reason } as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw dbError(error);
    const expense = row as unknown as ExpenseRow;
    await writeExpenseChildren(context.supabase, expense.id, context.userId, items, attachments);
    const priorInvoice = (beforeRow.linked_invoice_id as string | null) ?? null;
    await syncInvoiceExpenseCosts(context.supabase, expense.linked_invoice_id);
    if (priorInvoice && priorInvoice !== expense.linked_invoice_id) {
      await syncInvoiceExpenseCosts(context.supabase, priorInvoice);
    }
    const changes = diffExpense(beforeRow, expense as unknown as Record<string, unknown>);
    const oldItems = beforeCounts[0]?.count ?? 0;
    const oldReceipts = beforeCounts[1]?.count ?? 0;
    if (items && items.length !== oldItems) {
      changes.push({ field: "Line items", before: String(oldItems), after: String(items.length) });
    }
    if (attachments && attachments.filter((a) => (a.kind ?? "receipt") === "receipt").length !== oldReceipts) {
      changes.push({
        field: "Receipts",
        before: String(oldReceipts),
        after: String(attachments.filter((a) => (a.kind ?? "receipt") === "receipt").length),
      });
    }
    await writeExpenseLog(context.supabase, {
      expenseId: expense.id,
      voucherNo: expense.voucher_no,
      actorId: context.userId,
      action: "updated",
      reason: edit_reason,
      changes,
    });
    if (expense.linked_invoice_id) {
      await logInvoiceActivity(
        context.supabase,
        expense.linked_invoice_id,
        context.userId,
        "note",
        `Expense updated — ${expense.category} ${fmtMoney(expense.amount, expense.currency)}`,
        { event: "expense_updated", expense_id: expense.id, related_table: "expenses", related_id: expense.id, body_detail: edit_reason },
      );
    }
    return expense;
  });

/**
 * Soft delete — the expense moves to the Recycle Bin for 30 days instead of
 * disappearing. A reason is mandatory and stored with the record.
 */
export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason: string }) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(5, "Please write why this expense is being deleted").max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: existing } = await context.supabase
      .from("expenses")
      .select("id, voucher_no, category, amount, currency, linked_invoice_id, vendor")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    const expense = existing as {
      id: string; voucher_no: string | null; category: string; amount: number;
      currency: string; linked_invoice_id: string | null; vendor: string | null;
    } | null;
    if (!expense) throw new Error("Expense not found (already deleted?)");
    const now = new Date();
    const purge = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { error } = await context.supabase
      .from("expenses")
      .update({
        deleted_at: now.toISOString(),
        deleted_by: context.userId,
        delete_reason: data.reason,
        purge_after: purge.toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw dbError(error);
    await syncInvoiceExpenseCosts(context.supabase, expense.linked_invoice_id);
    await writeExpenseLog(context.supabase, {
      expenseId: expense.id,
      voucherNo: expense.voucher_no,
      actorId: context.userId,
      action: "deleted",
      reason: data.reason,
      metadata: {
        amount: `${expense.currency} ${Number(expense.amount).toLocaleString()}`,
        purge_after: purge.toISOString(),
      },
    });
    if (expense.linked_invoice_id) {
      await logInvoiceActivity(
        context.supabase,
        expense.linked_invoice_id,
        context.userId,
        "note",
        `Expense moved to Recycle Bin — ${expense.category} ${fmtMoney(expense.amount, expense.currency)}`,
        { event: "expense_deleted", expense_id: expense.id, category: expense.category, vendor: expense.vendor, related_table: "expenses", related_id: expense.id, body_detail: data.reason },
      );
    }
    return { ok: true as const, purge_after: purge.toISOString() };
  });

// -------- Expense vouchers --------
export const getSignedExpenseVoucherUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; mode?: "digital" | "print" }) =>
    z.object({ id: z.string().uuid(), mode: z.enum(["digital", "print"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: row } = await context.supabase
      .from("expenses").select("voucher_no").eq("id", data.id).maybeSingle();
    const voucherNo = (row as { voucher_no: string | null } | null)?.voucher_no;
    if (!voucherNo) throw new Error("Voucher number not assigned yet");
    const { getRequestOrigin } = await import("@/lib/invoice-request-origin.server");
    const { buildSignedExpenseVoucherUrl } = await import("@/lib/invoice-pdf-signing.server");
    let origin = await getRequestOrigin();
    if (!origin) origin = process.env.PUBLIC_BASE_URL || "https://console.brantatech.com";
    const base = buildSignedExpenseVoucherUrl(origin, voucherNo);
    return { url: data.mode === "print" ? `${base}&mode=print` : base, voucher_no: voucherNo };
  });

export const setExpenseSignedVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; path: string | null }) =>
    z.object({ id: z.string().uuid(), path: z.string().max(600).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { error } = await context.supabase
      .from("expenses")
      .update({
        signed_voucher_url: data.path,
        signed_voucher_at: data.path ? new Date().toISOString() : null,
        signed_voucher_by: data.path ? context.userId : null,
      } as never)
      .eq("id", data.id);
    if (error) throw dbError(error);
    const { data: vrow } = await context.supabase
      .from("expenses").select("voucher_no").eq("id", data.id).maybeSingle();
    await writeExpenseLog(context.supabase, {
      expenseId: data.id,
      voucherNo: (vrow as { voucher_no: string | null } | null)?.voucher_no ?? null,
      actorId: context.userId,
      action: data.path ? "sealed_uploaded" : "sealed_removed",
      metadata: data.path ? { path: data.path } : {},
    });
    return { ok: true as const };
  });

// ==================== Reports ====================
export const getFinanceReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string; currency?: Currency }) =>
    z.object({
      from: z.string(),
      to: z.string(),
      currency: z.enum(["BDT", "USD"]).default("BDT"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const [{ data: paidInst }, { data: exps }, { data: outstanding }] = await Promise.all([
      context.supabase
        .from("invoice_installments")
        .select("amount, paid_amount, paid_at, invoice_id")
        .gte("paid_at", data.from)
        .lte("paid_at", data.to)
        .eq("status", "paid"),
      context.supabase
        .from("expenses")
        .select("amount, category, spent_on, currency")
        .is("deleted_at", null)
        .gte("spent_on", data.from)
        .lte("spent_on", data.to)
        .eq("currency", data.currency),
      context.supabase
        .from("invoices")
        .select("total_amount, paid_amount, currency, status")
        .eq("currency", data.currency)
        .in("status", ["sent", "partially_paid", "overdue"]),
    ]);

    // Match paid installments to invoices to filter by currency
    const invIds = Array.from(new Set((paidInst ?? []).map((p) => (p as { invoice_id: string }).invoice_id)));
    let filteredIncome: number = 0;
    if (invIds.length) {
      const { data: invs } = await context.supabase
        .from("invoices").select("id, currency").in("id", invIds);
      const okIds = new Set(
        (invs ?? [])
          .filter((i) => (i as { currency: string }).currency === data.currency)
          .map((i) => (i as { id: string }).id),
      );
      filteredIncome = (paidInst ?? []).reduce((sum, p) => {
        const row = p as { amount: number; paid_amount: number | null; invoice_id: string };
        if (!okIds.has(row.invoice_id)) return sum;
        return sum + Number(row.paid_amount ?? row.amount);
      }, 0);
    }

    const totalExpense = (exps ?? []).reduce(
      (s, e) => s + Number((e as { amount: number }).amount), 0,
    );
    const outstandingTotal = (outstanding ?? []).reduce(
      (s, i) => {
        const r = i as { total_amount: number; paid_amount: number };
        return s + Math.max(0, Number(r.total_amount) - Number(r.paid_amount));
      },
      0,
    );

    // Category breakdown
    const byCategory: Record<string, number> = {};
    (exps ?? []).forEach((e) => {
      const r = e as { category: string; amount: number };
      byCategory[r.category] = (byCategory[r.category] ?? 0) + Number(r.amount);
    });

    return {
      currency: data.currency,
      from: data.from,
      to: data.to,
      income: filteredIncome,
      expense: totalExpense,
      profit: filteredIncome - totalExpense,
      outstanding: outstandingTotal,
      expenses_by_category: byCategory,
    };
  });

// ==================== Employee list (for stakeholder picker) ====================
export const listEmployeesForFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace?: string | null } | undefined) => z.object({ workspace: z.string().max(80).nullish() }).parse(d ?? {}))
  .handler(async ({ data: input, context }) => {
    // A workspace limits the list to that company's active members only.
    let allowed: Set<string> | null = null;
    if (input.workspace) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: co } = await supabaseAdmin.from("companies").select("id, is_holding").eq("slug", input.workspace).maybeSingle();
      if (co && !co.is_holding) {
        const { data: mem } = await supabaseAdmin.from("company_members").select("user_id").eq("company_id", co.id).eq("is_active", true);
        allowed = new Set(((mem ?? []) as { user_id: string }[]).map((m) => m.user_id));
      }
    }
    // Any authenticated user can list employees for the stakeholder picker
    // (invoice creators may have `finance_invoice` permission without the
    // finance role). Only non-sensitive profile fields are returned.

    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, user_id, full_name, employee_code, job_role, avatar_url")
      .is("deactivated_at" as never, null)
      .order("full_name");
    if (error) throw dbError(error);
    const rows = ((data ?? []) as { id: string }[]).filter((r) => !allowed || allowed.has(r.id)).map(({ id: _id, ...r }) => r) as unknown as {
      user_id: string;
      full_name: string | null;
      employee_code: string | null;
      job_role: string | null;
      avatar_url: string | null;
    }[];
    // Emails are only returned to Finance/Admin users.
    const { data: isFin } = await context.supabase.rpc("is_finance_admin", {
      _user_id: context.userId,
    });
    if (!isFin) return rows.map((r) => ({ ...r, email: null as string | null }));
    // Enrich with email via admin API so finance search can match by email.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const emailByUser = new Map<string, string | null>();
      const { data: page } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      (page?.users ?? []).forEach((u) => emailByUser.set(u.id, u.email ?? null));
      return rows.map((r) => ({ ...r, email: emailByUser.get(r.user_id) ?? null }));
    } catch {
      return rows.map((r) => ({ ...r, email: null as string | null }));
    }
  });

/** Finance gate. With a sister `workspace`, that company's CEO (company super_admin) also passes; RLS scopes the rows. */
export const isFinanceAdminCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace?: string | null } | undefined) => z.object({ workspace: z.string().max(80).nullish() }).parse(d ?? {}))
  .handler(async ({ data: input, context }) => {
    const { data, error } = await context.supabase.rpc("is_finance_admin", {
      _user_id: context.userId,
    });
    if (error) throw dbError(error);
    if (data) return { isAdmin: true };
    if (!input.workspace) return { isAdmin: false };
    const { data: co } = await context.supabase.from("companies").select("id, is_holding").eq("slug", input.workspace).maybeSingle();
    if (!co || co.is_holding) return { isAdmin: false };
    // CEO or the company's own Finance member.
    const { data: ok } = await context.supabase.rpc("can_view_company_finance" as never, { _company: co.id, _user: context.userId } as never);
    return { isAdmin: Boolean(ok) };
  });

// ==================== Company Wallet ====================
export interface CompanyLedgerRow {
  id: string;
  kind: "seed" | "other_income" | "adjustment";
  currency: Currency;
  amount: number;
  notes: string | null;
  occurred_on: string;
  created_by: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface CompanyWalletCurrency {
  currency: Currency;
  received: number;
  ledger_total: number;
  expenses_total: number;
  real_balance: number;
  pending: number;
  estimated_total: number;
  employees_locked: number;
  employees_available: number;
  employees_requested: number;
  employees_owed: number;
  company_net: number;
}

export interface CompanyWalletInvoiceRow {
  invoice_id: string;
  slug: string;
  customer_name: string | null;
  currency: Currency;
  total: number;
  paid: number;
  outstanding: number;
  status: InvoiceStatus;
  next_due: string | null;
}

export const getCompanyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const [{ data: invs }, { data: insts }, { data: ledger }, { data: exps }, { data: payouts }] = await Promise.all([
      context.supabase.from("invoices").select("id, currency, total_amount, paid_amount, status").not("status", "in", "(void,paid)"),
      context.supabase.from("invoice_installments").select("invoice_id, amount, paid_amount, status, due_date"),
      context.supabase.from("company_ledger").select("currency, amount"),
      context.supabase.from("expenses").select("currency, amount").is("deleted_at", null),
      context.supabase.from("invoice_payouts").select("currency, amount, status, role"),
    ]);
    const invRows = (invs ?? []) as { id: string; currency: Currency; total_amount: number; paid_amount: number; status: InvoiceStatus }[];
    const currencyByInvoice = new Map(invRows.map((r) => [r.id, r.currency] as const));
    // Also load ALL invoices (incl. paid) so installments can resolve to a currency for `received`.
    const { data: allInvs } = await context.supabase.from("invoices").select("id, currency").neq("status", "void");
    (allInvs ?? []).forEach((r) => {
      const row = r as { id: string; currency: Currency };
      if (!currencyByInvoice.has(row.id)) currencyByInvoice.set(row.id, row.currency);
    });
    const empty = (cur: Currency): CompanyWalletCurrency => ({
      currency: cur, received: 0, ledger_total: 0, expenses_total: 0, real_balance: 0,
      pending: 0, estimated_total: 0,
      employees_locked: 0, employees_available: 0, employees_requested: 0, employees_owed: 0, company_net: 0,
    });
    const map: Record<Currency, CompanyWalletCurrency> = { BDT: empty("BDT"), USD: empty("USD") };
    // Estimated = full contract value of invoices NOT fully paid and NOT void.
    invRows.forEach((r) => { map[r.currency].estimated_total += Number(r.total_amount); });
    (insts ?? []).forEach((row) => {
      const r = row as { invoice_id: string; amount: number; paid_amount: number | null; status: string };
      const cur = currencyByInvoice.get(r.invoice_id);
      if (!cur) return;
      if (r.status === "paid") map[cur].received += Number(r.paid_amount ?? r.amount);
      else if (r.status !== "cancelled") map[cur].pending += Number(r.amount);
    });
    (ledger ?? []).forEach((row) => {
      const r = row as { currency: Currency; amount: number };
      if (map[r.currency]) map[r.currency].ledger_total += Number(r.amount);
    });
    (exps ?? []).forEach((row) => {
      const r = row as { currency: Currency; amount: number };
      if (map[r.currency]) map[r.currency].expenses_total += Number(r.amount);
    });
    (payouts ?? []).forEach((row) => {
      const r = row as { currency: Currency; amount: number; status: PayoutStatus; role: StakeholderRole | null };
      if (!map[r.currency]) return;
      // Company-role payouts represent the company's own share, not money owed to employees.
      // They stay inside real_balance and must not be subtracted as "employees owed".
      if (r.role === "company") return;
      if (r.status === "locked") map[r.currency].employees_locked += Number(r.amount);
      else if (r.status === "available") map[r.currency].employees_available += Number(r.amount);
      else if (r.status === "requested") map[r.currency].employees_requested += Number(r.amount);
    });
    (Object.keys(map) as Currency[]).forEach((cur) => {
      const c = map[cur];
      c.real_balance = c.received + c.ledger_total - c.expenses_total;
      c.employees_owed = c.employees_locked + c.employees_available + c.employees_requested;
      c.company_net = c.real_balance - (c.employees_available + c.employees_requested);
    });
    return { BDT: map.BDT, USD: map.USD };
  });

export const listCompanyWalletInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyWalletInvoiceRow[]> => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: invs, error } = await context.supabase
      .from("invoices")
      .select("id, slug, customer_id, currency, total_amount, paid_amount, status")
      .not("status", "eq", "void")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
    const rows = (invs ?? []) as { id: string; slug: string; customer_id: string; currency: Currency; total_amount: number; paid_amount: number; status: InvoiceStatus }[];
    const custIds = Array.from(new Set(rows.map((r) => r.customer_id)));
    const { data: custs } = custIds.length
      ? await context.supabase.from("customers").select("id, name").in("id", custIds)
      : { data: [] as { id: string; name: string }[] };
    const custMap = new Map<string, string>();
    (custs ?? []).forEach((c) => custMap.set((c as { id: string }).id, (c as { name: string }).name));
    const invIds = rows.map((r) => r.id);
    const { data: insts } = invIds.length
      ? await context.supabase.from("invoice_installments").select("invoice_id, due_date, status").in("invoice_id", invIds)
      : { data: [] as { invoice_id: string; due_date: string; status: string }[] };
    const nextDueMap = new Map<string, string>();
    ((insts ?? []) as { invoice_id: string; due_date: string; status: string }[])
      .filter((i) => i.status !== "paid" && i.status !== "cancelled")
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .forEach((i) => { if (!nextDueMap.has(i.invoice_id)) nextDueMap.set(i.invoice_id, i.due_date); });
    return rows.map((r) => ({
      invoice_id: r.id, slug: r.slug,
      customer_name: custMap.get(r.customer_id) ?? null,
      currency: r.currency, total: Number(r.total_amount), paid: Number(r.paid_amount),
      outstanding: Math.max(0, Number(r.total_amount) - Number(r.paid_amount)),
      status: r.status, next_due: nextDueMap.get(r.id) ?? null,
    }));
  });

export const listCompanyLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyLedgerRow[]> => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("company_ledger").select("*").order("occurred_on", { ascending: false }).limit(500);
    if (error) throw dbError(error);
    const rows = (data ?? []) as unknown as CompanyLedgerRow[];
    const uids = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean) as string[]));
    if (uids.length) {
      const { data: profs } = await context.supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
      const nm = new Map<string, string>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) => nm.set(p.user_id, p.full_name ?? ""));
      rows.forEach((r) => { if (r.created_by) r.created_by_name = nm.get(r.created_by) ?? null; });
    }
    return rows;
  });

export const addCompanyLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(["seed", "other_income", "adjustment"]),
    currency: z.enum(["BDT", "USD"]),
    amount: z.number().refine((n) => n !== 0, "Amount must be non-zero"),
    notes: z.string().trim().max(500).nullable().optional(),
    occurred_on: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: row, error } = await context.supabase
      .from("company_ledger")
      .insert({
        kind: data.kind, currency: data.currency, amount: data.amount,
        notes: data.notes ?? null,
        occurred_on: data.occurred_on ?? new Date().toISOString().slice(0, 10),
        created_by: context.userId,
      } as never)
      .select("*").single();
    if (error) throw dbError(error);
    return row as unknown as CompanyLedgerRow;
  });

export const deleteCompanyLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { error } = await context.supabase.from("company_ledger").delete().eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true as const };
  });

// ==================== Manual Employee Payouts ====================
// Salary, bonus, profit-share, reimbursements, adjustments — money the
// company gives to an employee outside of any invoice. Inserted as an
// already-available payout so the standard withdrawal flow can pay it out.

export interface ManualPayoutRow {
  id: string;
  user_id: string;
  currency: Currency;
  amount: number;
  kind: string;
  notes: string | null;
  status: PayoutStatus;
  created_at: string;
  unlocked_at: string | null;
  user_name?: string | null;
  user_email?: string | null;
  created_by?: string | null;
}

export const listManualEmployeePayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManualPayoutRow[]> => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("invoice_payouts")
      .select("id, user_id, currency, amount, kind, notes, status, created_at, unlocked_at")
      .eq("source", "manual")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
    const rows = (data ?? []) as unknown as ManualPayoutRow[];
    const uids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (uids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("user_id, full_name").in("user_id", uids);
      const nm = new Map<string, string>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
        nm.set(p.user_id, p.full_name ?? ""),
      );
      rows.forEach((r) => (r.user_name = nm.get(r.user_id) ?? null));
    }
    return rows;
  });

export const addManualEmployeePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      currency: z.enum(["BDT", "USD"]),
      amount: z.number().positive(),
      kind: z.enum(["salary", "bonus", "profit_share", "reimbursement", "adjustment", "other"]),
      notes: z.string().trim().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);

    // Confirm the target user exists as an employee profile.
    const { data: prof } = await context.supabase
      .from("profiles").select("user_id, full_name").eq("user_id", data.user_id).maybeSingle();
    if (!prof) throw new Error("Employee not found");

    // Determine the stakeholder role for reporting — use 'worker' as a
    // generic bucket; manual payouts are not truly a stakeholder role.
    const nowIso = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("invoice_payouts")
      .insert({
        user_id: data.user_id,
        role: "worker",
        currency: data.currency,
        amount: data.amount,
        status: "available",
        source: "manual",
        kind: data.kind,
        notes: data.notes ?? null,
        unlocked_at: nowIso,
      } as never)
      .select("*").single();
    if (error) throw dbError(error);
    const created = row as unknown as ManualPayoutRow;
    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "payout.available",
        recipients: [data.user_id],
        vars: {
          slug: data.kind,
          amount: `${data.currency} ${data.amount.toLocaleString()}`,
        },
        dedupeKey: `payout:manual:${created.id}:available`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[addManualEmployeePayout] notify failed:", e);
    }
    return created;
  });

export const revokeManualEmployeePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; notes?: string | null }) =>
    z.object({ id: z.string().uuid(), notes: z.string().trim().max(500).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: existing } = await context.supabase
      .from("invoice_payouts")
      .select("id, source, status, user_id, currency, amount, kind, notes")
      .eq("id", data.id)
      .maybeSingle();
    const row = existing as {
      id: string; source: string; status: PayoutStatus; user_id: string;
      currency: Currency; amount: number; kind: string | null; notes: string | null;
    } | null;
    if (!row) throw new Error("Payout not found");
    if (row.source !== "manual") throw new Error("Only manual payouts can be revoked here");

    if (row.status === "available") {
      // Still sitting in the employee wallet — just cancel it so it stops
      // counting toward their available balance.
      const { error } = await context.supabase
        .from("invoice_payouts")
        .update({ status: "cancelled" } as never)
        .eq("id", row.id);
      if (error) throw dbError(error);
      return { ok: true as const, mode: "cancelled" as const };
    }

    if (row.status === "requested") {
      throw new Error(
        "This payout is part of an active withdrawal request. Reject or cancel the withdrawal first, then revoke it.",
      );
    }

    if (row.status === "paid") {
      // Money already left the company via a withdrawal. Post a clawback
      // row so the employee's available balance is reduced by the same
      // amount — it can go negative and will auto-net against the next
      // credit. Company Net Cash rises immediately because `employees_owed`
      // drops by the clawback amount.
      const { error } = await context.supabase
        .from("invoice_payouts")
        .insert({
          user_id: row.user_id,
          role: "worker",
          currency: row.currency,
          amount: -Number(row.amount),
          status: "available",
          source: "manual",
          kind: "clawback",
          notes: data.notes?.trim()
            || `Revoked from payout ${row.id.slice(0, 8)}${row.notes ? ` · ${row.notes}` : ""}`,
          unlocked_at: new Date().toISOString(),
        } as never);
      if (error) throw dbError(error);
      try {
        const { notify } = await import("@/lib/notify.server");
        await notify({
          event: "payout.revoked",
          recipients: [row.user_id],
          vars: {
            slug: row.kind ?? "manual",
            amount: `${row.currency} ${Number(row.amount).toLocaleString()}`,
          },
          dedupeKey: `payout:${row.id}:revoked`,
          actorId: context.userId,
        });
      } catch (e) {
        console.error("[revokeManualEmployeePayout] notify failed:", e);
      }
      return { ok: true as const, mode: "clawback" as const };
    }

    throw new Error("This payout can no longer be revoked");
  });

export const getInvoiceDeleteBlockers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: blk, error } = await (context.supabase as never as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> })
      .rpc("invoice_delete_blockers", { _invoice_id: data.id });
    if (error) throw dbError(error);
    return (blk ?? {}) as Record<string, number>;
  });
