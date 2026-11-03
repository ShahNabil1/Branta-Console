import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useActiveCompany } from "./company-switcher";
import { isOrgScoped, orgFromPath, rememberLastPath } from "@/lib/org-path";

/**
 * Keeps the URL and the selected company in sync:
 * - a plain /app/... company page opened while a sister company is selected
 *   moves to /app/org/<slug>/... (so existing links stay inside that company);
 * - users without Branta Tech access never land on Branta pages;
 * - the last page is remembered for the next sign-in.
 */
export function OrgBridge() {
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const { active, list, isLoading } = useActiveCompany();
  const href = loc.pathname + (loc.searchStr ?? "") + (loc.hash ? `#${loc.hash}` : "");

  useEffect(() => { rememberLastPath(href); }, [href]);

  useEffect(() => {
    if (isLoading || !active || orgFromPath(loc.pathname)) return;
    if (active.is_holding || !isOrgScoped(loc.pathname)) return;
    const hasHolding = list.some((c) => c.is_holding);
    // Sister-only staff, or a sister company currently selected.
    if (!hasHolding || !active.is_holding) {
      navigate({ href: `/app/org/${active.slug}${loc.pathname.slice(4)}${loc.searchStr ?? ""}`, replace: true });
    }
  }, [active, list, isLoading, loc.pathname, loc.searchStr, navigate]);

  return null;
}
