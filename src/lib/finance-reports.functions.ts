import { formatCategory } from "@/lib/expense-categories";
// Finance reporting: server-side filtered income / expense / combined rows,
// summary aggregation and PDF / XLSX / CSV export.
// Every entry point re-checks the finance role, so exports can never leak data
// a user is not allowed to read.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ReportRow = {
  id: string;
  date: string;
  type: "income" | "expense";
  reference: string;
  party: string;
  project: string;
  category: string;
  method: string;
  status: string;
  currency: "BDT" | "USD";
  amount: number;
  notes: string;
  createdBy: string | null;
  clientId: string | null;
  invoiceId: string | null;
  /** Where the row came from — used to attach money receipts to income rows. */
  source: "installment" | "ledger" | "expense";
};

const FiltersSchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  type: z.enum(["all", "income", "expense"]).default("all"),
  categories: z.array(z.string()).default([]),
  clientId: z.string().uuid().nullable().default(null),
  invoiceId: z.string().uuid().nullable().default(null),
  paymentMethod: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
  vendor: z.string().nullable().default(null),
  department: z.string().nullable().default(null),
  createdBy: z.string().uuid().nullable().default(null),
  minAmount: z.number().nullable().default(null),
  maxAmount: z.number().nullable().default(null),
  search: z.string().default(""),
});

export type ServerFilters = z.infer<typeof FiltersSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function ensureFinance(supabase: Sb, userId: string) {
  const { data, error } = await supabase.rpc("is_finance_admin", { _user_id: userId });
  if (error) throw dbError(error);
  if (!data) throw new Error("Forbidden — finance access required");
}

const norm = (s: string | null | undefined) => (s ?? "").toString().trim();

function matchesText(row: ReportRow, q: string) {
  if (!q) return true;
  const hay = [
    row.reference, row.party, row.project, row.category,
    row.method, row.status, row.notes, String(row.amount),
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

function applyCommon(rows: ReportRow[], f: ServerFilters) {
  return rows.filter((r) => {
    if (f.minAmount != null && Math.abs(r.amount) < f.minAmount) return false;
    if (f.maxAmount != null && Math.abs(r.amount) > f.maxAmount) return false;
    if (f.paymentMethod && norm(r.method).toLowerCase() !== f.paymentMethod.toLowerCase()) return false;
    if (f.status && norm(r.status).toLowerCase() !== f.status.toLowerCase()) return false;
    if (f.categories.length && !f.categories.includes(r.category)) return false;
    return matchesText(r, f.search);
  });
}

// ---------------- Income ----------------
// Pages through PostgREST 1000-row windows so exports are never truncated.
const CHUNK = 1000;
async function fetchAllRows<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 100_000; offset += CHUNK) {
    const { data, error } = await make(offset, offset + CHUNK - 1);
    if (error) throw dbError(error);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < CHUNK) break;
  }
  return out;
}

