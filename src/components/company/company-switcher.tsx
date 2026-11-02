import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listCompanies } from "@/lib/companies.functions";
import { setActiveCompanySlug, useActiveCompanySlug } from "@/lib/active-company";
import { CompanyAvatar } from "./company-avatar";
import { cn } from "@/lib/utils";

export function useCompanies() {
  const fn = useServerFn(listCompanies);
  return useQuery({ queryKey: ["companies"], queryFn: () => fn(), staleTime: 60_000 });
}

/** Resolves the active company (falls back to the holding company). */
export function useActiveCompany() {
  const q = useCompanies();
  const slug = useActiveCompanySlug();
  const list = q.data ?? [];
  const active = list.find((c) => c.slug === slug) ?? list.find((c) => c.is_holding) ?? list[0] ?? null;
  return { active, list, isLoading: q.isLoading };
}

export function CompanySwitcher({ collapsed, canManage }: { collapsed: boolean; canManage: boolean }) {
  const { active, list } = useActiveCompany();
  const slug = useActiveCompanySlug();
  useEffect(() => {
    if (active && slug && slug !== active.slug) setActiveCompanySlug(active.slug);
  }, [active, slug]);
  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex w-full items-center gap-2 rounded-md border border-border bg-card p-1.5 text-left shadow-sm transition-all hover:-translate-y-px hover:border-brand/40 hover:shadow-md active:translate-y-0 active:scale-[0.99]",
            collapsed && "md:justify-center md:border-transparent md:shadow-none",
          )}
        >
          <CompanyAvatar name={active.name} slug={active.slug} className="size-7" />
          <span className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
            <span className="block truncate text-[12.5px] font-bold">{active.name}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {active.is_holding ? "Group · Holding" : "Company"}
            </span>
          </span>
          <ChevronsUpDown className={cn("size-3.5 text-muted-foreground transition-transform group-hover:text-brand group-data-[state=open]:rotate-180", collapsed && "md:hidden")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1.5">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Switch company
        </DropdownMenuLabel>
        {list.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => setActiveCompanySlug(c.slug)}
            className="gap-2.5 rounded-md py-2 transition-colors"
          >
            <CompanyAvatar name={c.name} slug={c.slug} className="size-7" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold">{c.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{c.email}</span>
            </span>
            {c.id === active.id && <Check className="size-4 text-brand animate-in zoom-in-50" />}
          </DropdownMenuItem>
        ))}
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 rounded-md py-2 font-semibold text-brand">
              <Link to="/app/companies" search={{ create: true }}>
                <Plus className="size-4" /> Create company
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
