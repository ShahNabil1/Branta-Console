import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useActiveCompany } from "./company-switcher";
import { CompanyAvatar } from "./company-avatar";
import { companyAccent, setActiveCompanySlug } from "@/lib/active-company";
import { companyIdentity } from "@/lib/company-identity";

// Group-wide pages stay reachable from every company workspace.
const SHARED = ["/app/companies", "/app/employees", "/app/profile", "/app/settings", "/app/inbox", "/app/customers"];

/**
 * Existing modules hold Branta Tech (holding) data only, so a sister company's
 * workspace starts empty instead of showing another company's records.
 */
export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { active, list } = useActiveCompany();
  if (!active || active.is_holding || pathname === "/app" || pathname === "/app/" || (SHARED.some((p) => pathname.startsWith(p)) || (pathname.startsWith("/app/leads")))) return <>{children}</>;
  const holding = list.find((c) => c.is_holding);
  const accent = companyAccent(active.slug);
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-card p-8 text-center shadow-sm animate-in fade-in zoom-in-95">
        <span className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${accent} 20%, transparent)` }} />
        <CompanyAvatar name={active.name} slug={active.slug} iconUrl={companyIdentity(active.slug, active).icon} className="relative mx-auto size-14 rounded-xl text-[18px]" />
        <h2 className="relative mt-4 text-[18px] font-bold tracking-tight">{active.name} workspace is ready</h2>
        <p className="relative mt-1.5 text-[12.5px] font-medium text-muted-foreground">
          Nothing here yet. This company's records will appear here as they are added.
        </p>
        <div className="relative mt-5 flex justify-center gap-2">
          <Link to="/app/companies/$slug" params={{ slug: active.slug }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[12.5px] font-bold text-primary-foreground shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 active:scale-95">
            <Sparkles className="size-4" /> Company profile
          </Link>
          {holding && (
            <button type="button" onClick={() => setActiveCompanySlug(holding.slug)} className="rounded-md border border-border px-3 py-2 text-[12.5px] font-bold transition-all hover:border-brand/40 active:scale-95">
              Back to {holding.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
