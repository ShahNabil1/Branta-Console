// Finance module server functions — invoices, installments, stakeholders,
// payouts, wallet, withdrawals, expenses, reporting.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  source: "invoice" | "manual";
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
const CreateInvoiceIn = z.object({
  customer_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  project_type: z.enum(["one_time", "monthly_retainer"]).default("one_time"),
  starts_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  total_amount: z.number().nonnegative(),
  notes: z.string().trim().max(4000).nullable().optional(),
  internal_notes: z.string().trim().max(4000).nullable().optional(),
  installments: z.array(InstallmentIn).min(1).max(24),
  stakeholders: z.array(StakeholderIn).min(1).max(20),
});
const UpdateInvoiceIn = CreateInvoiceIn.extend({
  id: z.string().uuid(),
});

async function ensureFinanceAdmin(supabase: {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}, userId: string) {
  const { data, error } = await supabase.rpc("is_finance_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — finance role required");
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
  .handler(async ({ context }): Promise<InvoiceRow[]> => {
    const { data, error } = await context.supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
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
  .inputValidator((data: { slug: string }) =>
    z.object({ slug: z.string().trim().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invoice not found");
    const invoice = inv as unknown as InvoiceRow;

    const [{ data: custs }, { data: insts }, { data: stks }, { data: payouts }] =
      await Promise.all([
        context.supabase.from("customers").select("id, name, customer_code").eq("id", invoice.customer_id),
        context.supabase.from("invoice_installments").select("*").eq("invoice_id", invoice.id).order("sequence"),
        context.supabase.from("invoice_stakeholders").select("*").eq("invoice_id", invoice.id),
        context.supabase.from("invoice_payouts").select("*").eq("invoice_id", invoice.id),
      ]);
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
      payouts: (payouts ?? []) as unknown as PayoutRow[],
    };
  });

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInvoiceIn.parse(data))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);

    const pctSum = data.stakeholders.reduce((a, s) => a + s.percent, 0);
    if (Math.abs(pctSum - 100) > 0.01)
      throw new Error(`Stakeholder percentages must sum to 100 (got ${pctSum})`);
    const instSum = data.installments.reduce((a, i) => a + i.amount, 0);
    if (Math.abs(instSum - data.total_amount) > 0.01)
      throw new Error(`Installment amounts must sum to total (got ${instSum})`);

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
        notes: data.notes ?? null,
        internal_notes: data.internal_notes ?? null,
        created_by: context.userId,
        status: "sent" as InvoiceStatus,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("id, slug")
      .single();
    if (invErr || !inv) throw new Error(invErr?.message ?? "Failed to create invoice");
    const invoiceId = (inv as { id: string; slug: string }).id;
    const slug = (inv as { id: string; slug: string }).slug;

    // Stakeholders first (so payout sync trigger has percent info when installments insert)
    const { error: sErr } = await context.supabase.from("invoice_stakeholders").insert(
      data.stakeholders.map((s) => ({
        invoice_id: invoiceId,
        user_id: s.user_id,
        role: s.role,
        percent: s.percent,
        note: s.note ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
    );
    if (sErr) throw new Error(sErr.message);

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
    if (iErr) throw new Error(iErr.message);

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
    const pctSum = data.stakeholders.reduce((a, s) => a + s.percent, 0);
    if (Math.abs(pctSum - 100) > 0.01)
      throw new Error(`Stakeholder percentages must sum to 100 (got ${pctSum})`);
    const instSum = data.installments.reduce((a, i) => a + i.amount, 0);
    if (Math.abs(instSum - data.total_amount) > 0.01)
      throw new Error(`Installment amounts must sum to total (got ${instSum})`);

    const [{ data: before }, { data: paidInst }, { data: activeWithdrawals }] = await Promise.all([
      context.supabase.from("invoices").select("id, slug, title, currency, total_amount").eq("id", data.id).maybeSingle(),
      context.supabase.from("invoice_installments").select("id").eq("invoice_id", data.id).eq("status", "paid").limit(1),
      context.supabase.from("invoice_payouts").select("id").eq("invoice_id", data.id).in("status", ["requested", "paid"]).limit(1),
    ]);
    if (!before) throw new Error("Invoice not found");
    if ((paidInst ?? []).length || (activeWithdrawals ?? []).length) {
      throw new Error("This invoice already has paid installments or withdrawal-linked payouts. Revert those before editing financial structure.");
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
        notes: data.notes ?? null,
        internal_notes: data.internal_notes ?? null,
      } as never)
      .eq("id", data.id);
    if (invErr) throw new Error(invErr.message);

    await context.supabase.from("invoice_payouts").delete().eq("invoice_id", data.id);
    await context.supabase.from("invoice_installments").delete().eq("invoice_id", data.id);
    await context.supabase.from("invoice_stakeholders").delete().eq("invoice_id", data.id);

    const { error: sErr } = await context.supabase.from("invoice_stakeholders").insert(
      data.stakeholders.map((s) => ({ invoice_id: data.id, user_id: s.user_id, role: s.role, percent: s.percent, note: s.note ?? null })) as never,
    );
    if (sErr) throw new Error(sErr.message);
    const { error: iErr } = await context.supabase.from("invoice_installments").insert(
      data.installments.map((i, idx) => ({ invoice_id: data.id, sequence: idx + 1, label: i.label, amount: i.amount, due_date: i.due_date })) as never,
    );
    if (iErr) throw new Error(iErr.message);
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
    if (error) throw new Error(error.message);
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
    // Snapshot invoice details BEFORE deletion so we can log a meaningful
    // "cancelled" event on the underlying lead.
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
    const { error } = await context.supabase.from("invoices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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
    if (error) throw new Error(error.message);

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
  .inputValidator((d: { installment_id: string }) =>
    z.object({ installment_id: z.string().uuid() }).parse(d),
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

    const { error } = await context.supabase
      .from("invoice_installments")
      .update({ status: "pending", paid_at: null, paid_amount: null } as never)
      .eq("id", data.installment_id);
    if (error) throw new Error(error.message);

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

// ==================== Wallet & Payouts ====================
export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WalletBalance[]> => {
    const { data, error } = await context.supabase
      .from("v_wallet_balances")
      .select("*")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as WalletBalance[];
  });

export const listMyPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayoutRow[]> => {
    const { data, error } = await context.supabase
      .from("invoice_payouts")
      .select("*")
      .eq("user_id", context.userId)
      .neq("role", "company")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as PayoutRow[];
    const invIds = Array.from(
      new Set(rows.map((r) => r.invoice_id).filter((x): x is string => !!x)),
    );
    const instIds = Array.from(
      new Set(rows.map((r) => r.installment_id).filter((x): x is string => !!x)),
    );
    const [{ data: invs }, { data: insts }] = await Promise.all([
      invIds.length
        ? context.supabase.from("invoices").select("id, slug").in("id", invIds)
        : Promise.resolve({ data: [] as { id: string; slug: string }[] }),
      instIds.length
        ? context.supabase
            .from("invoice_installments")
            .select("id, label, due_date")
            .in("id", instIds)
        : Promise.resolve({ data: [] as { id: string; label: string; due_date: string }[] }),
    ]);
    const invMap = new Map<string, string>();
    (invs ?? []).forEach((i: { id: string; slug: string | null }) => invMap.set(i.id, i.slug ?? ""));
    const instMap = new Map<string, { label: string; due_date: string }>();
    (insts ?? []).forEach((i: { id: string; label: string; due_date: string }) =>
      instMap.set(i.id, { label: i.label, due_date: i.due_date }),
    );
    return rows.map((r) => ({
      ...r,
      invoice_slug: r.invoice_id ? invMap.get(r.invoice_id) : undefined,
      installment_label: r.installment_id ? instMap.get(r.installment_id)?.label : undefined,
      installment_due: r.installment_id ? instMap.get(r.installment_id)?.due_date : undefined,
    }));
  });

// ==================== Withdrawals ====================
// Flow:
//   request  → payouts FIFO (available → requested, tagged with request id).
//              Withdrawal row status = 'pending'. Employee "available" drops
//              immediately, so no double-spend. Company net is unchanged.
//   cancel   → employee (while still pending) reverts payouts to available.
//   approve  → admin acknowledges; payouts stay 'requested'.
//   reject   → payouts requested→available; request row → 'rejected'.
//   paid     → payouts requested→paid; request row → 'paid'. A negative
//              company_ledger entry ('withdrawal_payout') records the cash
//              outflow so the Company Real Balance reflects the transfer.

async function revertRequestedPayoutsToAvailable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  requestId: string,
) {
  const { data: prev } = await supabase
    .from("invoice_payouts")
    .select("id, invoice_id, source")
    .eq("withdrawal_request_id", requestId);
  if (!prev || prev.length === 0) return;
  // A fully paid invoice keeps its payouts 'available'; otherwise they
  // fall back to 'locked'. Manual payouts (no invoice) are always 'available'.
  const invIds = Array.from(
    new Set(
      (prev as { invoice_id: string | null }[])
        .map((p) => p.invoice_id)
        .filter((x): x is string => !!x),
    ),
  );
  const { data: invs } = invIds.length
    ? await supabase.from("invoices").select("id, status").in("id", invIds)
    : { data: [] as { id: string; status: string }[] };
  const paidInv = new Set<string>(
    ((invs ?? []) as { id: string; status: string }[])
      .filter((i) => i.status === "paid").map((i) => i.id),
  );
  const nowIso = new Date().toISOString();
  for (const p of prev as { id: string; invoice_id: string | null; source: string }[]) {
    const restore =
      p.source === "manual" || (p.invoice_id && paidInv.has(p.invoice_id))
        ? "available"
        : "locked";
    await supabase
      .from("invoice_payouts")
      .update({
        status: restore,
        requested_at: null,
        withdrawal_request_id: null,
        unlocked_at: restore === "available" ? nowIso : null,
      } as never)
      .eq("id", p.id);
  }
}

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number; currency: Currency; payment_method_id?: string | null; payment_method_snapshot?: Record<string, unknown> | null }) =>
    z.object({
      amount: z.number().positive(),
      currency: z.enum(["BDT", "USD"]).default("BDT"),
      payment_method_id: z.string().max(80).nullable().optional(),
      payment_method_snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: bal, error: bErr } = await context.supabase
      .from("v_wallet_balances")
      .select("*")
      .eq("user_id", context.userId)
      .eq("currency", data.currency)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    const available = (bal as { available: number } | null)?.available ?? 0;
    if (available < data.amount)
      throw new Error(`Insufficient available balance (${available} ${data.currency})`);

    const { data: wr, error } = await context.supabase
      .from("withdrawal_requests")
      .insert({
        user_id: context.userId,
        amount: data.amount,
        currency: data.currency,
        payment_method_id: data.payment_method_id ?? null,
        payment_method_snapshot: data.payment_method_snapshot ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("*").single();
    if (error) throw new Error(error.message);
    const row = wr as unknown as WithdrawalRow;

    // Reserve payouts immediately (FIFO) so the employee cannot double-spend
    // while the request is pending review.
    const { data: avail } = await context.supabase
      .from("invoice_payouts")
      .select("id, amount")
      .eq("user_id", context.userId)
      .eq("currency", data.currency)
      .eq("status", "available")
      .neq("role", "company")
      .order("unlocked_at", { ascending: true });
    const nowIso = new Date().toISOString();
    let remaining = Number(data.amount);
    for (const p of (avail ?? []) as { id: string; amount: number }[]) {
      if (remaining <= 0.001) break;
      // v1 does not split payout rows; typical case = exact match.
      await context.supabase
        .from("invoice_payouts")
        .update({
          status: "requested",
          requested_at: nowIso,
          withdrawal_request_id: row.id,
        } as never)
        .eq("id", p.id);
      remaining -= Number(p.amount);
    }
    const { data: linkedPayouts } = await context.supabase
      .from("invoice_payouts")
      .select("invoice_id")
      .eq("withdrawal_request_id", row.id);
    const invoiceIds = Array.from(new Set(((linkedPayouts ?? []) as Array<{ invoice_id: string | null }>).map((p) => p.invoice_id).filter((x): x is string => !!x)));
    for (const invoiceId of invoiceIds) {
      await logInvoiceActivity(
        context.supabase,
        invoiceId,
        context.userId,
        "note",
        `Withdrawal requested — ${fmtMoney(row.amount, row.currency)}`,
        { event: "withdrawal_requested", withdrawal_request_id: row.id, payment_method_id: row.payment_method_id ?? null },
      );
    }
    try {
      const { notify } = await import("@/lib/notify.server");
      const { data: prof } = await context.supabase
        .from("profiles").select("full_name").eq("user_id", context.userId).maybeSingle();
      const uname = (prof as { full_name: string | null } | null)?.full_name ?? "Employee";
      await notify({
        event: "payout.requested",
        recipientRoles: ["finance", "super_admin"],
        vars: { user: uname, amount: `${row.currency} ${Number(row.amount).toLocaleString()}` },
        dedupeKey: `withdrawal:${row.id}:requested`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[requestWithdrawal] notify failed:", e);
    }
    return row;
  });

export const cancelMyWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wr } = await context.supabase
      .from("withdrawal_requests").select("*").eq("id", data.id).maybeSingle();
    const row = wr as WithdrawalRow | null;
    if (!row) throw new Error("Request not found");
    if (row.user_id !== context.userId) throw new Error("Forbidden");
    if (row.status !== "pending") throw new Error("Only pending requests can be cancelled");
    const { data: linkedPayouts } = await context.supabase
      .from("invoice_payouts")
      .select("invoice_id")
      .eq("withdrawal_request_id", row.id);
    const invoiceIds = Array.from(new Set(((linkedPayouts ?? []) as Array<{ invoice_id: string | null }>).map((p) => p.invoice_id).filter((x): x is string => !!x)));
    await revertRequestedPayoutsToAvailable(context.supabase, row.id);
    const { error } = await context.supabase
      .from("withdrawal_requests")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
        admin_note: "Cancelled by employee",
      } as never)
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    for (const invoiceId of invoiceIds) {
      await logInvoiceActivity(
        context.supabase,
        invoiceId,
        context.userId,
        "note",
        `Withdrawal cancelled — ${fmtMoney(row.amount, row.currency)}`,
        { event: "withdrawal_cancelled", withdrawal_request_id: row.id },
      );
    }
    return { ok: true as const };
  });

