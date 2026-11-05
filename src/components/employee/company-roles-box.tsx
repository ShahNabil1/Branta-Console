import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Lock } from "lucide-react";
import { listEmployeeWorkspaces, setEmployeeWorkspace, type WorkspaceRole } from "@/lib/companies.functions";
import { CompanyAvatar } from "@/components/company/company-avatar";
import { companyIdentity } from "@/lib/company-identity";
import { cn } from "@/lib/utils";

/** Sister-company roles (stored company_members values → labels). No Group Admin here. */
export const SISTER_ROLE_OPTIONS: { value: WorkspaceRole; label: string; note: string }[] = [
  { value: "member", label: "Executive", note: "Workspace & CRM of this company only." },
  { value: "super_admin", label: "C.E.O", note: "Full control of this company only." },
  { value: "coo", label: "C.O.O", note: "Full control of this company only." },
  { value: "manager", label: "HR", note: "Workspace, CRM, Expenses, Wallets & Employees of this company." },
  { value: "finance", label: "Accounts", note: "Finance & Customers of this company." },
];

/** Roles box: one tab per switched-on company; Branta Tech shows the group roles (children). */
export function CompanyRolesBox({ userId, holding, limited }: { userId: string; holding: ReactNode; limited?: boolean }) {
  const qc = useQueryClient();
  const key = ["employee.workspaces", userId];
  const listFn = useServerFn(listEmployeeWorkspaces);
  const setFn = useServerFn(setEmployeeWorkspace);
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { userId } }) });
  const on = (q.data ?? []).filter((c) => c.role);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (!on.length) return;
    if (!sel || !on.some((c) => c.id === sel)) setSel((on.find((c) => c.is_holding) ?? on[0]).id);
  }, [on.map((c) => c.id).join(","), sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const co = on.find((c) => c.id === sel) ?? null;
  const m = useMutation({
    mutationFn: (role: WorkspaceRole) => setFn({ data: { userId, companyId: co!.id, role } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); toast.success("Role saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) return <div className="grid h-20 place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>;
  if (!on.length) return <p className="text-[12px] text-muted-foreground">Switch on a company in Workspaces above to set its role.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {on.map((c) => (
          <button key={c.id} type="button" onClick={() => setSel(c.id)}
            className={cn("inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              c.id === sel ? "border-brand bg-brand/5 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
            <CompanyAvatar name={c.name} slug={c.slug} iconUrl={companyIdentity(c.slug, c).icon} className="size-5" />
            {c.name}
          </button>
        ))}
      </div>
      {co && (
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2">
          <CompanyAvatar name={co.name} slug={co.slug} iconUrl={companyIdentity(co.slug, co).icon} className="size-7" />
          <div className="min-w-0">
            <div className="text-[13px] font-bold">{co.name}{co.is_holding && <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-brand">Holding</span>}</div>
            <div className="text-[11px] text-muted-foreground">{co.is_holding ? "Group roles — Group Admin, Accounts and HR reach every company" : "Access stays inside this company only"}</div>
          </div>
        </div>
      )}
      {co?.is_holding ? holding : co && (
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {SISTER_ROLE_OPTIONS.filter((r) => !limited || co.role === r.value || (r.value !== "super_admin" && r.value !== "coo")).map((r) => {
            const active = co.role === r.value;
            const locked = !!co.leader;
            const busy = m.isPending && m.variables === r.value;
            return (
              <button key={r.value} type="button" disabled={locked || m.isPending} onClick={() => !active && m.mutate(r.value)}
                className={cn("rounded-sm border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed",
                  active ? "border-brand bg-brand/5" : "border-border bg-card hover:bg-muted", locked && !active && "opacity-50")}>
                <div className="flex items-center justify-between">
                  <div className="text-[12.5px] font-semibold">{r.label}</div>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : active ? (locked ? <Lock className="size-3.5 text-muted-foreground" /> : <Check className="size-3.5 text-brand" strokeWidth={2.5} />) : null}
                </div>
                <div className="mt-0.5 text-[10.5px] text-muted-foreground">{r.note}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
