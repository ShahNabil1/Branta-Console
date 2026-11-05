import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Crown, Globe2, Lock, Shield, ShieldCheck, Users, Wallet, User } from "lucide-react";
import { listCompanies } from "@/lib/companies.functions";
import { CompanyAvatar } from "@/components/company/company-avatar";
import { companyIdentity } from "@/lib/company-identity";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type HoldingRole = "super_admin" | "admin" | "finance" | "manager" | "coo" | "user";
export type CompanyRole = "member" | "manager" | "finance" | "super_admin" | "coo";

type Opt<T> = { value: T; label: string; note: string; icon: typeof User };

const HOLDING: Opt<HoldingRole>[] = [
  { value: "user", label: "Executive", note: "Workspace & CRM of Branta Tech only.", icon: User },
  { value: "manager", label: "C.E.O", note: "Full control of Branta Tech only.", icon: Users },
  { value: "coo", label: "C.O.O", note: "Full control of Branta Tech only.", icon: Users },
  { value: "admin", label: "HR", note: "Workspace, CRM, Expenses, Wallets & Employees of every company.", icon: ShieldCheck },
  { value: "finance", label: "Accounts", note: "Finance & Customers of every company.", icon: Wallet },
  { value: "super_admin", label: "Group Admin (GA)", note: "Full control of every company.", icon: Crown },
];
const SISTER: Opt<CompanyRole>[] = [
  { value: "member", label: "Executive", note: "Workspace & CRM of this company only.", icon: User },
  { value: "super_admin", label: "C.E.O", note: "Full control of this company only.", icon: Shield },
  { value: "coo", label: "C.O.O", note: "Full control of this company only.", icon: Shield },
  { value: "manager", label: "HR", note: "Workspace, CRM & Expenses of this company.", icon: Users },
  { value: "finance", label: "Accounts", note: "Finance & Customers of this company.", icon: Wallet },
];

export function CompanyRolePicker({
  companyId, onCompany, holdingRole, onHoldingRole, companyRole, onCompanyRole, canSuperAdmin,
}: {
  companyId: string | null; onCompany: (id: string, isHolding: boolean) => void;
  holdingRole: HoldingRole; onHoldingRole: (r: HoldingRole) => void;
  companyRole: CompanyRole; onCompanyRole: (r: CompanyRole) => void;
  canSuperAdmin: boolean;
}) {
  const listFn = useServerFn(listCompanies);
  const q = useQuery({ queryKey: ["companies", "picker"], queryFn: () => listFn() });
  const rows = (q.data ?? []).filter((c) => c.status !== "archived");
  const [open, setOpen] = useState(false);
  const sel = rows.find((c) => c.id === companyId) ?? null;
  // Default to the holding company once loaded.
  useEffect(() => {
    if (!companyId && rows.length) { const h = rows.find((c) => c.is_holding) ?? rows[0]; onCompany(h.id, !!h.is_holding); }
  }, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = sel?.is_holding ? HOLDING.filter((r) => canSuperAdmin || r.value !== "super_admin") : SISTER.filter((r) => canSuperAdmin || r.value !== "super_admin");
  const current = sel?.is_holding ? holdingRole : companyRole;
  const groupWide = sel?.is_holding && ["admin", "super_admin", "finance"].includes(holdingRole);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">Company</label>
        {q.isLoading ? <Skeleton className="h-12 rounded-md" /> : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={cn(
                "group flex h-12 w-full items-center gap-3 rounded-md border bg-card px-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md active:scale-[0.99]",
                open ? "border-brand ring-2 ring-brand/15" : "border-border hover:border-brand/40",
              )}>
                {sel ? <CompanyAvatar name={sel.name} slug={sel.slug} iconUrl={companyIdentity(sel.slug, sel).icon} className="size-8 transition-transform duration-300 group-hover:scale-110" /> : <span className="size-8 rounded-md bg-muted" />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-bold">
                    {sel?.name ?? "Choose a company"}
                    {sel?.is_holding && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-brand">Holding</span>}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{sel?.is_holding ? "Group roles can reach every company" : "Access stays inside this workspace"}</span>
                </span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", open && "rotate-180 text-brand")} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1.5 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-1">
              {rows.map((c, i) => {
                const on = c.id === companyId;
                return (
                  <button key={c.id} type="button" style={{ animationDelay: `${i * 35}ms` }}
                    onClick={() => { onCompany(c.id, !!c.is_holding); setOpen(false); }}
                    className={cn("group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-all animate-in fade-in slide-in-from-left-1 fill-mode-both hover:translate-x-0.5 hover:bg-muted", on && "bg-brand/5")}>
                    <CompanyAvatar name={c.name} slug={c.slug} iconUrl={companyIdentity(c.slug, c).icon} className="size-7 transition-transform group-hover:scale-110" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{c.name}</span>
                    {c.is_holding && <span className="text-[9.5px] font-bold uppercase tracking-wider text-brand">Holding</span>}
                    {on && <Check className="size-3.5 text-brand animate-in zoom-in-50" />}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {sel && (
        <div key={sel.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          <label className="mb-1.5 flex items-center justify-between text-[12px] font-medium text-muted-foreground">
            <span>Role in {sel.name}</span>
            <span className="inline-flex items-center gap-1 text-[10.5px]">
              {groupWide ? <><Globe2 className="size-3 text-brand" /> All companies</> : <><Lock className="size-3" /> This workspace only</>}
            </span>
          </label>
          <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
            {opts.map((r, i) => {
              const active = current === r.value;
              const I = r.icon;
              return (
                <button key={r.value} type="button" style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => sel.is_holding ? onHoldingRole(r.value as HoldingRole) : onCompanyRole(r.value as CompanyRole)}
                  className={cn(
                    "group relative flex items-start gap-2.5 overflow-hidden rounded-md border px-2.5 py-2.5 text-left transition-all duration-200 animate-in fade-in fill-mode-both hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]",
                    active ? "border-brand bg-brand/5 shadow-sm" : "border-border bg-card hover:border-brand/30",
                  )}>
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-md border transition-all duration-300 group-hover:rotate-[-6deg] group-hover:scale-110",
                    active ? "border-brand/30 bg-brand text-primary-foreground" : "border-border bg-background text-muted-foreground")}>
                    <I className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-foreground">{r.label}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">{r.note}</span>
                  </span>
                  {active && <Check className="absolute right-2 top-2 size-3.5 text-brand animate-in zoom-in-50 spin-in-12" />}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">More companies can be added later from the employee's profile → Workspaces.</p>
        </div>
      )}
    </div>
  );
}
