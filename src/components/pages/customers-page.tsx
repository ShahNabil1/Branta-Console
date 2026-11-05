import { useSearch as useSearchRR, useParams as useParamsRR, useNavigate as useNavigateRR } from "@tanstack/react-router";
import { useActiveCompany } from "@/components/company/company-switcher";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCompanySetup } from "@/components/company/setup-required";
import { Plus, Search, Loader2, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  type CustomerRow,
} from "@/lib/customers.functions";
import { getMyPermissions } from "@/lib/permissions.functions";
import { getProjectCounts } from "@/lib/client-projects.functions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { CustomerDrawer } from "@/components/finance/customer-drawer";



function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function CustomersPage() {
  const qc = useQueryClient();
  const setup = useCompanySetup();
  const list = useServerFn(listCustomers);
  const countsFn = useServerFn(getProjectCounts);
  const { data: projCounts } = useQuery({ queryKey: ["client-project-counts"], queryFn: () => countsFn(), staleTime: 30_000 });
  const workspace = useActiveCompany().active?.slug ?? null;
  const remove = useServerFn(deleteCustomer);
  const confirm = useConfirm();

  const permsFn = useServerFn(getMyPermissions);
  const permsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permsFn(),
    staleTime: 60_000,
  });


  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["customers", "list", workspace],
    queryFn: () => list({ data: { workspace } }),
    staleTime: 15_000,
  });


  const deleteMut = useMutation({
    mutationFn: async (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Customer removed");
      qc.invalidateQueries({ queryKey: ["customers", "list"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const rows: CustomerRow[] = query.data ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.company, r.email, r.phone, r.customer_code]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, q]);

  if (permsQ.isLoading) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (permsQ.data && !permsQ.data.customer_access) {
    return <Navigate to="/app" replace />;
  }

  return (

    <div className="flex h-full flex-col">
      <header className="hairline-b flex items-center gap-3 px-4 py-3">
        <Building2 className="size-4 text-muted-foreground" />
        <h1 className="text-[15px] font-bold">Customers</h1>
        <span className="text-[12px] text-muted-foreground">{rows.length} total</span>
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-7 text-[13px]"
          />
        </div>
        <Button size="sm" onClick={() => {
          if (setup.blocked("customer").length) { toast.error(`${setup.companyName} needs its Customer Code prefix set by a Branta Tech admin first.`); return; }
          setOpen(true);
        }}>
          <Plus className="size-3.5" /> New customer
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {query.isLoading ? (
          <div className="grid h-40 place-items-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid h-40 place-items-center text-[13px] text-muted-foreground">
            No customers yet. Leads with status "Converted" appear here automatically.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((r, idx) => {
              const fromLead = !!r.converted_from_lead_id;
              // Alternate accent so the grid feels colorful without being noisy.
              const palette = [
                "#E56A17", // brand orange
                "#2563EB", // blue
                "#10B981", // emerald
                "#8B5CF6", // violet
                "#EC4899", // pink
                "#F59E0B", // amber
              ];
              const accent = palette[(r.customer_code.charCodeAt(r.customer_code.length - 1) || idx) % palette.length];
              const primaryLabel = r.company?.trim() || r.name;
              const attribution = fromLead
                ? r.converter_name
                  ? `Converted by ${r.converter_name}`
                  : "Converted from lead"
                : r.creator_name
                  ? `Created by ${r.creator_name}`
                  : "Manually created";
              return (
                <div
                  key={r.id}
                  style={{
                    animationDelay: `${Math.min(idx, 12) * 30}ms`,
                    ["--card-accent" as string]: accent,
                  }}
                  className={cn(
                    "group relative flex animate-fade-in flex-col overflow-hidden rounded-lg border border-border bg-card p-4 transition-all duration-300",
                    "hover:-translate-y-1 hover:border-[color:var(--card-accent)]/50",
                    "hover:shadow-[0_12px_32px_-16px_color-mix(in_oklab,var(--card-accent)_60%,transparent)]",
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1 transition-all duration-300 group-hover:h-1.5"
                    style={{
                      background: `linear-gradient(90deg, var(--card-accent), color-mix(in oklab, var(--card-accent) 40%, transparent))`,
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-40"
                    style={{ background: "var(--card-accent)" }}
                  />

                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/app/customers/$code"
                      params={{ code: r.customer_code }}
                      className="font-mono text-[11.5px] font-semibold text-[color:var(--card-accent)] hover:underline"
                    >
                      {r.customer_code}
                    </Link>
                    {projCounts?.[r.id]?.total ? (
                      <span className="ml-auto mr-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {projCounts[r.id].total} project{projCounts[r.id].total > 1 ? "s" : ""}
                        {projCounts[r.id].active ? ` · ${projCounts[r.id].active} active` : ""}
                      </span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Delete ${r.customer_code}?`,
                          description: `${r.name} will be removed from customers. This cannot be undone.`,
                          confirmLabel: "Delete",
                          tone: "danger",
                        });
                        if (ok) deleteMut.mutate(r.id);
                      }}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-bold text-primary-foreground shadow-sm transition-transform duration-300 group-hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, var(--card-accent), color-mix(in oklab, var(--card-accent) 45%, #000))`,
                      }}
                    >
                      {primaryLabel
                        .split(/\s+/)
                        .map((p) => p[0]?.toUpperCase())
                        .join("")
                        .slice(0, 2) || "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/app/customers/$code"
                        params={{ code: r.customer_code }}
                        className="block truncate text-[14px] font-semibold text-foreground transition-colors group-hover:text-[color:var(--card-accent)]"
                      >
                        {primaryLabel}
                      </Link>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {attribution}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[11px] text-muted-foreground">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                        fromLead
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600"
                          : "border-border bg-muted/60",
                      )}
                    >
                      {fromLead
                        ? r.converted_from_lead_slug
                          ? `From ${r.converted_from_lead_slug}`
                          : "From lead"
                        : "Manual"}
                    </span>
                    <span className="font-mono">{relTime(r.created_at)}</span>
                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>

      <CustomerDrawer open={open} onOpenChange={setOpen} />
    </div>
  );
}
