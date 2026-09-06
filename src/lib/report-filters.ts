// Shared filter model for the Finance report screens (dashboard, income, expense).
// Client-safe: pure types + date helpers, no server imports.

export type ReportCurrency = "BDT" | "USD";
export type TxnType = "all" | "income" | "expense";

export type DatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "week"
  | "month"
  | "last_month"
  | "year"
  | "all"
  | "custom";

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom range" },
];

export const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Resolve a quick preset into an inclusive [from, to] ISO date range. */
export function rangeForPreset(preset: DatePreset, custom?: { from: string; to: string }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (preset) {
    case "today":
      return { from: iso(now), to: iso(now) };
    case "yesterday": {
      const yd = new Date(y, m, d - 1);
      return { from: iso(yd), to: iso(yd) };
    }
    case "last7":
      return { from: iso(new Date(y, m, d - 6)), to: iso(now) };
    case "last30":
      return { from: iso(new Date(y, m, d - 29)), to: iso(now) };
    case "week": {
      // Week starts Saturday (Bangladesh business week).
      const dow = now.getDay(); // 0 Sun .. 6 Sat
      const back = (dow + 1) % 7;
      return { from: iso(new Date(y, m, d - back)), to: iso(now) };
    }
    case "month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "year":
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case "custom":
      return {
        from: custom?.from || iso(new Date(y, m, 1)),
        to: custom?.to || iso(now),
      };
    case "all":
    default:
      return { from: "2000-01-01", to: iso(new Date(y + 5, 11, 31)) };
  }
}

export type ReportFilters = {
  preset: DatePreset;
  from: string;
  to: string;
  currency: ReportCurrency;
  type: TxnType;
  categories: string[];
  /** customer id (income) */
  clientId: string | null;
  /** invoice id — "project" */
  invoiceId: string | null;
  paymentMethod: string | null;
  status: string | null;
  vendor: string | null;
  department: string | null;
  createdBy: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  search: string;
};

export function defaultFilters(type: TxnType = "all"): ReportFilters {
  const r = rangeForPreset("month");
  return {
    preset: "month",
    from: r.from,
    to: r.to,
    currency: "BDT",
    type,
    categories: [],
    clientId: null,
    invoiceId: null,
    paymentMethod: null,
    status: null,
    vendor: null,
    department: null,
    createdBy: null,
    minAmount: null,
    maxAmount: null,
    search: "",
  };
}

/** Human-readable chips for the currently applied (non-default) filters. */
export function activeFilterChips(
  f: ReportFilters,
  labels: {
    client?: string | null;
    invoice?: string | null;
    createdBy?: string | null;
  } = {},
): { key: keyof ReportFilters | "date"; label: string }[] {
  const chips: { key: keyof ReportFilters | "date"; label: string }[] = [];
  const presetLabel = DATE_PRESETS.find((p) => p.key === f.preset)?.label ?? "Range";
  if (f.preset !== "all") {
    chips.push({
      key: "date",
      label: f.preset === "custom" ? `${f.from} → ${f.to}` : presetLabel,
    });
  }
  if (f.type !== "all") chips.push({ key: "type", label: f.type === "income" ? "Income only" : "Expense only" });
  if (f.categories.length) chips.push({ key: "categories", label: `Category: ${f.categories.join(", ")}` });
  if (f.clientId) chips.push({ key: "clientId", label: `Client: ${labels.client ?? "selected"}` });
  if (f.invoiceId) chips.push({ key: "invoiceId", label: `Project: ${labels.invoice ?? "selected"}` });
  if (f.paymentMethod) chips.push({ key: "paymentMethod", label: `Method: ${f.paymentMethod}` });
  if (f.status) chips.push({ key: "status", label: `Status: ${f.status}` });
  if (f.vendor) chips.push({ key: "vendor", label: `Vendor: ${f.vendor}` });
  if (f.department) chips.push({ key: "department", label: `Dept: ${f.department}` });
  if (f.createdBy) chips.push({ key: "createdBy", label: `By: ${labels.createdBy ?? "selected"}` });
  if (f.minAmount != null) chips.push({ key: "minAmount", label: `Min ${f.minAmount}` });
  if (f.maxAmount != null) chips.push({ key: "maxAmount", label: `Max ${f.maxAmount}` });
  if (f.search.trim()) chips.push({ key: "search", label: `“${f.search.trim()}”` });
  return chips;
}

export function clearFilterKey(f: ReportFilters, key: keyof ReportFilters | "date"): ReportFilters {
  const base = { ...f };
  switch (key) {
    case "date": {
      const r = rangeForPreset("all");
      return { ...base, preset: "all", from: r.from, to: r.to };
    }
    case "type":
      return { ...base, type: "all" };
    case "categories":
      return { ...base, categories: [] };
    case "minAmount":
      return { ...base, minAmount: null };
    case "maxAmount":
      return { ...base, maxAmount: null };
    case "search":
      return { ...base, search: "" };
    default:
      return { ...base, [key]: null } as ReportFilters;
  }
}

/** Money formatting shared by tables and exports. */
export function formatMoney(n: number, cur: ReportCurrency) {
  const sym = cur === "BDT" ? "৳" : "$";
  return `${sym} ${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** finance-report-2026-09 / income-report-september-2026 style names. */
export function reportFileBase(kind: "finance" | "income" | "expense", f: ReportFilters) {
  const from = new Date(`${f.from}T00:00:00`);
  const to = new Date(`${f.to}T00:00:00`);
  const sameMonth =
    from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  if (f.preset === "all") return `${kind}-report-all-time`;
  if (sameMonth) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${kind}-report-${from.getFullYear()}-${p(from.getMonth() + 1)}`;
  }
  return `${kind}-report-${f.from}_to_${f.to}`;
}
