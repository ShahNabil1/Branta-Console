import { Loader2 } from "lucide-react";
import { Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany, useCompanies } from "@/components/company/company-switcher";
import { getMyPermissions } from "@/lib/permissions.functions";
import { canSeeMyCompany } from "@/lib/my-company-access";
import { CompanyProfile } from "./company-profile-page";

/** My Company: the profile of the company whose workspace is open, for Group Admins and its non-Executive staff. */
export function MyCompanyPage({ slug }: { slug?: string }) {
  const q = useCompanies();
  const { active } = useActiveCompany();
  const permsFn = useServerFn(getMyPermissions);
  const permsQ = useQuery({ queryKey: ["my-permissions"], queryFn: () => permsFn(), staleTime: 60_000 });
  const holding = (q.data ?? []).find((c) => c.is_holding);
  const target = slug ?? holding?.slug ?? active?.slug;
  const loading = q.isLoading || !target || (Boolean(slug) && permsQ.isLoading);
  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  // Switching company while on My Company keeps this page; anyone not allowed here lands on that company's overview.
  const company = slug ? (q.data ?? []).find((c) => c.slug === slug) : null;
  if (company && permsQ.data && !canSeeMyCompany(permsQ.data, company as { is_holding: boolean; myRole?: string | null })) {
    return <Navigate to={`/app/org/${slug}` as never} replace />;
  }
  return <CompanyProfile slug={target} mine />;
}
