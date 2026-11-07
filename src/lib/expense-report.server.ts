// Detailed Expense Report export (PDF / XLSX / CSV). Read-only; finance access
// is verified by the calling server function before this runs.
import { dbError } from "@/lib/db-errors";
import { formatCategory } from "@/lib/expense-categories";
import type { ExpenseReportRow } from "@/lib/expense-report-pdf.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { FinanceExpense } from "@/lib/finance-export";

/** Simple finance export projection; preserves existing detailed expense reports. */
export async function collectFinanceExpenses(sb: SupabaseClient<Database>, from: string | null, to: string | null): Promise<FinanceExpense[]> {
  const result: FinanceExpense[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = sb.from("expenses").select("id, spent_on, request_purpose, notes, category, txn_id, amount")
      .eq("currency", "BDT").is("deleted_at", null).order("spent_on").order("id").range(offset, offset + 999);
    if (from) query = query.gte("spent_on", from);
    if (to) query = query.lte("spent_on", to);
    const { data, error } = await query;
    if (error) throw dbError(error);
    for (const r of data ?? []) result.push({ date: r.spent_on, purpose: r.request_purpose?.trim() || r.notes?.trim() || formatCategory(r.category), transactionId: r.txn_id ?? "", amount: Number(r.amount) });
    if ((data?.length ?? 0) < 1000) break;
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type ExpenseExportInput = {
  from: string; to: string; currency: "BDT" | "USD";
  categories: string[]; invoiceId: string | null; paymentMethod: string | null;
  vendor: string | null; department: string | null; createdBy: string | null;
  minAmount: number | null; maxAmount: number | null; search: string; status: string | null;
  format: "pdf" | "xlsx" | "csv"; periodLabel: string; filterLabels: string[]; fileBase: string;
};

type Exp = {
  id: string; category: string; amount: number; currency: "BDT" | "USD"; spent_on: string;
  vendor: string | null; notes: string | null; voucher_no: string | null; txn_id: string | null;
  payment_method: string | null; department: string | null; requested_by: string | null;
  paid_by: string | null; created_by: string | null; linked_invoice_id: string | null;
  request_purpose: string | null; fund_id: string | null; receipt_url: string | null;
  share_enabled: boolean; share_token: string | null; signed_voucher_url: string | null;
  signed_voucher_by: string | null; signed_voucher_at: string | null; created_at: string;
};

const n = (s: string | null | undefined) => (s ?? "").toString().trim();
const PUBLIC_ORIGIN = "https://console.brantatech.com";

async function fetchAll<T>(make: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let off = 0; off < 100_000; off += 1000) {
    const { data, error } = await make(off, off + 999);
    if (error) throw dbError(error);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await run(ids.slice(i, i + 200));
    out.push(...(data ?? []));
  }
  return out;
}

export type DetailedExpense = ExpenseReportRow & {
  categoryKey: string; notes: string; createdBy: string; createdAt: string; sealedAt: string;
  itemList: { name: string; quantity: number; unit: string | null; unit_price: number; amount: number }[];
};

export async function collectExpenses(sb: Sb, f: ExpenseExportInput): Promise<DetailedExpense[]> {
  const rows = await fetchAll<Exp>((a, b) => {
    let q = sb.from("expenses")
      .select("id, category, amount, currency, spent_on, vendor, notes, voucher_no, txn_id, payment_method, department, requested_by, paid_by, created_by, linked_invoice_id, request_purpose, fund_id, receipt_url, share_enabled, share_token, signed_voucher_url, signed_voucher_by, signed_voucher_at, created_at")
      .eq("currency", f.currency).is("deleted_at", null)
      .gte("spent_on", f.from).lte("spent_on", f.to)
      .order("spent_on", { ascending: false }).range(a, b);
    if (f.categories.length) q = q.in("category", f.categories);
    if (f.invoiceId) q = q.eq("linked_invoice_id", f.invoiceId);
    if (f.department) q = q.eq("department", f.department);
    if (f.vendor) q = q.ilike("vendor", `%${f.vendor}%`);
    if (f.createdBy) q = q.or(`created_by.eq.${f.createdBy},requested_by.eq.${f.createdBy},paid_by.eq.${f.createdBy}`);
    return q;
  });

  const ids = rows.map((r) => r.id);
  const uids = Array.from(new Set(rows.flatMap((r) => [r.created_by, r.requested_by, r.paid_by, r.signed_voucher_by]).filter(Boolean))) as string[];
  const invIds = Array.from(new Set(rows.map((r) => r.linked_invoice_id).filter(Boolean))) as string[];
  const fundIds = Array.from(new Set(rows.map((r) => r.fund_id).filter(Boolean))) as string[];

  const [items, profs, invs, funds] = await Promise.all([
    inChunks<{ expense_id: string; name: string; quantity: number; unit: string | null; unit_price: number; amount: number; sequence: number }>(ids, (c) =>
      sb.from("expense_items").select("expense_id, name, quantity, unit, unit_price, amount, sequence").in("expense_id", c).order("sequence")),
    inChunks<{ user_id: string; full_name: string | null }>(uids, (c) => sb.from("profiles").select("user_id, full_name").in("user_id", c)),
    inChunks<{ id: string; slug: string | null; title: string }>(invIds, (c) => sb.from("invoices").select("id, slug, title").in("id", c)),
    inChunks<{ id: string; name: string; code: string | null }>(fundIds, (c) => sb.from("finance_funds").select("id, name, code").in("id", c)),
  ]);
  const nameOf = new Map(profs.map((p) => [p.user_id, n(p.full_name)]));
  const invOf = new Map(invs.map((i) => [i.id, `${i.slug ? `${i.slug} | ` : ""}${i.title}`]));
  const fundOf = new Map(funds.map((x) => [x.id, n(x.name)]));
  const itemsOf = new Map<string, typeof items>();
  items.forEach((it) => itemsOf.set(it.expense_id, [...(itemsOf.get(it.expense_id) ?? []), it]));
  const who = (id: string | null) => (id ? nameOf.get(id) || "" : "");

  const out: DetailedExpense[] = rows.map((r) => {
    const its = itemsOf.get(r.id) ?? [];
    const sealed = !!r.signed_voucher_url;
    return {
      date: r.spent_on,
      voucher: n(r.voucher_no) || "—",
      categoryKey: r.category,
      category: formatCategory(r.category),
      vendor: n(r.vendor),
      department: n(r.department),
      requestedBy: who(r.requested_by),
      paidBy: who(r.paid_by),
      approvedBy: sealed ? who(r.signed_voucher_by) : "",
      fund: r.fund_id ? fundOf.get(r.fund_id) || "" : "",
      project: r.linked_invoice_id ? invOf.get(r.linked_invoice_id) || "" : "",
      purpose: n(r.request_purpose),
      items: its.map((i) => `${i.name}${Number(i.quantity) !== 1 ? ` x${Number(i.quantity)}` : ""}`).join(", "),
      itemList: its.map((i) => ({ name: i.name, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.unit_price), amount: Number(i.amount) })),
      method: n(r.payment_method),
      txnId: n(r.txn_id),
      sealed,
      publicUrl: n(r.voucher_no) ? `${PUBLIC_ORIGIN}/x/${encodeURIComponent(n(r.voucher_no))}` : null,
      receiptUrl: /^https?:\/\//i.test(n(r.receipt_url)) ? n(r.receipt_url) : null,
      amount: Number(r.amount),
      notes: n(r.notes),
      createdBy: who(r.created_by),
      createdAt: (r.created_at ?? "").slice(0, 10),
      sealedAt: (r.signed_voucher_at ?? "").slice(0, 10),
    };
  });

  const q = f.search.trim().toLowerCase();
  return out.filter((r) => {
    if (f.status && (r.txnId ? "paid" : "recorded") !== f.status.toLowerCase()) return false;
    if (f.minAmount != null && Math.abs(r.amount) < f.minAmount) return false;
    if (f.maxAmount != null && Math.abs(r.amount) > f.maxAmount) return false;
    if (f.paymentMethod && r.method.toLowerCase() !== f.paymentMethod.toLowerCase()) return false;
    if (q) {
      const hay = [r.voucher, r.vendor, r.department, r.category, r.purpose, r.items, r.notes, r.method, r.txnId, r.requestedBy, r.paidBy, String(r.amount)].join(" ").toLowerCase();
      if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)) as unknown as number[]);
  }
  return btoa(bin);
}

