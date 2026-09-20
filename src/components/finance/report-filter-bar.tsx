import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Filter, RotateCcw, Search, X, ChevronDown } from "lucide-react";
import { getReportFacets } from "@/lib/finance-reports.functions";
import {
  DATE_PRESETS,
  activeFilterChips,
  clearFilterKey,
  defaultFilters,
  rangeForPreset,
  type DatePreset,
  type ReportFilters,
  type ReportCurrency,
} from "@/lib/report-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EXPENSE_CATEGORIES = ["salary", "tools", "ads", "office", "misc", "tax", "refund"];
const INCOME_CATEGORIES = ["Invoice payment", "seed", "other income", "adjustment"];

const selectCls =
  "h-8 w-full rounded-sm border border-border bg-card px-2 text-[12px] text-foreground outline-none focus:border-brand";

export function ReportFilterBar({
  filters,
  onChange,
  kind,
  onFacets,
}: {
  filters: ReportFilters;
  onChange: (f: ReportFilters) => void;
  kind: "finance" | "income" | "expense";
  onFacets?: (labels: { client?: string | null; invoice?: string | null; createdBy?: string | null }) => void;
}) {
  const facetsFn = useServerFn(getReportFacets);
  const facets = useQuery({
    queryKey: ["report-facets"],
    queryFn: () => facetsFn(),
    staleTime: 5 * 60_000,
  });
  const [open, setOpen] = useState(false);

  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });

  const setPreset = (p: DatePreset) => {
    const r = rangeForPreset(p, { from: filters.from, to: filters.to });
    set({ preset: p, from: r.from, to: r.to });
  };

  const clientLabel =
    facets.data?.customers.find((c) => c.id === filters.clientId)?.name ?? null;
  const invoiceLabel = (() => {
    const inv = facets.data?.invoices.find((i) => i.id === filters.invoiceId);
    return inv ? `${inv.slug ?? ""} ${inv.title}`.trim() : null;
  })();
  const createdByLabel =
    facets.data?.people.find((p) => p.user_id === filters.createdBy)?.full_name ?? null;

  useEffect(() => {
    onFacets?.({ client: clientLabel, invoice: invoiceLabel, createdBy: createdByLabel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientLabel, invoiceLabel, createdByLabel]);


  const chips = activeFilterChips(filters, {
    client: clientLabel,
    invoice: invoiceLabel,
    createdBy: createdByLabel,
  });

  const categories = kind === "income" ? INCOME_CATEGORIES : kind === "expense" ? EXPENSE_CATEGORIES : [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Row 1 — quick dates, currency, search */}
      <div className="flex flex-col gap-2 border-b border-border p-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="-mx-0.5 flex items-center gap-1 overflow-x-auto px-0.5 pb-0.5 sm:flex-wrap sm:overflow-visible">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`shrink-0 rounded-[3px] px-2 py-1 text-[11.5px] font-medium transition-colors ${
                filters.preset === p.key
                  ? "bg-brand text-white"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
          {filters.preset === "custom" && (
            <div className="flex shrink-0 items-center gap-1">
              <input
                type="date"
                aria-label="From date"
                className="h-[26px] rounded-[3px] border border-border bg-card px-1.5 text-[11.5px] text-foreground outline-none focus:border-brand"
                value={filters.from}
                onChange={(e) => set({ from: e.target.value })}
              />
              <span className="text-[11px] text-muted-foreground">→</span>
              <input
                type="date"
                aria-label="To date"
                className="h-[26px] rounded-[3px] border border-border bg-card px-1.5 text-[11.5px] text-foreground outline-none focus:border-brand"
                value={filters.to}
                onChange={(e) => set({ to: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="inline-flex shrink-0 items-center rounded-sm border border-border p-0.5">
            {(["BDT", "USD"] as ReportCurrency[]).map((c) => (
              <button
                key={c}
                onClick={() => set({ currency: c })}
                className={`rounded-[3px] px-2 py-0.5 text-[11.5px] font-semibold ${
                  filters.currency === c ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Search…"
              className="h-8 w-full rounded-sm pl-7 text-[12px] sm:w-56"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-sm text-[12px]"
            onClick={() => setOpen((v) => !v)}
          >
            <Filter className="mr-1.5 size-3.5" /> Filters
            <ChevronDown className={`ml-1 size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>


      {/* Row 2 — advanced facets */}
      {open && (
        <div className="grid grid-cols-1 gap-2.5 border-b border-border p-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {kind === "finance" && (
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Transaction type</span>
              <select className={selectCls} value={filters.type}
                onChange={(e) => set({ type: e.target.value as ReportFilters["type"] })}>
                <option value="all">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
          )}

          <label className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Category</span>
            <select className={selectCls} value={filters.categories[0] ?? ""}
              onChange={(e) => set({ categories: e.target.value ? [e.target.value] : [] })}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          {kind !== "expense" && (
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Client</span>
              <select className={selectCls} value={filters.clientId ?? ""}
                onChange={(e) => set({ clientId: e.target.value || null })}>
                <option value="">All clients</option>
                {(facets.data?.customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.customer_code} · {c.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Project (invoice)</span>
            <select className={selectCls} value={filters.invoiceId ?? ""}
              onChange={(e) => set({ invoiceId: e.target.value || null })}>
              <option value="">All projects</option>
              {(facets.data?.invoices ?? []).map((i) => (
                <option key={i.id} value={i.id}>{i.slug ? `${i.slug} · ` : ""}{i.title}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Payment method</span>
            <select className={selectCls} value={filters.paymentMethod ?? ""}
              onChange={(e) => set({ paymentMethod: e.target.value || null })}>
              <option value="">Any method</option>
              {(facets.data?.methods ?? []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Payment status</span>
            <select className={selectCls} value={filters.status ?? ""}
              onChange={(e) => set({ status: e.target.value || null })}>
              <option value="">Any status</option>
              <option value="paid">Paid</option>
              <option value="received">Received</option>
              <option value="recorded">Recorded</option>
            </select>
          </label>

          {kind !== "income" && (
            <>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Vendor / payee</span>
                <select className={selectCls} value={filters.vendor ?? ""}
                  onChange={(e) => set({ vendor: e.target.value || null })}>
                  <option value="">All vendors</option>
                  {(facets.data?.vendors ?? []).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Department</span>
                <select className={selectCls} value={filters.department ?? ""}
                  onChange={(e) => set({ department: e.target.value || null })}>
                  <option value="">All departments</option>
                  {(facets.data?.departments ?? []).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Created / requested by</span>
                <select className={selectCls} value={filters.createdBy ?? ""}
                  onChange={(e) => set({ createdBy: e.target.value || null })}>
                  <option value="">Anyone</option>
                  {(facets.data?.people ?? []).map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name ?? p.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Min amount</span>
            <Input type="number" inputMode="decimal" className="h-8 rounded-sm text-[12px]"
              value={filters.minAmount ?? ""}
              onChange={(e) => set({ minAmount: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Max amount</span>
            <Input type="number" inputMode="decimal" className="h-8 rounded-sm text-[12px]"
              value={filters.maxAmount ?? ""}
              onChange={(e) => set({ maxAmount: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
        </div>
      )}

      {/* Row 3 — active chips */}
      <div className="flex flex-wrap items-center gap-1.5 p-2.5">
        {chips.length === 0 ? (
          <span className="text-[11.5px] text-muted-foreground">No filters applied.</span>
        ) : (
          chips.map((c) => (
            <button
              key={`${c.key}-${c.label}`}
              onClick={() => onChange(clearFilterKey(filters, c.key))}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground hover:border-brand"
            >
              {c.label}
              <X className="size-3 text-muted-foreground" />
            </button>
          ))
        )}
        {chips.length > 0 && (
          <button
            onClick={() => onChange({ ...defaultFilters(kind === "finance" ? "all" : kind), currency: filters.currency })}
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline"
          >
            <RotateCcw className="size-3" /> Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
