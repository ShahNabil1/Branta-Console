import { useActiveCompany } from "@/components/company/company-switcher";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FolderKanban, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SERVICE_TRACKS, createHubProject, listCustomersForPicker, listHubProjects, type HubProject,
} from "@/lib/projects-hub.functions";
import { PROJECT_ROLES } from "@/lib/project-team.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/projects/")({
  head: () => ({
    meta: [
      { title: "Projects · Branta Tech Console" },
      { name: "description", content: "All client and internal projects with teams, service tracks, task progress and QC status." },
      { property: "og:title", content: "Projects · Branta Tech Console" },
      { property: "og:description", content: "All client and internal projects with teams, service tracks, task progress and QC status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectsHub,
});

type Filter = "all" | "client" | "internal" | "active" | "qc" | "mine" | "completed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "client", label: "Client" }, { key: "internal", label: "Internal" },
  { key: "active", label: "Active" }, { key: "qc", label: "Under QC" }, { key: "mine", label: "My projects" },
  { key: "completed", label: "Completed" },
];
export const trackLabel = (k: string | null) => SERVICE_TRACKS.find((t) => t.key === k)?.label ?? "—";
export const roleShort = (k: string) => PROJECT_ROLES.find((r) => r.key === k)?.label.split(" /")[0] ?? k;
export const STATUS_LABEL: Record<string, string> = { planned: "Planned", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };

export function ProjectsHub() {
  const _ac = useActiveCompany().active;
  const workspace = _ac && !_ac.is_holding ? _ac.slug : null;

  const list = useServerFn(listHubProjects);
  const q = useQuery({ queryKey: ["hub-projects", workspace ?? "holding"], queryFn: () => list({ data: { workspace } }) });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((p) => {
      if (filter === "client" && p.category !== "client") return false;
      if (filter === "internal" && p.category !== "internal") return false;
      if (filter === "active" && p.status !== "active") return false;
      if (filter === "completed" && p.status !== "completed") return false;
      if (filter === "qc" && p.task_review === 0) return false;
      if (filter === "mine" && p.my_roles.length === 0) return false;
      if (s && !`${p.title} ${p.client_name ?? ""} ${p.service ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [q.data, filter, search]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Projects</h1>
          <p className="text-xs text-muted-foreground">Client and internal work, teams and delivery progress.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />New project</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects…" className="h-8 pl-7" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("h-7 rounded border px-2.5 text-xs", filter === f.key ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading projects…</div>
      ) : q.error ? (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{(q.error as Error).message}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded border border-dashed border-border bg-card p-10 text-center">
          <FolderKanban className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No projects match this view.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      )}
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ProjectCard({ p }: { p: HubProject }) {
  const pct = p.task_total ? Math.round((p.task_done / p.task_total) * 100) : 0;
  return (
    <Link to="/app/projects/$id" params={{ id: p.id }}
      className="block rounded border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-foreground">{p.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{p.category === "internal" ? "Internal / Official" : p.client_name ?? "—"}</div>
        </div>
        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{STATUS_LABEL[p.status] ?? p.status}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{trackLabel(p.service_track) === "—" ? p.service ?? "No track" : trackLabel(p.service_track)}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{p.project_type === "monthly" ? "Monthly retainer" : "One-time"}</span>
        {p.task_review > 0 && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{p.task_review} in QC</span>}
        {p.task_revision > 0 && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">{p.task_revision} revision</span>}
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{p.task_done}/{p.task_total} tasks</span><span className="font-mono">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{p.member_count} member{p.member_count === 1 ? "" : "s"}</span>
        <span className="font-mono">{p.due_on ? `Due ${p.due_on}` : "No deadline"}</span>
      </div>
      {p.my_roles.length > 0 && (
        <div className="mt-2 text-[11px] text-primary">You: {p.my_roles.map(roleShort).join(", ")}</div>
      )}
    </Link>
  );
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useServerFn(createHubProject);
  const custFn = useServerFn(listCustomersForPicker);
  const _ac = useActiveCompany().active;
  const workspace = _ac && !_ac.is_holding ? _ac.slug : null;
  const customers = useQuery({ queryKey: ["hub-customers", workspace ?? "holding"], queryFn: () => custFn({ data: { workspace } }), enabled: open });
  const qc = useQueryClient();
  const nav = useNavigate();
  const blank = { title: "", category: "client" as "client" | "internal", customer_id: "", service_track: "web_dev", project_type: "one_time" as "one_time" | "monthly",
    starts_on: "", due_on: "", billing_day: "", monthly_deliverables: "", notes: "", sow_doc_url: "", requirements_doc_url: "" };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
  const m = useMutation({
    mutationFn: () => create({ data: {
      title: f.title, category: f.category, customer_id: f.category === "client" ? f.customer_id || null : null,
      service_track: f.service_track as any, project_type: f.project_type,
      starts_on: f.starts_on || null, due_on: f.due_on || null,
      billing_day: f.project_type === "monthly" && f.billing_day ? Number(f.billing_day) : null,
      monthly_deliverables: f.project_type === "monthly" ? f.monthly_deliverables || null : null,
      notes: f.notes || null, sow_doc_url: f.sow_doc_url || null, requirements_doc_url: f.requirements_doc_url || null,
      workspace,
    } }),
    onSuccess: (r) => {
      toast.success("Project created");
      qc.invalidateQueries({ queryKey: ["hub-projects"] });
      onOpenChange(false); setF(blank);
      nav({ to: "/app/projects/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sel = "h-9 w-full rounded border border-input bg-background px-2 text-sm";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Title</Label><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Type</Label>
              <select className={sel} value={f.category} onChange={(e) => set("category", e.target.value)}>
                <option value="client">Client project</option><option value="internal">Internal / Official / Marketing</option>
              </select></div>
            <div><Label>Service track</Label>
              <select className={sel} value={f.service_track} onChange={(e) => set("service_track", e.target.value)}>
                {SERVICE_TRACKS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select></div>
          </div>
          {f.category === "client" && (
            <div><Label>Client</Label>
              <select className={sel} value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)}>
                <option value="">Select client…</option>
                {(customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.company || c.name} ({c.customer_code})</option>)}
              </select></div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Billing</Label>
              <select className={sel} value={f.project_type} onChange={(e) => set("project_type", e.target.value)}>
                <option value="one_time">One-time</option><option value="monthly">Monthly recurring</option>
              </select></div>
            <div><Label>Start</Label><Input type="date" value={f.starts_on} onChange={(e) => set("starts_on", e.target.value)} /></div>
            <div><Label>Deadline</Label><Input type="date" value={f.due_on} onChange={(e) => set("due_on", e.target.value)} /></div>
          </div>
          {f.project_type === "monthly" && (
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Billing day</Label><Input type="number" min={1} max={31} value={f.billing_day} onChange={(e) => set("billing_day", e.target.value)} /></div>
              <div className="col-span-2"><Label>Monthly deliverables</Label><Input placeholder="e.g. 12 posters, 2 videos" value={f.monthly_deliverables} onChange={(e) => set("monthly_deliverables", e.target.value)} /></div>
            </div>
          )}
          <div><Label>Scope of Work doc link</Label><Input type="url" placeholder="https://docs.google.com/…" value={f.sow_doc_url} onChange={(e) => set("sow_doc_url", e.target.value)} /></div>
          <div><Label>Client requirement doc link</Label><Input type="url" placeholder="https://…" value={f.requirements_doc_url} onChange={(e) => set("requirements_doc_url", e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          <p className="text-[11px] text-muted-foreground">You will be added as Project Head. Budget and payment stay in the client's Finance section.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={m.isPending || f.title.trim().length < 2 || (f.category === "client" && !f.customer_id)} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