export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WithdrawalRow[]> => {
    const { data, error } = await context.supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("user_id", context.userId)
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as WithdrawalRow[];
  });

export const listWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WithdrawalRow[]> => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("withdrawal_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as WithdrawalRow[];
    const uids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (uids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("user_id, full_name, payment_methods").in("user_id", uids);
      const nm = new Map<string, string>();
      const pmMap = new Map<string, Array<Record<string, unknown>>>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null; payment_methods: unknown }) => {
        nm.set(p.user_id, p.full_name ?? "");
        pmMap.set(p.user_id, Array.isArray(p.payment_methods) ? (p.payment_methods as Array<Record<string, unknown>>) : []);
      });
      rows.forEach((r) => {
        r.user_name = nm.get(r.user_id) ?? null;
        // Hydrate snapshot with full details from the user's current payment methods
        // when the stored snapshot is thin (older rows) or the method still exists.
        const methods = pmMap.get(r.user_id) ?? [];
        const match = r.payment_method_id
          ? methods.find((m) => (m as { id?: string }).id === r.payment_method_id)
          : undefined;
        if (match) {
          const snap = (r.payment_method_snapshot ?? {}) as Record<string, unknown>;
          const merged = { ...match, ...snap } as Record<string, unknown>;
          // Ensure kind/label/account fallbacks exist for the table cell
          if (!merged.kind && (match as { kind?: string }).kind) merged.kind = (match as { kind?: string }).kind;
          if (!merged.label) {
            merged.label = merged.kind === "bank"
              ? ((match as { bank_name?: string }).bank_name ?? "Bank")
              : ((match as { mfs_provider?: string }).mfs_provider ?? "MFS");
          }
          if (!merged.account) {
            merged.account = merged.kind === "bank"
              ? ((match as { account_number?: string }).account_number ?? "")
              : ((match as { mfs_number?: string }).mfs_number ?? "");
          }
          r.payment_method_snapshot = merged as WithdrawalRow["payment_method_snapshot"];
        }
      });
    }
    return rows;
  });

