import { SERVICE_FALLBACK } from "@/lib/lead-options.functions";
import { useEffect, useMemo, useState } from "react";
import { useActiveCompany } from "@/components/company/company-switcher";
import { MultiSearchableSelect } from "@/components/finance/multi-searchable-select";
import { catalogOf, categoryOf, type ServiceCategory } from "@/lib/service-catalog";

/** The active company's service catalog (never another company's). */
export function useCompanyCatalog(): ServiceCategory[] {
  const { active } = useActiveCompany();
  return useMemo(() => catalogOf(active as never), [active]);
}

/** Category → services multi-select, fed by the active company's catalog. */
export function ServicePicker({ value, onChange, labelClass }: { value: string[]; onChange: (v: string[]) => void; labelClass?: string }) {
  const catalog = useCompanyCatalog();
  const [cats, setCats] = useState<string[]>(() => [...new Set(value.map((s) => categoryOf(catalog, s)).filter(Boolean) as string[])]);
  useEffect(() => {
    const need = value.map((s) => categoryOf(catalog, s)).filter((c): c is string => !!c && !cats.includes(c));
    if (need.length) setCats((p) => [...new Set([...p, ...need])]);
  }, [value, catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCategories = (next: string[]) => {
    setCats(next);
    // Drop services whose category was deselected.
    onChange(value.filter((s) => { const c = categoryOf(catalog, s); return !c || next.includes(c); }));
  };
  const svcItems = catalog.filter((g) => cats.includes(g.category))
    .flatMap((g) => g.services.map((s) => ({ value: s, label: s, group: g.category })));
  const lbl = labelClass ?? "mb-1.5 block text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70";

  if (!catalog.length) return <p className="text-[12px] text-muted-foreground">No services yet — add them in Company Profile → Services.</p>;
  return (
    <div className="grid gap-3">
      <div>
        <span className={lbl}>Category</span>
        <MultiSearchableSelect items={catalog.map((g) => ({ value: g.category, label: g.category }))} value={cats} onChange={setCategories} placeholder="— Select categories —" />
      </div>
      <div>
        <span className={lbl}>Services</span>
        <MultiSearchableSelect items={svcItems} value={value} onChange={onChange} disabled={!cats.length}
          placeholder={cats.length ? "— Select services —" : "Select a category first"} emptyText="No services in these categories" />
      </div>
    </div>
  );
}

/** A lead's chosen services; legacy single-service keys show their label. */
export function leadServicesOf(lead: { services?: string[] | null; service?: string | null }): string[] {
  if (lead.services?.length) return lead.services;
  if (!lead.service) return [];
  const legacy = SERVICE_FALLBACK.find((s) => s.key === lead.service)?.label;
  return [legacy ?? lead.service];
}