async function fetchIncome(supabase: Sb, f: ServerFilters): Promise<ReportRow[]> {
  if (f.type === "expense") return [];

  const makeInstallments = (from: number, to: number) => {
    let q = supabase
    .from("invoice_installments")
    .select(
      "id, label, amount, paid_amount, paid_at, payment_method, payment_ref, status, invoice_id, invoices!inner(id, slug, title, currency, customer_id, customers(name, customer_code))",
    )
    .eq("status", "paid")
    .gte("paid_at", `${f.from}T00:00:00Z`)
    .lte("paid_at", `${f.to}T23:59:59Z`)
    .eq("invoices.currency", f.currency)
    .order("paid_at", { ascending: false })
    .range(from, to);
    if (f.invoiceId) q = q.eq("invoice_id", f.invoiceId);
    if (f.clientId) q = q.eq("invoices.customer_id", f.clientId);
    return q;
  };

  type Inst = {
    id: string; label: string | null; amount: number; paid_amount: number | null;
    paid_at: string | null; payment_method: string | null; payment_ref: string | null;
    invoice_id: string;
    invoices: {
      id: string; slug: string | null; title: string; currency: "BDT" | "USD";
      customer_id: string; customers: { name: string; customer_code: string } | null;
    } | null;
  };

  const data = await fetchAllRows<Inst>((a, b) => makeInstallments(a, b) as never);

  const invoiceRows: ReportRow[] = (data as Inst[]).map((r) => ({
    id: r.id,
    date: (r.paid_at ?? "").slice(0, 10),
    type: "income" as const,
    reference: r.invoices?.slug ?? "—",
    party: r.invoices?.customers?.name ?? "—",
    project: r.invoices?.title ?? "—",
    category: "Invoice payment",
    method: norm(r.payment_method) || "—",
    status: "paid",
    currency: r.invoices?.currency ?? f.currency,
    amount: Number(r.paid_amount ?? r.amount),
    notes: [r.label, r.payment_ref].filter(Boolean).join(" · "),
    createdBy: null,
    clientId: r.invoices?.customer_id ?? null,
    invoiceId: r.invoice_id,
    source: "installment" as const,
  }));

  // Manual (non-invoice) income recorded on the Company Wallet ledger.
  let ledger: ReportRow[] = [];
  if (!f.clientId && !f.invoiceId) {
    const makeLedger = (from: number, to: number) => supabase
      .from("company_ledger")
      .select("id, kind, currency, amount, notes, occurred_on, created_by")
      .eq("currency", f.currency)
      .gte("occurred_on", f.from)
      .lte("occurred_on", f.to)
      .gt("amount", 0)
      .order("occurred_on", { ascending: false })
      .range(from, to);
    type Led = {
      id: string; kind: string; currency: "BDT" | "USD"; amount: number;
      notes: string | null; occurred_on: string; created_by: string | null;
    };
    const led = await fetchAllRows<Led>((a, b) => makeLedger(a, b) as never);
    ledger = (led as Led[]).map((r) => ({
      id: r.id,
      date: r.occurred_on,
      type: "income" as const,
      reference: "LEDGER",
      party: "Company",
      project: "—",
      category: r.kind.replace(/_/g, " "),
      method: "—",
      status: "received",
      currency: r.currency,
      amount: Number(r.amount),
      notes: norm(r.notes),
      createdBy: r.created_by,
      clientId: null,
      invoiceId: null,
      source: "ledger" as const,
    }));
  }

  return [...invoiceRows, ...ledger];
}

// ---------------- Expense ----------------
async function fetchExpense(supabase: Sb, f: ServerFilters): Promise<ReportRow[]> {
  if (f.type === "income") return [];

  const makeExpenses = (from: number, to: number) => {
    let q = supabase
    .from("expenses")
    .select(
      "id, category, amount, currency, spent_on, vendor, notes, voucher_no, txn_id, payment_method, department, requested_by, paid_by, created_by, linked_invoice_id, request_purpose",
    )
    .eq("currency", f.currency)
    .is("deleted_at", null)
    .gte("spent_on", f.from)
    .lte("spent_on", f.to)
    .order("spent_on", { ascending: false })
    .range(from, to);
    if (f.invoiceId) q = q.eq("linked_invoice_id", f.invoiceId);
    if (f.department) q = q.eq("department", f.department);
    if (f.vendor) q = q.ilike("vendor", `%${f.vendor}%`);
    if (f.createdBy) q = q.or(`created_by.eq.${f.createdBy},requested_by.eq.${f.createdBy},paid_by.eq.${f.createdBy}`);
    return q;
  };

  type Exp = {
    id: string; category: string; amount: number; currency: "BDT" | "USD"; spent_on: string;
    vendor: string | null; notes: string | null; voucher_no: string | null; txn_id: string | null;
    payment_method: string | null; department: string | null; requested_by: string | null;
    paid_by: string | null; created_by: string | null; linked_invoice_id: string | null;
    request_purpose: string | null;
  };
  const rows = await fetchAllRows<Exp>((a, b) => makeExpenses(a, b) as never);

  // Resolve linked invoice titles for the "Project" column.
  const invIds = Array.from(new Set(rows.map((r) => r.linked_invoice_id).filter(Boolean))) as string[];
  const invMap = new Map<string, string>();
  if (invIds.length) {
    const { data: invs } = await supabase.from("invoices").select("id, slug, title").in("id", invIds);
    ((invs ?? []) as { id: string; slug: string | null; title: string }[]).forEach((i) =>
      invMap.set(i.id, `${i.slug ? `${i.slug} · ` : ""}${i.title}`),
    );
  }
  // Resolve people names for "Created by".
  const uids = Array.from(
    new Set(rows.flatMap((r) => [r.created_by, r.requested_by, r.paid_by]).filter(Boolean)),
  ) as string[];
  const nameMap = new Map<string, string>();
  if (uids.length) {
    const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
    ((profs ?? []) as { user_id: string; full_name: string | null }[]).forEach((p) =>
      nameMap.set(p.user_id, p.full_name ?? ""),
    );
  }

  return rows.map((r) => ({
    id: r.id,
    date: r.spent_on,
    type: "expense" as const,
    reference: norm(r.voucher_no) || "—",
    party: norm(r.vendor) || "—",
    project: r.linked_invoice_id ? (invMap.get(r.linked_invoice_id) ?? "—") : norm(r.department) || "—",
    category: r.category,
    method: norm(r.payment_method) || "—",
    status: norm(r.txn_id) ? "paid" : "recorded",
    currency: r.currency,
    amount: Number(r.amount),
    notes: [r.notes, r.request_purpose, r.txn_id ? `TXN ${r.txn_id}` : null].filter(Boolean).join(" · "),
    createdBy:
      (r.requested_by && nameMap.get(r.requested_by)) ||
      (r.paid_by && nameMap.get(r.paid_by)) ||
      (r.created_by && nameMap.get(r.created_by)) ||
      null,
    clientId: null,
    invoiceId: r.linked_invoice_id,
    source: "expense" as const,

  }));
}

