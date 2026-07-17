import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createLead,
  listAssignableUsers,
  listLeads,
  type LeadStatusDB,
} from "@/lib/leads.functions";
import {
  getSheetSyncStatus,
  pushLeadsToSheet,
  pullLeadsFromSheet,
} from "@/lib/leads-sheets.functions";

export const Route = createFileRoute("/_authenticated/app/leads")({
  component: LeadsPage,
  head: () => ({
    meta: [
      { title: "Leads · Branta Tech Console" },
      {
        name: "description",
        content:
          "Full CRM leads data grid with filters, real-time updates, and per-lead workspaces.",
      },
    ],
  }),
});

const STATUSES: { value: LeadStatusDB; label: string; dotVar: string }[] = [
  { value: "new", label: "New", dotVar: "--color-status-new" },
  { value: "contacted", label: "Contacted", dotVar: "--color-status-contacted" },
  { value: "viewed", label: "Viewed", dotVar: "--color-status-viewed" },
  { value: "meeting", label: "Meeting Scheduled", dotVar: "--color-status-meeting" },
  { value: "converted", label: "Converted", dotVar: "--color-status-converted" },
  { value: "lost", label: "Lost", dotVar: "--color-status-contacted" },
];
const STATUS_META = new Map(STATUSES.map((s) => [s.value, s] as const));

function StatusBadge({ status }: { status: LeadStatusDB }) {
  const meta = STATUS_META.get(status);
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-foreground">
      <span
        className="size-1.5 rounded-full"
        style={{ background: `var(${meta?.dotVar})` }}
      />
      {meta?.label ?? status}
    </span>
  );
}

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

const money = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(v);

function LeadsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listLeads);
  const listUsers = useServerFn(listAssignableUsers);

  const leadsQuery = useQuery({
    queryKey: ["leads", "list"],
    queryFn: () => list(),
    staleTime: 15_000,
  });

  const usersQuery = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () => listUsers(),
    staleTime: 60_000,
  });

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
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const rows = leadsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (ownerFilter !== "all") {
        if (ownerFilter === "unassigned" && r.owner_id) return false;
        if (ownerFilter !== "unassigned" && r.owner_id !== ownerFilter)
          return false;
      }
      if (!q) return true;
      const hay = [r.name, r.company, r.email, r.slug, r.lead_code, r.next_action]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leadsQuery.data, search, statusFilter, ownerFilter]);

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (ownerFilter !== "all" ? 1 : 0);

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
            Leads
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {leadsQuery.data?.length ?? 0} total · {filtered.length} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SheetSyncButton />
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-sm border-border text-[12.5px]"
            onClick={() => qc.invalidateQueries({ queryKey: ["leads"] })}
          >
            <RefreshCw className="mr-1.5 size-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-sm bg-primary text-[12.5px] text-primary-foreground hover:bg-brand-700"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1.5 size-3.5" /> New lead
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-card p-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, code, email…"
            className="h-9 rounded-sm pl-8 text-[12.5px]"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="h-9 w-[180px] rounded-sm text-[12.5px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="h-9 w-[200px] rounded-sm text-[12.5px]">
            <SelectValue placeholder="Owner" />
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
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-sm text-[12.5px] text-muted-foreground"
            onClick={() => {
              setStatusFilter("all");
              setOwnerFilter("all");
            }}
          >
            <Filter className="mr-1.5 size-3.5" />
            Clear {activeFilterCount}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-hidden rounded-sm border border-border bg-card">
        <div className="grid grid-cols-[110px_1.4fr_1.2fr_170px_180px_120px_130px] items-center border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <div>Code</div>
          <div>Lead</div>
          <div>Company</div>
          <div>Status</div>
          <div>Owner</div>
          <div className="text-right">Value</div>
          <div className="text-right">Last activity</div>
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
          {leadsQuery.isLoading ? (
            <div className="grid place-items-center p-16 text-[12.5px] text-muted-foreground">
              <Loader2 className="mb-2 size-5 animate-spin" />
              Loading leads…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : (
            filtered.map((row) => (
              <button
                key={row.id}
                onClick={() =>
                  navigate({
                    to: "/app/leads/$slug",
                    params: { slug: row.slug ?? row.lead_code },
                  })
                }
                className={cn(
                  "grid w-full grid-cols-[110px_1.4fr_1.2fr_170px_180px_120px_130px] items-center border-b border-border/60 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-muted/50",
                )}
              >
                <div className="font-mono text-[11.5px] text-primary">
                  {row.slug ?? row.lead_code}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {row.name}
                  </div>
                  {row.email && (
                    <div className="truncate text-[11.5px] text-muted-foreground">
                      {row.email}
                    </div>
                  )}
                </div>
                <div className="truncate text-foreground">{row.company ?? "—"}</div>
                <div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                    {initialsOf(row.owner_name)}
                  </span>
                  <span className="truncate text-[12.5px] text-foreground">
                    {row.owner_name ?? "Unassigned"}
                  </span>
                </div>
                <div className="text-right font-mono text-[12.5px] text-foreground">
                  {money(row.value_usd)}
                </div>
                <div className="text-right font-mono text-[11.5px] text-muted-foreground">
                  {relTime(row.last_activity_at)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={usersQuery.data ?? []}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
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
        onClick={onCreate}
      >
        <Plus className="mr-1.5 size-3.5" /> New lead
      </Button>
    </div>
  );
}

// ---------- Create dialog ----------
type CreateForm = {
  name: string;
  company: string;
  email: string;
  phone: string;
  status: LeadStatusDB;
  source: string;
  owner_id: string;
  value_usd: string;
  next_action: string;
  notes: string;
};
const emptyForm: CreateForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  status: "new",
  source: "",
  owner_id: "",
  value_usd: "",
  next_action: "",
  notes: "",
};

function CreateLeadDialog({
  open,
  onOpenChange,
  users,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: { user_id: string; full_name: string | null }[];
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const create = useServerFn(createLead);
  const [form, setForm] = useState<CreateForm>(emptyForm);

  useEffect(() => {
    if (open) setForm(emptyForm);
  }, [open]);

  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          name: form.name.trim(),
          company: form.company.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          status: form.status,
          source: form.source.trim() || null,
          owner_id: form.owner_id || null,
          value_usd: form.value_usd ? Number(form.value_usd) : null,
          next_action: form.next_action.trim() || null,
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: (row) => {
      toast.success("Lead created");
      qc.invalidateQueries({ queryKey: ["leads"] });
      onOpenChange(false);
      navigate({
        to: "/app/leads/$slug",
        params: { slug: row.slug ?? row.lead_code },
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to create lead"),
  });

  const set = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-sm">
        <DialogHeader>
          <DialogTitle className="text-[15px]">New lead</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Name *" className="col-span-2">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="h-9 rounded-sm text-[12.5px]"
            />
          </FormRow>
          <FormRow label="Company">
            <Input
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              className="h-9 rounded-sm text-[12.5px]"
            />
          </FormRow>
          <FormRow label="Source">
            <Input
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              placeholder="Referral, LinkedIn…"
              className="h-9 rounded-sm text-[12.5px]"
            />
          </FormRow>
          <FormRow label="Email">
            <Input
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="h-9 rounded-sm text-[12.5px]"
            />
          </FormRow>
          <FormRow label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="h-9 rounded-sm text-[12.5px]"
            />
          </FormRow>
          <FormRow label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as LeadStatusDB)}
            >
              <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
          <FormRow label="Owner">
            <Select
              value={form.owner_id || "self"}
              onValueChange={(v) => set("owner_id", v === "self" ? "" : v)}
            >
              <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">Me</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name || u.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
          <FormRow label="Value (USD)">
            <Input
              inputMode="decimal"
              value={form.value_usd}
              onChange={(e) => set("value_usd", e.target.value)}
              className="h-9 rounded-sm font-mono text-[12.5px]"
            />
          </FormRow>
          <FormRow label="Next action" className="col-span-2">
            <Input
              value={form.next_action}
              onChange={(e) => set("next_action", e.target.value)}
              placeholder="Call · Send deck · Follow up"
              className="h-9 rounded-sm text-[12.5px]"
            />
          </FormRow>
          <FormRow label="Notes" className="col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="min-h-[90px] rounded-sm text-[12.5px]"
            />
          </FormRow>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="h-9 rounded-sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-brand-700"
            disabled={m.isPending || !form.name.trim()}
            onClick={() => m.mutate()}
          >
            {m.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 size-3.5" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("space-y-1", className)}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      {children}
    </label>
  );
}

// ---------- Sheet sync ----------
function SheetSyncButton() {
  const getStatus = useServerFn(getSheetSyncStatus);
  const pushFn = useServerFn(pushLeadsToSheet);
  const pullFn = useServerFn(pullLeadsFromSheet);
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["leads", "sheet-status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });
  const pushM = useMutation({
    mutationFn: () => pushFn(),
    onSuccess: (r) => {
      toast.success("Pushed to Google Sheet");
      qc.invalidateQueries({ queryKey: ["leads"] });
      if (r.spreadsheetUrl) window.open(r.spreadsheetUrl, "_blank");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Push failed"),
  });
  const pullM = useMutation({
    mutationFn: () => pullFn(),
    onSuccess: (r) => {
      toast.success(`Pulled: ${r.created} new · ${r.updated} updated`);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Pull failed"),
  });
  const busy = pushM.isPending || pullM.isPending;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-sm border-border text-[12.5px]"
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <SheetIcon className="mr-1.5 size-3.5" />
          )}
          Sheet
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-sm text-[12.5px]">
        <DropdownMenuItem onClick={() => pushM.mutate()} disabled={busy}>
          <ArrowUpToLine className="mr-2 size-3.5" /> Push leads → Sheet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pullM.mutate()} disabled={busy}>
          <ArrowDownToLine className="mr-2 size-3.5" /> Pull from Sheet
        </DropdownMenuItem>
        {status.data?.spreadsheetUrl && (
          <DropdownMenuItem
            onClick={() => window.open(status.data.spreadsheetUrl!, "_blank")}
          >
            <ExternalLink className="mr-2 size-3.5" /> Open Sheet
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