export const decideWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    action: "approve" | "reject" | "paid";
    note?: string | null;
    transfer_ref?: string | null;
  }) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["approve", "reject", "paid"]),
      note: z.string().max(500).nullable().optional(),
      transfer_ref: z.string().max(200).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);

    const { data: existing } = await context.supabase
      .from("withdrawal_requests").select("*").eq("id", data.id).maybeSingle();
    const row = existing as WithdrawalRow | null;
    if (!row) throw new Error("Request not found");
    if (row.status === "paid") throw new Error("Already paid — cannot change");
    if (row.status === "rejected") throw new Error("Already rejected");
    if (data.action === "paid" && row.status !== "approved")
      throw new Error("Approve the request before marking it paid");
    if (data.action === "approve" && row.status !== "pending")
      throw new Error("Only pending requests can be approved");

    const { data: linkedPayouts } = await context.supabase
      .from("invoice_payouts")
      .select("id, invoice_id, amount, currency, user_id")
      .eq("withdrawal_request_id", row.id);

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = { admin_note: data.note ?? row.admin_note ?? null };
    if (data.action === "approve") {
      update.status = "approved";
      update.decided_at = nowIso;
      update.decided_by = context.userId;
    } else if (data.action === "reject") {
      update.status = "rejected";
      update.decided_at = nowIso;
      update.decided_by = context.userId;
      await revertRequestedPayoutsToAvailable(context.supabase, row.id);
    } else {
      update.status = "paid";
      update.paid_at = nowIso;
      update.paid_by = context.userId;
      if (data.transfer_ref) update.transfer_ref = data.transfer_ref;
      await context.supabase
        .from("invoice_payouts")
        .update({ status: "paid", paid_at: nowIso } as never)
        .eq("withdrawal_request_id", row.id);
      // Cash outflow → company ledger so real_balance drops by the payout.
      await context.supabase.from("company_ledger").insert({
        kind: "withdrawal_payout",
        currency: row.currency,
        amount: -Math.abs(Number(row.amount)),
        notes: `Payout to employee (withdrawal ${row.id.slice(0, 8)}${data.transfer_ref ? ` · ref ${data.transfer_ref}` : ""})`,
        occurred_on: nowIso.slice(0, 10),
        created_by: context.userId,
      } as never);
    }

    const { error } = await context.supabase
      .from("withdrawal_requests")
      .update(update as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const invoiceIds = Array.from(new Set(((linkedPayouts ?? []) as Array<{ invoice_id: string | null }>).map((p) => p.invoice_id).filter((x): x is string => !!x)));
    for (const invoiceId of invoiceIds) {
      await logInvoiceActivity(
        context.supabase,
        invoiceId,
        context.userId,
        "note",
        `Withdrawal ${data.action} — ${fmtMoney(row.amount, row.currency)}`,
        { event: `withdrawal_${data.action}`, withdrawal_request_id: row.id, transfer_ref: data.transfer_ref ?? null, admin_note: data.note ?? null },
      );
    }

    return { ok: true as const };
  });