export async function exportExpenseReport(sb: Sb, userId: string, f: ExpenseExportInput) {
  const rows = await collectExpenses(sb, f);
  const { buildExpenseReportPdf, groupByCategory, moneyFmt } = await import("@/lib/expense-report-pdf.server");
  const cur = f.currency;
  const money = (x: number) => moneyFmt(x, cur);
  const generatedAt = new Date(Date.now() + 6 * 3600_000).toISOString().replace("T", " ").slice(0, 16) + " (GMT+6)";
  const period = f.periodLabel || `${f.from} to ${f.to}`;
  const filename = `${f.fileBase}.${f.format}`;
  const groups = groupByCategory(rows);
  const grand = groups.reduce((s, g) => s + g.total, 0);

  if (f.format === "pdf") {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { deviceFromUserAgent } = await import("@/lib/brand/pdf-brand.server");
    const { data: me } = await sb.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
    const bytes = await buildExpenseReportPdf({
      periodLabel: period, generatedAt, currency: cur, filters: f.filterLabels, rows,
      generatedBy: { name: (me as { full_name?: string | null } | null)?.full_name ?? null, device: deviceFromUserAgent(getRequestHeader("user-agent") ?? null) },
    });
    return { filename, mime: "application/pdf", base64: toBase64(bytes), count: rows.length };
  }

  const preamble = [
    `Expense Report — ${period}`, `Currency: ${cur}`, `Generated: ${generatedAt}`,
    f.filterLabels.length ? `Filters: ${f.filterLabels.join(" | ")}` : "Filters: none",
    `Total expense: ${money(grand)} | Vouchers: ${rows.length} | Categories: ${groups.length}`,
  ];
  const detailHeaders = [
    "#", "Date", "Voucher", "Category", "Vendor / Payee", "Department", "Requested by", "Paid by",
    "Approved (sealed) by", "Sealed on", "Paying fund", "Linked project", "Purpose", "Line items",
    "Payment method", "Transaction ID", "Seal status", "Notes", "Created by", "Public link", "Receipt URL", `Amount (${cur})`,
  ];
  const detail = groups.flatMap((g) => g.rows).map((r0, i) => {
    const r = r0 as DetailedExpense;
    return [
      i + 1, r.date, r.voucher, r.category, r.vendor, r.department, r.requestedBy, r.paidBy,
      r.approvedBy, r.sealedAt, r.fund, r.project, r.purpose, r.items, r.method, r.txnId,
      r.sealed ? "Sealed" : "Unsealed", r.notes, r.createdBy, r.publicUrl ?? "", r.receiptUrl ?? "", Math.abs(r.amount),
    ];
  });

  if (f.format === "csv") {
    const { buildCsv } = await import("@/lib/xlsx.server");
    const bytes = new TextEncoder().encode(buildCsv(detailHeaders, detail, preamble));
    return { filename, mime: "text/csv;charset=utf-8", base64: toBase64(bytes), count: rows.length };
  }

  const { buildXlsx } = await import("@/lib/xlsx.server");
  const w = [6, 12, 15, 16, 24, 16, 20, 20, 20, 12, 18, 28, 32, 40, 14, 18, 11, 32, 18, 50, 40, 16];
  const bytes = buildXlsx([
    {
      name: "Summary",
      preamble,
      columns: [
        { header: "Category", width: 24 }, { header: "Vouchers", width: 10, type: "number" },
        { header: `Amount (${cur})`, width: 18, type: "number" }, { header: "Share %", width: 10, type: "number" },
        { header: `Average (${cur})`, width: 16, type: "number" },
      ],
      rows: groups.map((g) => [g.category, g.rows.length, g.total, grand ? Math.round((g.total / grand) * 1000) / 10 : 0, g.rows.length ? Math.round((g.total / g.rows.length) * 100) / 100 : 0]),
      totals: ["Grand total", rows.length, grand, grand ? 100 : 0, rows.length ? Math.round((grand / rows.length) * 100) / 100 : 0],
    },
    {
      name: "By Category",
      preamble: [`Expense Report — ${period}`, "Grouped by category with subtotals"],
      columns: [
        { header: "Category", width: 20 }, { header: "Date", width: 12, type: "date" }, { header: "Voucher", width: 15 },
        { header: "Vendor / Payee", width: 26 }, { header: "Purpose", width: 34 }, { header: `Amount (${cur})`, width: 16, type: "number" },
      ],
      rows: groups.flatMap((g) => [
        ...g.rows.map((r) => [g.category, r.date, r.voucher, r.vendor, r.purpose || r.items, Math.abs(r.amount)]),
        [`Subtotal — ${g.category}`, "", "", "", `${g.rows.length} vouchers`, g.total],
        ["", "", "", "", "", ""],
      ]),
      totals: ["GRAND TOTAL", "", "", "", `${rows.length} vouchers`, grand],
    },
    {
      name: "Detailed Expenses",
      preamble,
      columns: detailHeaders.map((h, i) => ({ header: h, width: w[i], type: i === 1 ? "date" as const : i === detailHeaders.length - 1 ? "number" as const : "text" as const })),
      rows: detail,
      totals: [...Array(detailHeaders.length - 2).fill(""), "Total", grand],
    },
    {
      name: "Line Items",
      preamble: [`Expense line items — ${period}`],
      columns: [
        { header: "Voucher", width: 15 }, { header: "Date", width: 12, type: "date" }, { header: "Category", width: 18 },
        { header: "Item", width: 34 }, { header: "Qty", width: 8, type: "number" }, { header: "Unit", width: 10 },
        { header: "Unit price", width: 14, type: "number" }, { header: `Amount (${cur})`, width: 16, type: "number" },
      ],
      rows: rows.flatMap((r) => r.itemList.map((it) => [r.voucher, r.date, r.category, it.name, it.quantity, it.unit ?? "", it.unit_price, it.amount])),
    },
  ]);
  return { filename, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: toBase64(bytes), count: rows.length };
}