async function collect(supabase: Sb, f: ServerFilters): Promise<ReportRow[]> {
  const [inc, exp] = await Promise.all([fetchIncome(supabase, f), fetchExpense(supabase, f)]);
  const rows = applyCommon([...inc, ...exp], f);
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows;
}

function summarize(rows: ReportRow[]) {
  let income = 0;
  let expense = 0;
  const byCategory: Record<string, number> = {};
  rows.forEach((r) => {
    if (r.type === "income") income += r.amount;
    else {
      expense += r.amount;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount;
    }
  });
  return {
    income,
    expense,
    net: income - expense,
    count: rows.length,
    expenses_by_category: byCategory,
  };
}

// ---------------- Server functions ----------------
export const listReportRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    FiltersSchema.extend({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(5).max(200).default(25),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinance(context.supabase, context.userId);
    const rows = await collect(context.supabase, data);
    const start = (data.page - 1) * data.pageSize;
    return {
      rows: rows.slice(start, start + data.pageSize),
      total: rows.length,
      summary: summarize(rows),
    };
  });

export const getReportFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureFinance(context.supabase, context.userId);
    const [{ data: custs }, { data: invs }, { data: exps }, { data: profs }] = await Promise.all([
      context.supabase.from("customers").select("id, name, customer_code").order("name").limit(1000),
      context.supabase.from("invoices").select("id, slug, title").is("archived_at" as never, null).order("created_at", { ascending: false }).limit(500),
      context.supabase.from("expenses").select("payment_method, department, vendor").is("deleted_at", null).limit(2000),
      context.supabase.from("profiles").select("user_id, full_name, employee_code").order("full_name").limit(500),
    ]);
    const methods = new Set<string>();
    const departments = new Set<string>();
    const vendors = new Set<string>();
    ((exps ?? []) as { payment_method: string | null; department: string | null; vendor: string | null }[]).forEach((e) => {
      if (norm(e.payment_method)) methods.add(norm(e.payment_method));
      if (norm(e.department)) departments.add(norm(e.department));
      if (norm(e.vendor)) vendors.add(norm(e.vendor));
    });
    ["Cash", "bKash", "Nagad", "Rocket", "Bank Transfer", "Card", "Cheque"].forEach((m) => methods.add(m));
    return {
      customers: (custs ?? []) as { id: string; name: string; customer_code: string }[],
      invoices: (invs ?? []) as { id: string; slug: string | null; title: string }[],
      people: (profs ?? []) as { user_id: string; full_name: string | null; employee_code: string | null }[],
      methods: Array.from(methods).sort(),
      departments: Array.from(departments).sort(),
      vendors: Array.from(vendors).sort(),
    };
  });

const HEADERS = [
  "#", "Date", "Type", "Reference", "Client / Vendor", "Project",
  "Category", "Method", "Status", "Currency", "Amount", "Notes",
];

