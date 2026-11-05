import type { MouseEvent } from "react";
import { createFileRoute, Link, Navigate, Outlet, useNavigate } from "@tanstack/react-router";
import { isOrgScoped, orgFromPath, toCompanyPath } from "@/lib/org-path";
import { Loader2 } from "lucide-react";
import { useCompanies } from "@/components/company/company-switcher";

export const Route = createFileRoute("/_authenticated/app/org/$org")({
  head: () => ({ meta: [{ title: "Company workspace · Branta Console" }, { name: "robots", content: "noindex" }] }),
  component: OrgLayout,
});

/** Sets the company from the URL. Companies the user can't see never render. */
function OrgLayout() {
  const { org } = Route.useParams();
  const q = useCompanies();
  const company = (q.data ?? []).find((c) => c.slug === org);
  const navigate = useNavigate();

  // Shared pages link to plain /app/... URLs; inside a sister workspace every such
  // company-page link stays in this company (preventDefault stops Link's own navigation).
  const keepInCompany = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== "_self")) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin || orgFromPath(url.pathname) || !isOrgScoped(url.pathname)) return;
    e.preventDefault();
    navigate({ href: toCompanyPath(url.pathname, org, false) + url.search + url.hash });
  };

  if (q.isLoading) return <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>;
  if (!company) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <h2 className="text-[18px] font-bold tracking-tight">No access to this company</h2>
          <p className="mt-1.5 text-[12.5px] font-medium text-muted-foreground">This workspace doesn't exist or you haven't been given access.</p>
          <Link to="/app" className="mt-5 inline-flex rounded-md border border-border px-3 py-2 text-[12.5px] font-bold hover:border-brand/40">Go to my workspace</Link>
        </div>
      </div>
    );
  }
  if (company.is_holding) return <Navigate to="/app" replace />;
  return <div className="contents" onClickCapture={keepInCompany}><Outlet /></div>;
}