// ==================== Expenses ====================
export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExpenseRow[]> => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("expenses")
      .select("*")
      .order("spent_on", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as ExpenseRow[];
    const uids = Array.from(new Set(rows.map((r) => r.paid_by).filter(Boolean) as string[]));
    if (uids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("user_id, full_name").in("user_id", uids);
      const nm = new Map<string, string>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
        nm.set(p.user_id, p.full_name ?? ""),
      );
      rows.forEach((r) => {
        if (r.paid_by) r.paid_by_name = nm.get(r.paid_by) ?? null;
      });
    }
    return rows;
  });

const ExpenseIn = z.object({
  category: z.enum(["salary", "tools", "ads", "office", "misc", "tax", "refund"]),
  amount: z.number().nonnegative(),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  spent_on: z.string(),
  paid_by: z.string().uuid().nullable().optional(),
  vendor: z.string().max(160).nullable().optional(),
  receipt_url: z.string().max(600).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  linked_invoice_id: z.string().uuid().nullable().optional(),
});

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExpenseIn.parse(d))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: row, error } = await context.supabase
      .from("expenses")
      .insert({ ...data, created_by: context.userId } as never)
      .select("*").single();
    if (error) throw new Error(error.message);
    const expense = row as unknown as ExpenseRow;
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
    return row as unknown as ExpenseRow;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { data: existing } = await context.supabase
      .from("expenses")
      .select("id, category, amount, currency, linked_invoice_id, vendor")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const expense = existing as { id: string; category: string; amount: number; currency: string; linked_invoice_id: string | null; vendor: string | null } | null;
    if (expense?.linked_invoice_id) {
      await logInvoiceActivity(
        context.supabase,
        expense.linked_invoice_id,
        context.userId,
        "note",
        `Expense deleted — ${expense.category} ${fmtMoney(expense.amount, expense.currency)}`,
        { event: "expense_deleted", expense_id: expense.id, category: expense.category, vendor: expense.vendor, related_table: "expenses", related_id: expense.id },
      );
    }
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
  .handler(async ({ context }) => {
    // Any authenticated user can list employees for the stakeholder picker
    // (invoice creators may have `finance_invoice` permission without the
    // finance role). Only non-sensitive profile fields are returned.

    const { data, error } = await context.supabase
      .from("profiles")
      .select("user_id, full_name, employee_code, job_role")
      .order("full_name");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
      user_id: string;
      full_name: string | null;
      employee_code: string | null;
      job_role: string | null;
    }[];
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

export const isFinanceAdminCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("is_finance_admin", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { isAdmin: Boolean(data) };
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
      context.supabase.from("expenses").select("currency, amount"),
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
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return row as unknown as CompanyLedgerRow;
  });

export const deleteCompanyLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureFinanceAdmin(context.supabase as never, context.userId);
    const { error } = await context.supabase.from("company_ledger").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return row as unknown as ManualPayoutRow;
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
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
      return { ok: true as const, mode: "clawback" as const };
    }

    throw new Error("This payout can no longer be revoked");
  });