export const exportReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    FiltersSchema.extend({
      format: z.enum(["pdf", "xlsx", "csv"]),
      kind: z.enum(["finance", "income", "expense"]).default("finance"),
      filterLabels: z.array(z.string()).default([]),
      periodLabel: z.string().default(""),
      fileBase: z.string().default("finance-report"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinance(context.supabase, context.userId);
    if (data.kind === "expense") {
      const { exportExpenseReport } = await import("@/lib/expense-report.server");
      return exportExpenseReport(context.supabase, context.userId, data);
    }
    const rows = await collect(context.supabase, data);
    const sum = summarize(rows);
    const cur = data.currency;
    const sym = cur === "BDT" ? "৳ " : "$ ";
    const fmt = (n: number) =>
      `${n < 0 ? "-" : ""}${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const generatedAt = new Date(Date.now() + 6 * 3600_000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 16) + " (GMT+6)";
    const title =
      data.kind === "income" ? "Income Report" : "Finance Report";

    const filename = `${data.fileBase}.${data.format}`;

    if (data.format === "pdf") {
      const { buildFinanceReportPdf } = await import("@/lib/finance-report-pdf.server");
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const { deviceFromUserAgent } = await import("@/lib/brand/pdf-brand.server");
      const { data: me } = await context.supabase
        .from("profiles").select("full_name").eq("user_id", context.userId).maybeSingle();
      const generatedBy = {
        name: (me as { full_name?: string | null } | null)?.full_name ?? null,
        device: deviceFromUserAgent(getRequestHeader("user-agent") ?? null),
      };
      const { data: settings } = await context.supabase
        .from("invoice_pdf_settings")
        .select("company_name, company_address, company_email, company_website")
        .eq("id", "default")
        .maybeSingle();
      const s = (settings ?? {}) as {
        company_name?: string; company_address?: string | null;
        company_email?: string | null; company_website?: string | null;
      };
      const bytes = await buildFinanceReportPdf({
        title,
        periodLabel: data.periodLabel || `${data.from} → ${data.to}`,
        generatedAt,
        generatedBy,
        currency: cur,
        filters: data.filterLabels,
        summary: [
          { label: "Total income", value: fmt(sum.income) },
          { label: "Total expense", value: fmt(sum.expense) },
          { label: "Net balance", value: fmt(sum.net) },
          { label: "Transactions", value: String(sum.count) },
        ],
        rows: rows.map((r) => ({
          date: r.date,
          type: r.type,
          reference: r.reference,
          party: r.party,
          project: r.project,
          category: formatCategory(r.category),
          method: r.method,
          status: r.status,
          amount: r.amount,
        })),
        company: {
          name: s.company_name || "Branta Tech",
          address: s.company_address ?? null,
          email: s.company_email ?? null,
          website: s.company_website ?? null,
        },
      });
      return {
        filename,
        mime: "application/pdf",
        base64: toBase64(bytes),
        count: rows.length,
      };
    }

    const preamble = [
      `${title} — ${data.periodLabel || `${data.from} to ${data.to}`}`,
      `Currency: ${cur}`,
      `Generated: ${generatedAt}`,
      data.filterLabels.length ? `Filters: ${data.filterLabels.join(" | ")}` : "Filters: none",
      `Total income: ${fmt(sum.income)} | Total expense: ${fmt(sum.expense)} | Net: ${fmt(sum.net)} | Transactions: ${sum.count}`,
    ];

    const body = rows.map((r, i) => [
      i + 1, r.date, r.type, r.reference, r.party, r.project,
      formatCategory(r.category), r.method, r.status, r.currency,
      r.type === "expense" ? -Math.abs(r.amount) : Math.abs(r.amount),
      r.notes,
    ]);

    if (data.format === "csv") {
      const { buildCsv } = await import("@/lib/xlsx.server");
      const csv = buildCsv(HEADERS, body, preamble);
      const bytes = new TextEncoder().encode(csv);
      return {
        filename,
        mime: "text/csv;charset=utf-8",
        base64: toBase64(bytes),
        count: rows.length,
      };
    }

    const { buildXlsx } = await import("@/lib/xlsx.server");
    const bytes = buildXlsx([
      {
        name: title.replace(/ /g, " ").slice(0, 31),
        preamble,
        columns: [
          { header: "#", width: 6 },
          { header: "Date", width: 13, type: "date" },
          { header: "Type", width: 10 },
          { header: "Reference", width: 16 },
          { header: "Client / Vendor", width: 26 },
          { header: "Project", width: 28 },
          { header: "Category", width: 16 },
          { header: "Method", width: 14 },
          { header: "Status", width: 12 },
          { header: "Currency", width: 10 },
          { header: `Amount (${cur})`, width: 16, type: "number" },
          { header: "Notes", width: 40 },
        ],
        rows: body,
        totals: ["", "", "", "", "", "", "", "", "", "Net", sum.net, `${sum.count} transactions`],
      },
    ]);
    return {
      filename,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: toBase64(bytes),
      count: rows.length,
    };
  });

/** Chunked base64 — spreading a large Uint8Array into fromCharCode overflows the stack. */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const size = 8192;
  for (let i = 0; i < bytes.length; i += size) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + size)) as unknown as number[]);
  }
  return btoa(bin);
}
