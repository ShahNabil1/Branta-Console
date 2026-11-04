import { Archive } from "lucide-react";
import { confirmAction } from "@/components/ui/confirm-dialog";
// One Client → Multiple Projects / Jobs. Mobile-first cards + bottom sheet form.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Briefcase, CalendarDays, ChevronDown, Loader2, Lock, Pencil, Plus, Repeat, User, X, Zap } from "lucide-react";
import { FinancePanel } from "./task-work";
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
  const { projects, activity, canSeeFinance } = q.data!;

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
            <ProjectCard key={p.id} p={p} customerId={customerId} canSeeFinance={canSeeFinance} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}
      {editing && (
        <ProjectSheet customerId={customerId} users={users} project={editing === "new" ? null : editing} canSeeFinance={canSeeFinance} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function nextBilling(day: number) {
  const now = new Date();
  const mk = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  let d = mk(now.getFullYear(), now.getMonth());
  if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = mk(now.getFullYear(), now.getMonth() + 1);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function ProjectCard({ p, customerId, canSeeFinance, onEdit }: { p: ClientProject; customerId: string; canSeeFinance: boolean; onEdit: () => void }) {
  const [finOpen, setFinOpen] = useState(false);
  const monthly = p.project_type === "monthly";
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
          <span className={cn("mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", monthly ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {monthly ? <Repeat className="size-3" /> : <Zap className="size-3" />}{monthly ? "Monthly Contract" : "One-Time Job"}
          </span>
          <div className="truncate text-[15px] font-bold text-foreground">{p.title}</div>
          {p.service && <div className="truncate text-[13px] text-muted-foreground">{p.service}</div>}
        </div>
        <button onClick={onEdit} aria-label="Edit" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"><Pencil className="size-4" /></button>
        <button
          onClick={() => void confirmAction({ tone: "warning", icon: Archive, title: "Archive this project?", subject: p.title, points: ["It is hidden from active project lists.", "All history is kept."], confirmLabel: "Archive" }).then((ok) => ok && m.mutate({ archive: true }))}
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
        <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="size-3.5" />{monthly ? `${fmtDate(p.contract_start)} → ${fmtDate(p.contract_end)}` : `${fmtDate(p.starts_on)} → ${fmtDate(p.due_on)}`}</div>
        <div className="text-right font-mono font-bold text-foreground">{canSeeFinance ? (() => { const v = monthly ? p.monthly_fee : p.work_value ?? p.budget; return v != null ? `${p.currency} ${Number(v).toLocaleString("en-IN")}${monthly ? "/mo" : ""}` : "—"; })() : ""}</div>
        {monthly && p.billing_day && <div className="col-span-2 text-[12.5px] font-semibold text-primary">Next billing: {nextBilling(p.billing_day)}</div>}
        {monthly && p.client_manager_name && <div className="col-span-2 text-muted-foreground">Client manager: <span className="font-semibold text-foreground">{p.client_manager_name}</span></div>}
        <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground"><User className="size-3.5" />{p.assignee_name || "Unassigned"}</div>
      </div>
      {monthly && p.monthly_deliverables && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[12.5px] text-foreground/80"><span className="font-semibold">Deliverables:</span> {p.monthly_deliverables}</p>}
      {p.notes && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12.5px] text-foreground/80">{p.notes}</p>}
      {canSeeFinance && (
        <div className="mt-3 border-t border-border pt-2">
          <button onClick={() => setFinOpen((v) => !v)} className="flex w-full items-center justify-between text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">
            <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" />Payment / Project value</span>
            <ChevronDown className={cn("size-4 transition-transform", finOpen && "rotate-180")} />
          </button>
          {finOpen && <div className="mt-2 animate-fade-in"><FinancePanel projectId={p.id} defaultValue={monthly ? p.monthly_fee : p.work_value ?? p.budget} /></div>}
        </div>
      )}
    </div>
  );
}

function ProjectSheet({ customerId, users, project, canSeeFinance, onClose }: { customerId: string; users: AssignableUser[]; project: ClientProject | null; canSeeFinance: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createClientProject);
  const upd = useServerFn(updateClientProject);
  const s = (v: string | null | undefined) => v ?? "";
  const nstr = (v: number | null | undefined) => (v != null ? String(v) : "");
  const [f, setF] = useState({
    project_type: (project?.project_type ?? "") as "" | "one_time" | "monthly",
    title: s(project?.title), service: s(project?.service), status: (project?.status ?? "planned") as ProjectStatus,
    starts_on: s(project?.starts_on), due_on: s(project?.due_on), start_time: s(project?.start_time).slice(0, 5),
    budget: nstr(project?.budget), work_value: nstr(project?.work_value), monthly_fee: nstr(project?.monthly_fee),
    currency: (project?.currency ?? "BDT") as "BDT" | "USD", notes: s(project?.notes), assignee_id: s(project?.assignee_id),
    contract_start: s(project?.contract_start), contract_end: s(project?.contract_end), billing_day: nstr(project?.billing_day),
    services_included: s(project?.services_included), monthly_deliverables: s(project?.monthly_deliverables), client_manager_id: s(project?.client_manager_id),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v === "" ? null : Number(v));
  const monthly = f.project_type === "monthly";
  const m = useMutation({
    mutationFn: async () => {
      if (!f.project_type) throw new Error("Choose a project type");
      if (f.title.trim().length < 2) throw new Error(monthly ? "Contract title is required" : "Task / job name is required");
      if (!monthly && f.starts_on && f.due_on && f.due_on < f.starts_on) throw new Error("Deadline must be after the date");
      if (monthly && f.contract_start && f.contract_end && f.contract_end < f.contract_start) throw new Error("Contract end must be after contract start");
      const bd = num(f.billing_day);
      if (bd != null && (bd < 1 || bd > 31 || !Number.isInteger(bd))) throw new Error("Billing date must be a day between 1 and 31");
      const payload: Record<string, unknown> = {
        project_type: f.project_type, title: f.title.trim(), service: f.service.trim() || null, status: f.status,
        notes: f.notes.trim() || null, assignee_id: f.assignee_id || null, currency: f.currency,
        starts_on: monthly ? null : f.starts_on || null, due_on: monthly ? null : f.due_on || null, start_time: monthly ? null : f.start_time || null,
        contract_start: monthly ? f.contract_start || null : null, contract_end: monthly ? f.contract_end || null : null,
        billing_day: monthly ? bd : null, services_included: monthly ? f.services_included.trim() || null : null,
        monthly_deliverables: monthly ? f.monthly_deliverables.trim() || null : null, client_manager_id: monthly ? f.client_manager_id || null : null,
      };
      if (canSeeFinance) Object.assign(payload, { budget: num(f.budget), work_value: monthly ? null : num(f.work_value), monthly_fee: monthly ? num(f.monthly_fee) : null });
      if (project) await upd({ data: { id: project.id, ...payload } as any });
      else await create({ data: { customer_id: customerId, ...payload } as any });
    },
    onSuccess: () => { toast.success(project ? "Project updated" : "Project added"); qc.invalidateQueries({ queryKey: ["client-projects", customerId] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const input = "h-11 w-full rounded-md border border-border bg-background px-3 text-[14px] focus:border-primary focus:outline-none";
  const people = users.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.personal_gmail}</option>);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[100dvh] w-full flex-col bg-card sm:max-h-[92dvh] sm:max-w-lg sm:rounded-lg animate-[sheet-up_.25s_ease-out] rounded-t-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-[16px] font-bold">{project ? "Edit project" : "New project"}</div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X className="size-5" /></button>
        </div>
        <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4">
          <div className="text-[12.5px] font-semibold text-muted-foreground">Project type *</div>
          <div className="grid grid-cols-2 gap-2">
            {([["one_time", "Daily / One-Time Job", "Single job with a deadline", Zap], ["monthly", "Monthly Contract", "Recurring monthly fee", Repeat]] as const).map(([k, t, d, I]) => (
              <button key={k} type="button" onClick={() => setF((x) => ({ ...x, project_type: k }))}
                className={cn("rounded-lg border-2 p-3 text-left transition active:scale-[0.98]", f.project_type === k ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                <I className={cn("mb-1.5 size-5", f.project_type === k ? "text-primary" : "text-muted-foreground")} />
                <div className="text-[14px] font-bold leading-tight text-foreground">{t}</div>
                <div className="text-[12px] text-muted-foreground">{d}</div>
              </button>
            ))}
          </div>
          {f.project_type && (
            <div key={f.project_type} className="grid gap-3 animate-fade-in">
              <Field label={monthly ? "Contract title *" : "Task / job name *"}><input className={input} value={f.title} onChange={set("title")} placeholder={monthly ? "e.g. Social Media Management" : "e.g. Product Image Production"} /></Field>
              <Field label="Service type"><input className={input} value={f.service} onChange={set("service")} placeholder="AI Video, Website, Social Media Creative…" /></Field>
              {monthly ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Contract start"><input type="date" className={input} value={f.contract_start} onChange={set("contract_start")} /></Field>
                    <Field label="Contract end"><input type="date" className={input} value={f.contract_end} onChange={set("contract_end")} /></Field>
                    <Field label="Billing date (day of month)"><input type="number" min="1" max="31" inputMode="numeric" className={input} value={f.billing_day} onChange={set("billing_day")} placeholder="5" /></Field>
                    <Field label="Client manager"><select className={input} value={f.client_manager_id} onChange={set("client_manager_id")}><option value="">Not set</option>{people}</select></Field>
                  </div>
                  <Field label="Services included"><textarea rows={3} className={cn(input, "h-auto py-2")} value={f.services_included} onChange={set("services_included")} placeholder="Content calendar, 20 creatives, ad management…" /></Field>
                  <Field label="Monthly deliverables"><textarea rows={3} className={cn(input, "h-auto py-2")} value={f.monthly_deliverables} onChange={set("monthly_deliverables")} placeholder="20 posts, 4 reels, 1 report" /></Field>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date"><input type="date" className={input} value={f.starts_on} onChange={set("starts_on")} /></Field>
                  <Field label="Start time"><input type="time" className={input} value={f.start_time} onChange={set("start_time")} /></Field>
                  <Field label="Deadline"><input type="date" className={input} value={f.due_on} onChange={set("due_on")} /></Field>
                  <Field label="Status"><select className={input} value={f.status} onChange={set("status")}>{PROJECT_STATUSES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {monthly && <Field label="Status"><select className={input} value={f.status} onChange={set("status")}>{PROJECT_STATUSES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>}
                <Field label="Lead / assigned to"><select className={input} value={f.assignee_id} onChange={set("assignee_id")}><option value="">Unassigned</option>{people}</select></Field>
              </div>
              {canSeeFinance && (
                <div className="grid grid-cols-2 gap-3 rounded-md border border-dashed border-border p-3">
                  <div className="col-span-2 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"><Lock className="size-3.5" />Visible to management & accounts only</div>
                  {monthly
                    ? <Field label="Monthly fee"><input type="number" min="0" inputMode="decimal" className={input} value={f.monthly_fee} onChange={set("monthly_fee")} /></Field>
                    : <Field label="Work value"><input type="number" min="0" inputMode="decimal" className={input} value={f.work_value} onChange={set("work_value")} /></Field>}
                  <Field label="Currency"><select className={input} value={f.currency} onChange={set("currency")}><option>BDT</option><option>USD</option></select></Field>
                </div>
              )}
              <div className="text-[12px] text-muted-foreground">Assigned team, submissions and completion time are tracked inside each task of this project.</div>
              <Field label={monthly ? "Notes" : "Instructions / notes"}><textarea rows={4} className={cn(input, "h-auto py-2")} value={f.notes} onChange={set("notes")} /></Field>
            </div>
          )}
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
