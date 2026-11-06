import type { MouseEvent } from "react";
import { createFileRoute, Link, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { isOrgScoped, orgFromPath, toCompanyPath } from "@/lib/org-path";
import { Loader2 } from "lucide-react";
import { useCompanies } from "@/components/company/company-switcher";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPermissions } from "@/lib/permissions.functions";

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
  const permsFn = useServerFn(getMyPermissions);
  const permsQ = useQuery({ queryKey: ["my-permissions"], queryFn: () => permsFn(), staleTime: 60_000 });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
  if (permsQ.isLoading) return <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>;
  // Finance-only staff (not admin/CEO) may open exactly what their sidebar shows:
  // Customers and this company's Finance pages. Anything else goes to Customers.
  const perms = permsQ.data as { isAdmin?: boolean; isSuperAdmin?: boolean; isFinance?: boolean } | undefined;
  const c = company as { canManage?: boolean; canFinance?: boolean };
  const financeOnly = !(perms?.isAdmin ?? perms?.isSuperAdmin) && !c.canManage && Boolean(perms?.isFinance || c.canFinance);
  const rest = pathname.slice(`/app/org/${org}`.length);
  if (financeOnly && !/^\/(customers|finance|my-company)(\/|$)/.test(rest)) {
    return <Navigate to={`/app/org/${org}/customers` as never} replace />;
  }
  const myRole = (company as { myRole?: string | null }).myRole;
  if (!(perms?.isAdmin ?? perms?.isSuperAdmin) && !c.canManage && /^\/finance(\/|$)/.test(rest)
    && (myRole === "member" || (myRole === "manager" && !/^\/finance\/expenses(\/|$)/.test(rest)))) {
    return <Navigate to={`/app/org/${org}` as never} replace />;
  }
  return <div className="contents" onClickCapture={keepInCompany}><Outlet /></div>;
}
