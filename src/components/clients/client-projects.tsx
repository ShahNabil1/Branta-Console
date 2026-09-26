// One Client → Multiple Projects / Jobs. Mobile-first cards + bottom sheet form.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Briefcase, CalendarDays, Loader2, Pencil, Plus, User, X } from "lucide-react";
import {
  PROJECT_STATUSES,
  createClientProject,
  listClientProjects,
  updateClientProject,
  type ClientProject,
  type ProjectStatus,
} from "@/lib/client-projects.functions";
import type { AssignableUser } from "@/lib/leads.functions";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ProjectStatus, string> = {
  planned: "var(--color-status-new, #6b7280)",
  active: "var(--primary)",
  on_hold: "#b45309",
  completed: "var(--color-status-converted, #16a34a)",
  cancelled: "var(--destructive)",
};

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtTs = (d: string) =>
  new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function ClientProjects({ customerId, users, view }: { customerId: string; users: AssignableUser[]; view: "projects" | "activity" }) {
  const list = useServerFn(listClientProjects);
  const q = useQuery({ queryKey: ["client-projects", customerId], queryFn: () => list({ data: { customerId } }) });
  const [editing, setEditing] = useState<ClientProject | "new" | null>(null);

  if (q.isLoading) return <div className="grid place-items-center p-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <div className="p-6 text-center text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const { projects, activity } = q.data!;

  if (view === "activity") {
    return (
      <ol className="mx-auto grid max-w-3xl gap-2 p-4">
        {activity.length === 0 && <li className="p-8 text-center text-[13px] text-muted-foreground">No activity yet.</li>}
        {activity.map((a) => (
          <li key={a.id} className="rounded-md border border-border bg-card px-3 py-2.5 animate-fade-in">
            <div className="text-[14px] font-semibold text-foreground">{a.body}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{a.actor_name || "System"} · {fmtTs(a.created_at)}</div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[15px] font-bold text-foreground">Projects / Jobs <span className="text-muted-foreground">({projects.length})</span></div>
        <button onClick={() => setEditing("new")} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground active:scale-95 transition">
          <Plus className="size-4" /> New project
        </button>
      </div>
      {projects.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-md border border-dashed border-border p-10 text-center">
          <Briefcase className="size-6 text-muted-foreground" />
          <div className="text-[14px] font-semibold">No projects yet</div>
          <div className="text-[12.5px] text-muted-foreground">Add jobs like Product Image Production, AI Video, Website…</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} customerId={customerId} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}
      {editing && (
        <ProjectSheet customerId={customerId} users={users} project={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ProjectCard({ p, customerId, onEdit }: { p: ClientProject; customerId: string; onEdit: () => void }) {
  const qc = useQueryClient();
  const upd = useServerFn(updateClientProject);
  const m = useMutation({
    mutationFn: (patch: { status?: ProjectStatus; archive?: boolean }) => upd({ data: { id: p.id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-projects", customerId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const tone = STATUS_TONE[p.status];
  return (
    <div className="rounded-md border border-border bg-card p-3.5 shadow-sm animate-fade-in">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-foreground">{p.title}</div>
          {p.service && <div className="truncate text-[13px] text-muted-foreground">{p.service}</div>}
        </div>
        <button onClick={onEdit} aria-label="Edit" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"><Pencil className="size-4" /></button>
        <button
          onClick={() => confirm(`Archive "${p.title}"?`) && m.mutate({ archive: true })}
          aria-label="Archive"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        ><Archive className="size-4" /></button>
      </div>
      <label
        className="relative mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold"
        style={{ color: tone, borderColor: `color-mix(in oklab, ${tone} 45%, transparent)`, background: `color-mix(in oklab, ${tone} 12%, transparent)` }}
      >
        {m.isPending ? <Loader2 className="size-3 animate-spin" /> : <span className="size-1.5 rounded-full" style={{ background: tone }} />}
        {PROJECT_STATUSES.find((s) => s.key === p.status)?.label}
        <select aria-label="Change status" className="absolute inset-0 opacity-0" value={p.status} onChange={(e) => m.mutate({ status: e.target.value as ProjectStatus })}>
          {PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="size-3.5" />{fmtDate(p.starts_on)} → {fmtDate(p.due_on)}</div>
        <div className="text-right font-mono font-bold text-foreground">{p.budget != null ? `${p.currency} ${Number(p.budget).toLocaleString("en-IN")}` : "—"}</div>
        <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground"><User className="size-3.5" />{p.assignee_name || "Unassigned"}</div>
      </div>
      {p.notes && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12.5px] text-foreground/80">{p.notes}</p>}
    </div>
  );
}

function ProjectSheet({ customerId, users, project, onClose }: { customerId: string; users: AssignableUser[]; project: ClientProject | null; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createClientProject);
  const upd = useServerFn(updateClientProject);
  const [f, setF] = useState({
    title: project?.title ?? "",
    service: project?.service ?? "",
    status: (project?.status ?? "planned") as ProjectStatus,
    starts_on: project?.starts_on ?? "",
    due_on: project?.due_on ?? "",
    budget: project?.budget != null ? String(project.budget) : "",
    currency: (project?.currency ?? "BDT") as "BDT" | "USD",
    notes: project?.notes ?? "",
    assignee_id: project?.assignee_id ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: async () => {
      if (f.title.trim().length < 2) throw new Error("Project title is required");
      if (f.starts_on && f.due_on && f.due_on < f.starts_on) throw new Error("Due date must be after start date");
      const payload = {
        title: f.title.trim(),
        service: f.service.trim() || null,
        status: f.status,
        starts_on: f.starts_on || null,
        due_on: f.due_on || null,
        budget: f.budget ? Number(f.budget) : null,
        currency: f.currency,
        notes: f.notes.trim() || null,
        assignee_id: f.assignee_id || null,
      };
      if (project) await upd({ data: { id: project.id, ...payload } });
      else await create({ data: { customer_id: customerId, ...payload } });
    },
    onSuccess: () => {
      toast.success(project ? "Project updated" : "Project added");
      qc.invalidateQueries({ queryKey: ["client-projects", customerId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const input = "h-11 w-full rounded-md border border-border bg-background px-3 text-[14px] focus:border-primary focus:outline-none";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[100dvh] w-full flex-col bg-card sm:max-w-lg sm:rounded-lg animate-[sheet-up_.25s_ease-out] rounded-t-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-[16px] font-bold">{project ? "Edit project" : "New project"}</div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X className="size-5" /></button>
        </div>
        <div className="grid flex-1 gap-3 overflow-y-auto p-4">
          <Field label="Project / Job title *"><input className={input} value={f.title} onChange={set("title")} placeholder="e.g. Product Image Production" /></Field>
          <Field label="Service type"><input className={input} value={f.service} onChange={set("service")} placeholder="AI Video, Website, Social Media Creative…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status"><select className={input} value={f.status} onChange={set("status")}>{PROJECT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
            <Field label="Assigned to"><select className={input} value={f.assignee_id} onChange={set("assignee_id")}><option value="">Unassigned</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.personal_gmail}</option>)}</select></Field>
            <Field label="Start date"><input type="date" className={input} value={f.starts_on} onChange={set("starts_on")} /></Field>
            <Field label="Due date"><input type="date" className={input} value={f.due_on} onChange={set("due_on")} /></Field>
            <Field label="Budget"><input inputMode="decimal" type="number" min="0" className={input} value={f.budget} onChange={set("budget")} /></Field>
            <Field label="Currency"><select className={input} value={f.currency} onChange={set("currency")}><option>BDT</option><option>USD</option></select></Field>
          </div>
          <Field label="Notes"><textarea rows={4} className={cn(input, "h-auto py-2")} value={f.notes} onChange={set("notes")} /></Field>
        </div>
        <div className="border-t border-border p-3 pb-safe">
          <button disabled={m.isPending} onClick={() => m.mutate()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-60">
            {m.isPending && <Loader2 className="size-4 animate-spin" />} {project ? "Save changes" : "Add project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1"><span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>{children}</label>;
}
