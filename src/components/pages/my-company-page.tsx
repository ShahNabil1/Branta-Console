import { Loader2 } from "lucide-react";
import { useActiveCompany, useCompanies } from "@/components/company/company-switcher";
import { CompanyProfile } from "./company-profile-page";

/** My Company: the profile of the company whose workspace is open, for its non-Executive staff. */
export function MyCompanyPage({ slug }: { slug?: string }) {
  const q = useCompanies();
  const { active } = useActiveCompany();
  const holding = (q.data ?? []).find((c) => c.is_holding);
  const target = slug ?? holding?.slug ?? active?.slug;
  if (q.isLoading || !target) return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  return <CompanyProfile slug={target} mine />;
}
