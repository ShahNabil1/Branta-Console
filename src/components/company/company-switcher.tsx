import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { orgFromPath, toCompanyPath } from "@/lib/org-path";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listCompanies } from "@/lib/companies.functions";
import { setActiveCompanySlug, useActiveCompanySlug } from "@/lib/active-company";
import { CompanyAvatar } from "./company-avatar";
import { cn } from "@/lib/utils";
import { companyIdentity } from "@/lib/company-identity";
import { Button } from "@/components/ui/button";

export function useCompanies() {
  const fn = useServerFn(listCompanies);
  return useQuery({ queryKey: ["companies"], queryFn: () => fn(), staleTime: 60_000 });
}

/** The URL decides the company: /app/org/<slug>/... = that sister, plain /app/... = the holding
 * (sister-only staff fall back to their remembered/first company). */
export function useActiveCompany() {
  const q = useCompanies();
  const stored = useActiveCompanySlug();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const list = q.data ?? [];
  const org = orgFromPath(pathname);
  const holding = list.find((c) => c.is_holding);
  // Personal pages (profile, wallet, security) belong to no company: keep the current workspace.
  const personal = /^\/app\/(profile(\/|$)|employees\/[^/]+)/.test(pathname);
  const current = personal ? list.find((c) => c.slug === stored) : undefined;
  const active = (org ? list.find((c) => c.slug === org) : current ?? holding)
    ?? list.find((c) => c.slug === stored) ?? list[0] ?? null;
  return { active, list, isLoading: q.isLoading };
}

export function CompanySwitcher({ collapsed, canManage, holdingLogoUrl }: { collapsed: boolean; canManage: boolean; holdingLogoUrl?: string }) {
  const { active, list } = useActiveCompany();
  const slug = useActiveCompanySlug();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (active && slug !== active.slug) setActiveCompanySlug(active.slug);
  }, [active, slug]);
  if (!active) return null;
  const identity = companyIdentity(active.slug, active);
  const logo = identity.logo || (active.is_holding ? holdingLogoUrl : undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost"
          type="button"
          aria-label={`Switch company (current: ${active.name})`}
          className={cn(
            "group flex h-auto w-full justify-start items-center gap-2 rounded-md px-1.5 py-1 text-left transition-all hover:bg-muted active:scale-[0.99]",
            collapsed && "md:justify-center md:px-0",
          )}
        >
          <span className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
            {logo ? (
              <span className="block w-fit max-w-full rounded-sm bg-[var(--company-artwork-paper)] p-1"><img src={logo} alt={active.name} className="h-8 w-auto max-w-[170px] object-contain" /></span>
            ) : (
              <span className="flex items-center gap-2">
                <CompanyAvatar name={active.name} slug={active.slug} className="size-6" />
                <span className="truncate text-[13px] font-bold">{active.name}</span>
              </span>
            )}
          </span>
          {collapsed && (
            <span className="hidden md:block">
              <CompanyAvatar name={active.name} slug={active.slug} iconUrl={identity.icon} className="size-7" />
            </span>
          )}
          <ChevronsUpDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:text-brand group-data-[state=open]:rotate-180", collapsed && "md:hidden")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1.5">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Switch company
        </DropdownMenuLabel>
        {list.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => { setActiveCompanySlug(c.slug); navigate({ href: toCompanyPath(pathname, c.slug, c.is_holding) }); }}
            className="gap-2.5 rounded-md py-2 transition-colors"
          >
            <CompanyAvatar name={c.name} slug={c.slug} iconUrl={companyIdentity(c.slug, c).icon} className="size-7" />
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
