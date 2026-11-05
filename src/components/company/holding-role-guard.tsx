import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPermissions } from "@/lib/permissions.functions";
import { holdingPageAllowed } from "@/lib/role-access";

/** Branta Tech pages: send a role away from pages its role does not include. */
export function HoldingRoleGuard({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const permsFn = useServerFn(getMyPermissions);
  const q = useQuery({ queryKey: ["my-permissions"], queryFn: () => permsFn(), staleTime: 60_000 });
  const allowed = !q.data || holdingPageAllowed(q.data, pathname);
  useEffect(() => {
    if (q.data && !allowed) {
      const home = holdingPageAllowed(q.data, "/app") ? "/app" : "/app/finance";
      navigate({ to: home, replace: true });
    }
  }, [q.data, allowed, navigate]);
  return allowed ? <>{children}</> : null;
}
