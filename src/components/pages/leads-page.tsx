import { useSearch as useSearchRR, useParams as useParamsRR, useNavigate as useNavigateRR } from "@tanstack/react-router";
import { TestLoader } from "@/components/ui/test-loader";
import { useActiveCompany } from "@/components/company/company-switcher";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCompanySetup } from "@/components/company/setup-required";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Search,
  Plus,
  Loader2,
  Filter,
  RefreshCw,
  Sheet as SheetIcon,
  ArrowUpToLine,
  ArrowDownToLine,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Trash2,
  UserCog,
  X,
  FileText,
  PencilLine,
  CheckCircle2,
  AlertCircle,
  CloudUpload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createDraftLead,
  listAssignableUsers,
  listLeads,
  type LeadStatusDB,
} from "@/lib/leads.functions";
import {
  listLeadStatusOptions,
  STATUS_FALLBACK,
  statusColorVar,
  statusLabel,
  type LeadStatusOption,
} from "@/lib/lead-options.functions";
import {
  getMyPermissions,
  bulkAssignLeads,
  bulkDeleteLeads,
} from "@/lib/permissions.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { LeadCard } from "@/components/leads/lead-card";
import { LeadFormSheet } from "@/components/leads/lead-form-sheet";
import { followUpState } from "@/components/leads/lead-meta";
import { useCompanyPath } from "@/components/company/use-company-path";

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200] as const;
export const leadsSearchSchema = z.object({
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 50).default(50),
});




function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function initialsOf(name?: string | null) {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .join("")
    .slice(0, 2);
}


