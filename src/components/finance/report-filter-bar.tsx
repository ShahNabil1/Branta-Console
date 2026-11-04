import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Filter, RotateCcw, Search, X, ChevronDown, SlidersHorizontal, CalendarRange } from "lucide-react";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
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
import { EXPENSE_CATEGORY_KEYS, formatCategory } from "@/lib/expense-categories";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

const EXPENSE_CATEGORIES: string[] = [...EXPENSE_CATEGORY_KEYS];
const INCOME_CATEGORIES = ["Invoice payment", "seed", "other income", "adjustment"];

const selectCls =
  "h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-card bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pl-2.5 pr-8 text-[12.5px] font-medium text-foreground shadow-sm outline-none transition-all duration-150 hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]";
const amountCls =
  "h-9 rounded-md font-mono text-[12.5px] shadow-sm transition-all hover:border-foreground/25 focus-visible:border-brand focus-visible:ring-0 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]";
const dateCls =
  "h-8 rounded-md border border-border bg-card px-2 text-[12px] text-foreground outline-none transition-all focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]";

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
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || t?.closest("input,textarea,select,[contenteditable=true]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftRange, setDraftRange] = useState({ from: filters.from, to: filters.to });

  const openCustom = () => {
    setDraftRange({ from: filters.from, to: filters.to });
    setCustomOpen(true);
  };
  const applyCustom = () => {
    if (!draftRange.from || !draftRange.to) return;
    set({ preset: "custom", from: draftRange.from, to: draftRange.to });
    setCustomOpen(false);
  };

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


  // Date state already shows in the preset row, so no date chips; on
  // income/expense pages the type is locked, so its chip is noise too.
  const chips = activeFilterChips(filters, {
    client: clientLabel,
    invoice: invoiceLabel,
    createdBy: createdByLabel,
  }).filter((c) => c.key !== "date" && !(kind !== "finance" && c.key === "type"));

  const advCount = chips.filter((c) => c.key !== "search" && c.key !== "currency").length;

  const categories = kind === "income" ? INCOME_CATEGORIES : kind === "expense" ? EXPENSE_CATEGORIES : [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {/* Row 1 — quick dates, currency, search */}
      <div className="flex flex-col gap-2 border-b border-border px-2.5 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverAnchor asChild>
            <div className="min-w-0">
              <UnderlineTabs
                size="sm"
                ariaLabel="Date range"
                value={filters.preset}
                onChange={(id) => (id === "custom" ? openCustom() : setPreset(id))}
                items={DATE_PRESETS.map((p) => ({
                  id: p.key,
                  icon: p.key === "custom" ? CalendarRange : undefined,
                  label: p.key === "custom" && filters.preset === "custom" ? `${filters.from} → ${filters.to}` : p.label,
                }))}
              />
            </div>
          </PopoverAnchor>
          <PopoverContent align="end" className="w-auto rounded-lg p-3 shadow-xl">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Custom range</div>
            <div className="flex items-center gap-1.5">
              <input type="date" aria-label="From date" className={dateCls} value={draftRange.from}
                onChange={(e) => setDraftRange((d) => ({ ...d, from: e.target.value }))} />
              <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">→</span>
              <input type="date" aria-label="To date" className={dateCls} value={draftRange.to}
                onChange={(e) => setDraftRange((d) => ({ ...d, to: e.target.value }))} />
            </div>
            <Button size="sm" className="mt-2.5 h-8 w-full rounded-md text-[12px] font-semibold"
              disabled={!draftRange.from || !draftRange.to} onClick={applyCustom}>
              Apply range
            </Button>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2 pb-2 sm:ml-auto sm:pb-1">
          {/* Currency — sliding segmented pill */}
          <div role="radiogroup" aria-label="Currency"
            className="relative inline-grid shrink-0 grid-cols-2 rounded-full border border-border bg-muted/60 p-0.5 shadow-inner">
            <span aria-hidden
              className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-foreground shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{ transform: filters.currency === "USD" ? "translateX(100%)" : "translateX(0)" }} />
            {(["BDT", "USD"] as ReportCurrency[]).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={filters.currency === c}
                onClick={() => set({ currency: c })}
                className={`relative z-10 min-w-[44px] rounded-full px-2.5 py-1 font-mono text-[11px] font-bold tracking-wide transition-colors duration-200 active:scale-95 ${
                  filters.currency === c ? "text-background" : "text-muted-foreground hover:text-foreground"
                }`}>
                {c === "BDT" ? "৳ BDT" : "$ USD"}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="group relative min-w-0 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-brand" />
            <input
              ref={searchRef}
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape") set({ search: "" }); }}
              placeholder="Search vendor, note, code…"
              aria-label="Search"
              className="h-8 w-full rounded-full border border-border bg-muted/40 pl-8 pr-14 text-[12px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/80 hover:border-foreground/20 focus:border-brand focus:bg-card focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] sm:w-64"
            />
            {filters.search ? (
              <button type="button" aria-label="Clear search" onClick={() => { set({ search: "" }); searchRef.current?.focus(); }}
                className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-muted text-muted-foreground transition-all hover:rotate-90 hover:bg-foreground hover:text-background animate-in zoom-in-50">
                <X className="size-3" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-card px-1.5 font-mono text-[10px] text-muted-foreground group-focus-within:opacity-0">/</kbd>
            )}
          </div>

          {/* Filters toggle */}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className={`group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold transition-all duration-200 active:scale-95 ${
              open || advCount > 0
                ? "border-foreground bg-foreground text-background shadow-md"
                : "border-border bg-card text-foreground hover:border-foreground/30 hover:shadow-sm"
            }`}>
            <SlidersHorizontal className="size-3.5 transition-transform duration-300 group-hover:rotate-12" />
            Filters
            {advCount > 0 && (
              <span className="grid min-w-4 place-items-center rounded-full bg-brand px-1 font-mono text-[10px] text-white animate-in zoom-in-50">{advCount}</span>
            )}
            <ChevronDown className={`size-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Row 2 — advanced facets */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {kind === "finance" && (
            <label className="space-y-1">
              <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Transaction type</span>
              <select className={selectCls} value={filters.type}
                onChange={(e) => set({ type: e.target.value as ReportFilters["type"] })}>
                <option value="all">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
          )}

          <label className="space-y-1">
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Category</span>
            <select className={selectCls} value={filters.categories[0] ?? ""}
              onChange={(e) => set({ categories: e.target.value ? [e.target.value] : [] })}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{formatCategory(c)}</option>
              ))}
            </select>
          </label>

          {kind !== "expense" && (
            <label className="space-y-1">
              <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Client</span>
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
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Project (invoice)</span>
            <select className={selectCls} value={filters.invoiceId ?? ""}
              onChange={(e) => set({ invoiceId: e.target.value || null })}>
              <option value="">All projects</option>
              {(facets.data?.invoices ?? []).map((i) => (
                <option key={i.id} value={i.id}>{i.slug ? `${i.slug} · ` : ""}{i.title}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Payment method</span>
            <select className={selectCls} value={filters.paymentMethod ?? ""}
              onChange={(e) => set({ paymentMethod: e.target.value || null })}>
              <option value="">Any method</option>
              {(facets.data?.methods ?? []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Payment status</span>
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
                <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Vendor / payee</span>
                <select className={selectCls} value={filters.vendor ?? ""}
                  onChange={(e) => set({ vendor: e.target.value || null })}>
                  <option value="">All vendors</option>
                  {(facets.data?.vendors ?? []).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Department</span>
                <select className={selectCls} value={filters.department ?? ""}
                  onChange={(e) => set({ department: e.target.value || null })}>
                  <option value="">All departments</option>
                  {(facets.data?.departments ?? []).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Created / requested by</span>
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
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Min amount</span>
            <Input type="number" inputMode="decimal" placeholder="0" className={amountCls}
              value={filters.minAmount ?? ""}
              onChange={(e) => set({ minAmount: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
          <label className="space-y-1">
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Max amount</span>
            <Input type="number" inputMode="decimal" placeholder="0" className={amountCls}
              value={filters.maxAmount ?? ""}
              onChange={(e) => set({ maxAmount: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
        </div>
        </div>
      </div>

      {/* Row 3 — active chips */}
      <div className="flex flex-wrap items-center gap-1.5 p-2.5">
        {chips.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Filter className="size-3" /> No filters applied</span>
        ) : (
          chips.map((c) => (
            <button
              key={`${c.key}-${c.label}`}
              onClick={() => onChange(clearFilterKey(filters, c.key))}
              className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-[11.5px] font-semibold text-foreground shadow-sm transition-all animate-in fade-in zoom-in-95 hover:border-rose-300 hover:text-rose-700 active:scale-95"
            >
              {c.label}
              <span className="grid size-4 place-items-center rounded-full bg-muted transition-colors group-hover:bg-rose-600 group-hover:text-white"><X className="size-2.5" /></span>
            </button>
          ))
        )}
        {chips.length > 0 && (
          <button
            onClick={() => onChange({ ...defaultFilters(kind === "finance" ? "all" : kind), currency: filters.currency })}
            className="group ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold text-brand transition-colors hover:bg-brand/10"
          >
            <RotateCcw className="size-3 transition-transform duration-300 group-hover:-rotate-180" /> Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
