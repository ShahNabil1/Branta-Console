import { Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getMyPermissions } from "@/lib/permissions.functions";

/** Client-side gate that hides admin-only pages from non-super-admins. */
export function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const permsFn = useServerFn(getMyPermissions);
  const permsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permsFn(),
    staleTime: 60_000,
  });

  if (permsQ.isLoading) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (permsQ.data && !(permsQ.data.isAdmin ?? permsQ.data.isSuperAdmin)) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}