export function LeadsPage() {
  const companyPath = useCompanyPath();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listLeads);
  const listUsers = useServerFn(listAssignableUsers);
  const listStatusOpts = useServerFn(listLeadStatusOptions);
  const createDraft = useServerFn(createDraftLead);
  const workspace = useActiveCompany().active?.slug ?? null;

  const leadsQuery = useQuery({
    queryKey: ["leads", "list", workspace],
    queryFn: () => list({ data: { workspace } }),
    staleTime: 15_000,
  });

  const usersQuery = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () => listUsers(),
    staleTime: 60_000,
  });

  const statusOptsQ = useQuery({
    queryKey: ["lead-status-options"],
    queryFn: () => listStatusOpts(),
    staleTime: 5 * 60_000,
    initialData: STATUS_FALLBACK,
  });
  const statusOptions: LeadStatusOption[] =
    statusOptsQ.data ?? STATUS_FALLBACK;

  useEffect(() => {
    const ch = supabase
      .channel("leads-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => qc.invalidateQueries({ queryKey: ["leads"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_activities" },
        () => qc.invalidateQueries({ queryKey: ["leads"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_contacts" },
        () => qc.invalidateQueries({ queryKey: ["leads"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatusDB>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [quick, setQuick] = useState<"all" | "mine" | "today" | "overdue">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  // Draft flow kept for the empty state / drafts page.
  const createDraftM = useMutation({
    mutationFn: () => createDraft({ data: { workspace } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      navigate({
        href: companyPath(`/app/leads/${row.slug ?? row.lead_code}?new=1`),
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to create lead"),
  });
  const setup = useCompanySetup();
  const onNewLead = () => {
    if (setup.blocked("lead").length) { toast.error(`${setup.companyName} needs its Lead Code prefix set by a Branta Tech admin first.`); return; }
    setFormOpen(true);
  };

  // ---- Super-admin bulk selection / actions --------------------------------
  const confirm = useConfirm();
  const getMyPermsFn = useServerFn(getMyPermissions);
  const bulkAssignFn = useServerFn(bulkAssignLeads);
  const bulkDeleteFn = useServerFn(bulkDeleteLeads);
  const myPermsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => getMyPermsFn(),
    staleTime: 60_000,
  });
  const isSuperAdmin = !!myPermsQ.data?.isSuperAdmin;
  const canManageLeads = !!myPermsQ.data?.lead_manage;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTo, setAssignTo] = useState<string>("unassigned");
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const bulkAssignM = useMutation({
    mutationFn: (ownerId: string | null) =>
      bulkAssignFn({ data: { leadIds: Array.from(selected), ownerId } }),
    onSuccess: (r) => {
      toast.success(`Updated ${r.count} lead(s)`);
      qc.invalidateQueries({ queryKey: ["leads"] });
      clearSelection();
      setAssignOpen(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Assign failed"),
  });
  const bulkDeleteM = useMutation({
    mutationFn: () => bulkDeleteFn({ data: { leadIds: Array.from(selected) } }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.count} lead(s)`);
      qc.invalidateQueries({ queryKey: ["leads"] });
      clearSelection();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Delete failed"),
  });



  const quickCounts = useMemo(() => {
    const rows = leadsQuery.data ?? [];
    let today = 0;
    let overdue = 0;
    rows.forEach((r) => {
      const s = followUpState(r.next_follow_up_at);
      if (s === "today") today++;
      if (s === "overdue") overdue++;
    });
    return { today, overdue };
  }, [leadsQuery.data]);

  const filtered = useMemo(() => {
    const rows = leadsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (quick === "mine" && r.owner_id !== myId) return false;
      if (quick === "today" && followUpState(r.next_follow_up_at) !== "today") return false;
      if (quick === "overdue" && followUpState(r.next_follow_up_at) !== "overdue") return false;
      if (ownerFilter !== "all") {
        if (ownerFilter === "unassigned" && r.owner_id) return false;
        if (ownerFilter !== "unassigned" && r.owner_id !== ownerFilter)
          return false;
      }
      if (!q) return true;
      const hay = [r.name, r.company, r.email, r.slug, r.lead_code, r.next_action, r.phone, r.contact_person]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    if (quick === "today" || quick === "overdue") {
      out.sort(
        (a, b) =>
          new Date(a.next_follow_up_at ?? 0).getTime() - new Date(b.next_follow_up_at ?? 0).getTime(),
      );
    }
    return out;
  }, [leadsQuery.data, search, statusFilter, ownerFilter, quick, myId]);

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (ownerFilter !== "all" ? 1 : 0) + (quick !== "all" ? 1 : 0);

  const rawSearch = (useSearchRR({ strict: false }) as z.infer<typeof leadsSearchSchema>);
  const pageSize = PAGE_SIZE_OPTIONS.includes(
    rawSearch.pageSize as (typeof PAGE_SIZE_OPTIONS)[number],
  )
    ? rawSearch.pageSize
    : 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, rawSearch.page), totalPages);
  const pageStart = (page - 1) * pageSize;
  const paged = filtered.slice(pageStart, pageStart + pageSize);

  function changeLeadSearch(value: string) {
    if (typeof value !== "string") throw new Error("Search must be text.");
    setSearch(value);
  }

  // Reset to page 1 when filters/search change the result set below current page
  useEffect(() => {
    if (rawSearch.page > totalPages) {
      navigate({
        to: companyPath("/app/leads") as "/app/leads",
        search: { page: 1, pageSize },
        replace: true,
      });
    }
  }, [totalPages, rawSearch.page, navigate, pageSize]);

  const setPage = (n: number) =>
    navigate({
      to: companyPath("/app/leads") as "/app/leads",
      search: { page: Math.min(Math.max(1, n), totalPages), pageSize },
    });
  const setPageSize = (n: number) =>
    navigate({
      to: companyPath("/app/leads") as "/app/leads",
      search: { page: 1, pageSize: n },
    });



  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-3 pb-28 sm:gap-4 sm:p-5 md:h-full md:pb-6 lg:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground sm:text-[20px] sm:font-semibold">
            Leads
          </h1>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {leadsQuery.data?.length ?? 0} total · {filtered.length} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageLeads && (
            <div className="hidden md:block">
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-full border-border px-3 text-[12.5px] md:h-9 md:rounded-sm"
            disabled={leadsQuery.isFetching}
            aria-label="Refresh"
            onClick={() => {
              leadsQuery.refetch();
              usersQuery.refetch();
              qc.invalidateQueries({ queryKey: ["lead-status-options"] });
            }}
          >
            <TestLoader tone="refresh" active={leadsQuery.isFetching} className="size-4 md:mr-1.5" />
            <span className="hidden md:inline">Refresh</span>
          </Button>
          {canManageLeads && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="hidden h-9 rounded-sm text-[12.5px] md:inline-flex"
            >
              <Link to={companyPath("/app/leads/drafts") as "/app/leads/drafts"}>
                <FileText className="mr-1.5 size-3.5" />
                Drafts
              </Link>
            </Button>
          )}
          {canManageLeads && (
            <Button
              size="sm"
              className="hidden h-9 rounded-sm bg-primary text-[12.5px] text-primary-foreground hover:bg-brand-700 md:inline-flex"
              onClick={onNewLead}
            >
              <Plus className="mr-1.5 size-3.5" />
              New lead
            </Button>
          )}
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-3 grid gap-2 bg-background/95 px-3 py-2 backdrop-blur md:static md:mx-0 md:flex md:flex-wrap md:items-center md:rounded-sm md:border md:border-border md:bg-card md:p-2">
        <div className="relative min-w-0 flex-1 md:min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => changeLeadSearch(e.target.value)}
            placeholder="Search name, company, phone…"
            className="h-11 rounded-full pl-9 text-[15px] md:h-9 md:rounded-sm md:pl-8 md:text-[12.5px]"
          />
        </div>
        {/* Quick views */}
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] md:mx-0 md:px-0">
          {(
            [
              { key: "all", label: "All" },
              { key: "mine", label: "My leads" },
              { key: "today", label: `Today · ${quickCounts.today}` },
              { key: "overdue", label: `Overdue · ${quickCounts.overdue}` },
            ] as const
          ).map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => setQuick(q.key)}
              className={cn(
                "h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition-all active:scale-95 md:h-8 md:text-[12px]",
                quick === q.key
                  ? q.key === "overdue"
                    ? "border-destructive bg-destructive text-primary-foreground"
                    : "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
        {/* Status chips — mobile */}
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] md:hidden">
          {[{ key: "all", label: "All statuses" }, ...statusOptions].map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter(s.key as typeof statusFilter)}
              className={cn(
                "h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-all active:scale-95",
                statusFilter === s.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="hidden md:block">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="h-9 w-[180px] rounded-sm text-[12.5px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isSuperAdmin && (
          <div className="hidden md:block">
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-9 w-[200px] rounded-sm text-[12.5px]">
                <SelectValue placeholder="Assigned to" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(usersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name || u.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="hidden h-9 rounded-sm text-[12.5px] text-muted-foreground md:inline-flex"
            onClick={() => {
              setStatusFilter("all");
              setOwnerFilter("all");
              setQuick("all");
            }}
          >
            <Filter className="mr-1.5 size-3.5" />
            Clear {activeFilterCount}
          </Button>
        )}
      </div>

      {canManageLeads && (
        <button
          type="button"
          onClick={onNewLead}
          aria-label="New lead"
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-40 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)] transition-transform animate-scale-in active:scale-90 md:hidden"
        >
          <Plus className="size-6" strokeWidth={2.5} />
        </button>
      )}

      <LeadFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(row) => {
          setFormOpen(false);
          navigate({ href: companyPath(`/app/leads/${row.slug ?? row.lead_code}`) });
        }}
      />

      {isSuperAdmin && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-primary/40 bg-primary/5 px-3 py-2 text-[12.5px]">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
              {selected.size}
            </span>
            selected
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-sm px-2 text-[11.5px] text-muted-foreground"
              onClick={clearSelection}
            >
              <X className="mr-1 size-3" /> Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm text-[12px]"
              onClick={() => {
                setAssignTo("unassigned");
                setAssignOpen(true);
              }}
            >
              <UserCog className="mr-1.5 size-3.5" />
              Assign / Reassign
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm border-red-200 text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={bulkDeleteM.isPending}
              onClick={async () => {
                const ok = await confirm({
                  tone: "danger",
                  title: `Delete ${selected.size} lead(s)?`,
                  description:
                    "This permanently removes the selected leads along with their contacts, emails, meetings, notes, social links, and activity history. This action cannot be undone.",
                  confirmLabel: `Delete ${selected.size}`,
                });
                if (ok) bulkDeleteM.mutate();
              }}
            >
              {bulkDeleteM.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 size-3.5" />
              )}
              Delete
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 md:overflow-hidden md:rounded-sm md:border md:border-border md:bg-card">
        {/* Header row — desktop only */}
        <div
          className={cn(
            "hidden items-center border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:grid",
            isSuperAdmin
              ? "grid-cols-[32px_120px_minmax(0,1.4fr)_minmax(0,1.2fr)_150px_minmax(0,170px)_120px] xl:grid-cols-[32px_130px_minmax(0,1.4fr)_minmax(0,1.2fr)_160px_minmax(0,180px)_150px_120px]"
              : "grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1.2fr)_150px_minmax(0,170px)_120px] xl:grid-cols-[130px_minmax(0,1.4fr)_minmax(0,1.2fr)_160px_minmax(0,180px)_150px_120px]",
          )}
        >
          {isSuperAdmin && (
            <div className="flex items-center">
              <Checkbox
                checked={
                  paged.length > 0 &&
                  paged.every((r) => selected.has(r.id))
                }
                onCheckedChange={(v) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (v) paged.forEach((r) => next.add(r.id));
                    else paged.forEach((r) => next.delete(r.id));
                    return next;
                  });
                }}
              />
            </div>
          )}
          <div>Code</div>
          <div>Lead</div>
          <div>Company</div>
          <div>Status</div>
          <div>Assigned to</div>
          <div className="hidden xl:block">Service</div>
          <div className="text-right">Last activity</div>
        </div>
        <div className="md:max-h-[calc(100vh-260px)] md:overflow-y-auto">
          {leadsQuery.isLoading ? (
            <div className="grid place-items-center p-16 text-[12.5px] text-muted-foreground">
              <Loader2 className="mb-2 size-5 animate-spin" />
              Loading leads…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState onCreate={onNewLead} busy={createDraftM.isPending} />
          ) : (
            paged.map((row, idx) => {
              const accent = `var(${statusColorVar(row.status, statusOptions)})`;
              const service = row.service === "Other" ? row.service_other : row.service;
              const isSel = selected.has(row.id);
              const goToLead = () =>
                navigate({
                  href: companyPath(`/app/leads/${row.slug ?? row.lead_code}`),
                });
              return (
                <div
                  key={row.id}
                  className={cn("relative", isSel && "bg-primary/5")}
                >
                  {isSuperAdmin && (
                    <div
                      className="absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 md:block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggleRow(row.id)}
                      />
                    </div>
                  )}
                  {/* Desktop row */}
                  <button
                    onClick={goToLead}
                    style={{
                      animationDelay: `${Math.min(idx, 12) * 24}ms`,
                      ["--row-accent" as string]: accent,
                    }}
                    className={cn(
                      "group relative hidden w-full animate-fade-in items-center border-b border-border/60 px-3 py-2.5 text-left text-[13px] transition-all duration-200 md:grid",
                      isSuperAdmin
                        ? "grid-cols-[32px_120px_minmax(0,1.4fr)_minmax(0,1.2fr)_150px_minmax(0,170px)_120px] xl:grid-cols-[32px_130px_minmax(0,1.4fr)_minmax(0,1.2fr)_160px_minmax(0,180px)_150px_120px]"
                        : "grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1.2fr)_150px_minmax(0,170px)_120px] xl:grid-cols-[130px_minmax(0,1.4fr)_minmax(0,1.2fr)_160px_minmax(0,180px)_150px_120px]",
                      "hover:z-[1] hover:-translate-y-[1px] hover:bg-[linear-gradient(90deg,color-mix(in_oklab,var(--row-accent)_10%,transparent),transparent_55%)] hover:shadow-[0_4px_14px_-8px_color-mix(in_oklab,var(--row-accent)_60%,transparent)]",
                      "before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-[var(--row-accent)] before:opacity-70 before:transition-all before:duration-200 hover:before:h-[80%] hover:before:opacity-100",
                    )}
                  >
                    {isSuperAdmin && <div />}
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="font-mono text-[11.5px] font-semibold text-primary">
                        {row.slug ?? row.lead_code}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div
                        className="truncate font-medium text-foreground transition-colors group-hover:text-primary"
                        title={row.name ?? ""}
                      >
                        {row.name}
                      </div>
                      {row.email && (
                        <div className="truncate text-[11.5px] text-muted-foreground" title={row.email}>
                          {row.email}
                        </div>
                      )}
                    </div>
                    <div className="truncate text-foreground" title={row.company ?? ""}>
                      {row.company ?? "—"}
                    </div>
                    <div className="min-w-0">
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 truncate whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-transform duration-200 group-hover:scale-[1.03]"
                        style={{
                          color: accent,
                          borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
                          background: `color-mix(in oklab, ${accent} 12%, transparent)`,
                        }}
                        title={statusLabel(row.status, statusOptions)}
                      >
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                        <span className="truncate">{statusLabel(row.status, statusOptions)}</span>
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      {row.owner_avatar_url ? (
                        <img
                          src={row.owner_avatar_url}
                          alt={row.owner_name ?? "Assigned"}
                          className="size-6 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-border transition-transform duration-200 group-hover:scale-110"
                        />
                      ) : (
                        <span
                          className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-110"
                          style={{
                            background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 55%, #000))`,
                          }}
                        >
                          {initialsOf(row.owner_name)}
                        </span>
                      )}
                      <span className="truncate text-[12.5px] text-foreground" title={row.owner_name ?? "Unassigned"}>
                        {row.owner_name ?? "Unassigned"}
                      </span>
                    </div>
                    <div className="hidden truncate text-[12.5px] text-muted-foreground xl:block" title={service ?? ""}>
                      {service ?? "—"}
                    </div>
                    <div className="text-right font-mono text-[11.5px] text-muted-foreground">
                      {relTime(row.last_activity_at)}
                    </div>
                  </button>

                  {/* Mobile card */}
                  <div className="px-0 py-1.5 md:hidden">
                    <LeadCard
                      row={row}
                      index={idx}
                      statusLabel={statusLabel(row.status, statusOptions)}
                      statusColor={accent}
                      onOpen={goToLead}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>


      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-card px-3 py-2 text-[12.5px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-[84px] rounded-sm text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-sm text-[12.5px]"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="mr-1 size-3.5" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-sm text-[12.5px]"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next <ChevronRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}


      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-[14px]">
              Assign {selected.size} lead(s)
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Reassign the selected leads to another employee, or leave them
              unassigned.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <label className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Assign to
            </label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(usersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name ?? u.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-sm text-[12.5px]"
              onClick={() => setAssignOpen(false)}
              disabled={bulkAssignM.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-sm bg-primary text-[12.5px] text-primary-foreground hover:bg-brand-700"
              disabled={bulkAssignM.isPending}
              onClick={() =>
                bulkAssignM.mutate(
                  assignTo === "unassigned" ? null : assignTo,
                )
              }
            >
              {bulkAssignM.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  onCreate,
  busy,
}: {
  onCreate: () => void;
  busy?: boolean;
}) {
  return (
    <div className="grid place-items-center p-16 text-center">
      <div className="text-[14px] font-semibold text-foreground">
        No leads match
      </div>
      <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
        Adjust filters or add a new lead to get started.
      </p>
      <Button
        size="sm"
        className="mt-4 h-9 rounded-sm bg-primary text-[12.5px] text-primary-foreground hover:bg-brand-700"
        disabled={busy}
        onClick={onCreate}
      >
        {busy ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1.5 size-3.5" />
        )}
        New lead
      </Button>
    </div>
  );
}

