import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, Loader2, Lock } from "lucide-react";
import { listEmployeeWorkspaces, setEmployeeWorkspace, type WorkspaceRole } from "@/lib/companies.functions";
import { CompanyAvatar } from "@/components/company/company-avatar";
import { companyIdentity } from "@/lib/company-identity";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Explicit per-company workspace access. An employee only sees workspaces switched on here. */
export function WorkspaceAccess({ userId, compact }: { userId: string; compact?: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployeeWorkspaces);
  const setFn = useServerFn(setEmployeeWorkspace);
  const key = ["employee.workspaces", userId];
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { userId } }) });
  const m = useMutation({
    mutationFn: (v: { companyId: string; role: WorkspaceRole | null }) => setFn({ data: { userId, ...v } }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success(v.role ? "Workspace access saved" : "Workspace access removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const rows = q.data ?? [];
  const on = rows.filter((r) => r.role).length;

  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-card shadow-sm", !compact && "animate-in fade-in slide-in-from-bottom-1 duration-300")}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[14px] font-bold">Workspaces</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">The employee only sees the companies switched on here.</p>
        </div>
        {!q.isLoading && <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold">{on}/{rows.length}</span>}
      </header>
      <ul className="divide-y divide-border">
        {q.isLoading && Array.from({ length: 2 }).map((_, i) => <li key={i} className="p-4"><Skeleton className="h-10" /></li>)}
        {rows.map((c, i) => {
          const busy = m.isPending && m.variables?.companyId === c.id;
          const locked = !!c.leader;
          return (
            <li key={c.id} style={{ animationDelay: `${i * 40}ms` }} className={cn("flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors animate-in fade-in fill-mode-both", c.role ? "bg-card" : "bg-muted/30")}>
              <CompanyAvatar name={c.name} slug={c.slug} iconUrl={companyIdentity(c.slug, c).icon} className={cn("size-9 transition-all", !c.role && "opacity-50 grayscale")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-bold">{c.name}</span>
                  {c.is_holding && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-brand">Holding</span>}
                  {c.leader && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[10px] font-bold"><Crown className="size-3" />{c.leader}</span>}
                </div>
                <div className="text-[11.5px] text-muted-foreground">{c.role ? "Has access · role set in Roles & access below" : "No access"}</div>
              </div>
              {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : locked ? <Lock className="size-4 text-muted-foreground" aria-label="Company leader" /> : (
                <Switch checked={!!c.role} onCheckedChange={(v) => m.mutate({ companyId: c.id, role: v ? "member" : null })} aria-label={`Access to ${c.name}`} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
