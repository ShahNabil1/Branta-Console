// Client Tasks / Work Orders — list, create sheet, detail sheet with parcel-style tracking + team.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, CalendarDays, Check, ClipboardList, Loader2, Plus, Trash2, Users, X } from "lucide-react";
import {
  ASSIGNEE_STATUSES,
  TASK_STEPS,
  addTaskStatus,
  createClientTask,
  getTaskEvents,
  listClientTasks,
  setTaskAssignees,
  stepIndex,
  stepLabel,
  updateClientTask,
  updateMyAssignment,
  type AssigneeStatus,
  type ClientTask,
  type TaskStatus,
} from "@/lib/client-tasks.functions";
import { listProjectsForPicker } from "@/lib/client-projects.functions";
import type { AssignableUser } from "@/lib/leads.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const input = "h-11 w-full rounded-md border border-border bg-background px-3 text-[14px] focus:border-primary focus:outline-none";
const fmtTs = (d: string) =>
  new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : null);
const initials = (n: string | null) => (n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Avatar({ name, url, size = 28 }: { name: string | null; url: string | null; size?: number }) {
  return url ? (
    <img src={url} alt={name ?? ""} className="shrink-0 rounded-full object-cover ring-2 ring-card" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary ring-2 ring-card" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

function progress(t: ClientTask) {
  const total = t.total_output ?? 0;
  const done = t.assignees.reduce((s, a) => s + (a.done_qty || 0), 0);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : Math.round((stepIndex(t.status) / (TASK_STEPS.length - 1)) * 100);
  return { done, total, pct };
}

export function ClientTasks({ customerId, users }: { customerId: string; users: AssignableUser[] }) {
  const list = useServerFn(listClientTasks);
  const q = useQuery({ queryKey: ["client-tasks", customerId], queryFn: () => list({ data: { customerId } }) });
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = q.data?.find((t) => t.id === openId) ?? null;

  if (q.isLoading) return <div className="grid place-items-center p-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <div className="p-6 text-center text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const tasks = q.data ?? [];

  return (
    <div className="mx-auto max-w-5xl p-4 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[15px] font-bold text-foreground">Tasks / Work Orders <span className="text-muted-foreground">({tasks.length})</span></div>
        <button onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition active:scale-95">
          <Plus className="size-4" /> Add task
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-md border border-dashed border-border p-10 text-center">
          <ClipboardList className="size-6 text-muted-foreground" />
          <div className="text-[14px] font-semibold">No tasks yet</div>
          <div className="text-[12.5px] text-muted-foreground">e.g. "13 product image photoshoot — 6 images per product"</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setOpenId(t.id)} />)}
        </div>
      )}
      {creating && <TaskFormSheet customerId={customerId} onClose={() => setCreating(false)} />}
      {open && <TaskDetailSheet task={open} users={users} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export function TaskCard({ t, onOpen, showClient }: { t: ClientTask; onOpen: () => void; showClient?: boolean }) {
  const p = progress(t);
  const done = t.status === "completed" || t.status === "delivered";
  return (
    <button onClick={onOpen} className="w-full rounded-md border border-border bg-card p-3.5 text-left shadow-sm transition hover:border-primary/40 active:scale-[0.99] animate-fade-in">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[15px] font-bold text-foreground">{t.title}</div>
          <div className="truncate text-[12.5px] text-muted-foreground">
            {showClient && t.customer_name ? `${t.customer_name} · ` : ""}{t.project_title || "No project"}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold", done ? "border-[var(--color-status-converted)]/40 text-[var(--color-status-converted)]" : "border-primary/40 bg-primary/10 text-primary")}>
          {stepLabel(t.status)}{t.status.startsWith("revision") && t.revision_round > 1 ? ` #${t.revision_round}` : ""}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${p.pct}%` }} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[12.5px]">
        {t.total_output != null ? (
          <span className="font-mono font-bold text-foreground">{p.done}/{p.total} {t.output_unit || ""}</span>
        ) : <span className="text-muted-foreground">{p.pct}%</span>}
        {t.due_on && <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarDays className="size-3.5" />{fmtDate(t.due_on)}</span>}
        <span className="ml-auto flex -space-x-2">
          {t.assignees.slice(0, 4).map((a) => <Avatar key={a.id} name={a.name} url={a.avatar_url} size={24} />)}
          {t.assignees.length > 4 && <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-bold ring-2 ring-card">+{t.assignees.length - 4}</span>}
        </span>
      </div>
    </button>
  );
}

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[100dvh] w-full flex-col rounded-t-xl bg-card animate-[sheet-up_.25s_ease-out] sm:max-h-[90dvh] sm:max-w-xl sm:rounded-lg">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 truncate text-[16px] font-bold">{title}</div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-muted"><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-border p-3 pb-safe">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={cn("grid gap-1", className)}><span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

function TaskFormSheet({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createClientTask);
  const listProjects = useServerFn(listProjectsForPicker);
  const projQ = useQuery({ queryKey: ["client-projects-picker", customerId], queryFn: () => listProjects({ data: { customerId } }) });
  const [f, setF] = useState({ title: "", project_id: "", instructions: "", quantity: "", unit: "products", per_unit_output: "", total_output: "", output_unit: "Images", priority: "medium", due_on: "" });
  const [totalTouched, setTotalTouched] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const autoTotal = f.quantity && f.per_unit_output ? String(Number(f.quantity) * Number(f.per_unit_output)) : "";
  const total = totalTouched ? f.total_output : autoTotal;
  const now = new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  const n = (v: string) => (v === "" ? null : Number(v));
  const m = useMutation({
    mutationFn: async () => {
      if (f.title.trim().length < 2) throw new Error("Task is required");
      await create({ data: {
        customer_id: customerId, title: f.title.trim(), project_id: f.project_id || null, instructions: f.instructions.trim() || null,
        quantity: n(f.quantity), unit: f.unit.trim() || null, per_unit_output: n(f.per_unit_output), total_output: n(total),
        output_unit: f.output_unit.trim() || null, priority: f.priority as "medium", due_on: f.due_on || null,
      } });
    },
    onSuccess: () => { toast.success("Task created"); qc.invalidateQueries({ queryKey: ["client-tasks", customerId] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Sheet title="Add New Task / Work Order" onClose={onClose} footer={
      <button disabled={m.isPending} onClick={() => m.mutate()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-60">
        {m.isPending && <Loader2 className="size-4 animate-spin" />} Create task
      </button>
    }>
      <div className="grid gap-3 p-4">
        <div className="rounded-md bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">Date & time: <span className="font-semibold text-foreground">{now}</span> (auto)</div>
        <Field label="Task *"><input className={input} value={f.title} onChange={set("title")} placeholder="13 product image photoshoot" /></Field>
        <Field label="Project (optional)">
          <select className={input} value={f.project_id} onChange={set("project_id")}>
            <option value="">No project</option>
            {(projQ.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label="Instructions"><textarea rows={5} className={cn(input, "h-auto py-2 text-[14.5px]")} value={f.instructions} onChange={set("instructions")} placeholder="6 images per product, white background, 2000×2000px…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity"><input type="number" min="0" inputMode="numeric" className={input} value={f.quantity} onChange={set("quantity")} placeholder="13" /></Field>
          <Field label="Unit"><input className={input} value={f.unit} onChange={set("unit")} /></Field>
          <Field label="Output per unit"><input type="number" min="0" inputMode="numeric" className={input} value={f.per_unit_output} onChange={set("per_unit_output")} placeholder="6" /></Field>
          <Field label="Output unit"><input className={input} value={f.output_unit} onChange={set("output_unit")} /></Field>
        </div>
        <Field label={totalTouched ? "Total output" : "Total output (auto)"}>
          <input type="number" min="0" className={cn(input, "font-mono text-[16px] font-bold")} value={total} onChange={(e) => { setTotalTouched(true); setF((s) => ({ ...s, total_output: e.target.value })); }} placeholder="78" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority"><select className={input} value={f.priority} onChange={set("priority")}>{["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}</select></Field>
          <Field label="Due date"><input type="date" className={input} value={f.due_on} onChange={set("due_on")} /></Field>
        </div>
      </div>
    </Sheet>
  );
}

function TaskDetailSheet({ task, users, onClose }: { task: ClientTask; users: AssignableUser[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"tracking" | "team" | "details">("tracking");
  const [assigning, setAssigning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const archive = useServerFn(updateClientTask);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["client-tasks", task.customer_id] });
    qc.invalidateQueries({ queryKey: ["task-events", task.id] });
    qc.invalidateQueries({ queryKey: ["my-tasks"] });
  };
  const arch = useMutation({
    mutationFn: () => archive({ data: { id: task.id, archive: true } }),
    onSuccess: () => { toast.success("Task archived"); refresh(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const { data: auth } = useQuery({ queryKey: ["auth-user"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null, staleTime: 300_000 });
  const isAssignee = task.assignees.some((a) => a.user_id === auth);
  const canUpdate = task.can_manage || isAssignee;

  return (
    <Sheet title={task.title} onClose={onClose} footer={canUpdate && tab === "tracking" ? (
      <button onClick={() => setUpdating(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground active:scale-[0.99]">Update status</button>
    ) : tab === "team" && task.can_manage ? (
      <button onClick={() => setAssigning(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground"><Users className="size-4" /> Assign team</button>
    ) : undefined}>
      <div className="sticky top-0 z-10 bg-card px-4 pt-3">
        <div className="text-[12.5px] text-muted-foreground">{task.customer_name}{task.project_title ? ` · ${task.project_title}` : ""}</div>
        <div className="mt-2 grid grid-cols-3 rounded-full bg-muted p-1" role="tablist">
          {(["tracking", "team", "details"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-9 rounded-full text-[13px] font-semibold capitalize transition-all", tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              {t === "team" ? `Team (${task.assignees.length})` : t}
            </button>
          ))}
        </div>
      </div>
      <div key={tab} className="animate-fade-in p-4">
        {tab === "tracking" && <TrackingTimeline task={task} />}
        {tab === "team" && <TeamList task={task} me={auth ?? null} onChanged={refresh} />}
        {tab === "details" && (
          <div className="grid gap-2">
            {[
              ["Created", `${fmtTs(task.created_at)}${task.created_by_name ? ` · ${task.created_by_name}` : ""}`],
              ["Quantity", task.quantity != null ? `${task.quantity} ${task.unit ?? ""}` : null],
              ["Output per unit", task.per_unit_output != null ? `${task.per_unit_output} ${task.output_unit ?? ""}` : null],
              ["Total output", task.total_output != null ? `${task.total_output} ${task.output_unit ?? ""}` : null],
              ["Priority", task.priority],
              ["Due date", fmtDate(task.due_on)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                <span className="text-[12.5px] font-semibold text-muted-foreground">{k}</span>
                <span className="text-right text-[14px] font-bold capitalize text-foreground">{v || "—"}</span>
              </div>
            ))}
            <div className="rounded-md border border-border px-3 py-2.5">
              <div className="text-[12.5px] font-semibold text-muted-foreground">Instructions</div>
              <p className="mt-1 whitespace-pre-wrap text-[14.5px] font-medium text-foreground">{task.instructions || "—"}</p>
            </div>
            {task.can_manage && (
              <button onClick={() => confirm(`Archive "${task.title}"? History is kept.`) && arch.mutate()} className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:bg-muted">
                <Archive className="size-4" /> Archive task
              </button>
            )}
          </div>
        )}
      </div>
      {assigning && <AssignTeamSheet task={task} users={users} onClose={() => setAssigning(false)} onSaved={refresh} />}
      {updating && <StatusSheet task={task} onClose={() => setUpdating(false)} onSaved={refresh} />}
    </Sheet>
  );
}

function TrackingTimeline({ task }: { task: ClientTask }) {
  const get = useServerFn(getTaskEvents);
  const q = useQuery({ queryKey: ["task-events", task.id], queryFn: () => get({ data: { taskId: task.id } }) });
  const cur = stepIndex(task.status);
  const events = q.data ?? [];
  const history = [...events].reverse();
  return (
    <div className="grid gap-5">
      <ol className="relative">
        {TASK_STEPS.map((s, i) => {
          const done = i < cur || task.status === "completed";
          const active = i === cur && task.status !== "completed";
          const last = [...events].reverse().find((e) => e.status === s.key);
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < TASK_STEPS.length - 1 && <span className={cn("absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5", i < cur ? "bg-primary" : "bg-border")} />}
              <span className={cn("relative z-[1] grid size-6 shrink-0 place-items-center rounded-full border-2 transition", done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary bg-card" : "border-border bg-card")}>
                {done ? <Check className="size-3.5" strokeWidth={3} /> : active ? <span className="size-2.5 animate-pulse rounded-full bg-primary" /> : null}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className={cn("text-[14px]", done || active ? "font-bold text-foreground" : "text-muted-foreground")}>
                  {s.label}{s.key.startsWith("revision") && last?.meta?.round ? ` #${String(last.meta.round)}` : ""}
                </div>
                {last && <div className="text-[12px] text-muted-foreground">{last.actor_name || "System"} · {fmtTs(last.created_at)}</div>}
                {last?.note && <div className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-[13px] text-foreground">{last.note}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <div className="mb-2 text-[13px] font-bold text-foreground">Full history</div>
        {q.isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : (
          <ol className="grid gap-2">
            {history.map((e) => (
              <li key={e.id} className="flex gap-2.5 rounded-md border border-border px-3 py-2.5 animate-fade-in">
                <Avatar name={e.actor_name} url={e.actor_avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-foreground">
                    {e.status === "team_update" ? "Team updated" : e.status === "member_update" ? "Progress update" : stepLabel(e.status)}
                    {e.meta?.round ? ` #${String(e.meta.round)}` : ""}
                  </div>
                  {e.note && <div className="whitespace-pre-wrap text-[13px] text-foreground/85">{e.note}</div>}
                  <div className="text-[11.5px] text-muted-foreground">{e.actor_name || "System"} · {fmtTs(e.created_at)}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function StatusSheet({ task, onClose, onSaved }: { task: ClientTask; onClose: () => void; onSaved: () => void }) {
  const add = useServerFn(addTaskStatus);
  const cur = stepIndex(task.status);
  const suggested = useMemo<TaskStatus>(() => {
    if (task.status === "review") return "approved";
    return (TASK_STEPS[Math.min(cur + 1, TASK_STEPS.length - 1)]?.key ?? "completed") as TaskStatus;
  }, [cur, task.status]);
  const [status, setStatus] = useState<TaskStatus>(suggested);
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => add({ data: { taskId: task.id, status, note: note.trim() || null } }),
    onSuccess: () => { toast.success(`Status → ${stepLabel(status)}`); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Sheet title="Update status" onClose={onClose} footer={
      <button disabled={m.isPending} onClick={() => m.mutate()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-60">
        {m.isPending && <Loader2 className="size-4 animate-spin" />} Save update
      </button>
    }>
      <div className="grid gap-2 p-4">
        {TASK_STEPS.map((s) => (
          <button key={s.key} disabled={s.key === task.status} onClick={() => setStatus(s.key)}
            className={cn("flex h-11 items-center justify-between rounded-md border px-3 text-[14px] font-semibold transition disabled:opacity-40",
              status === s.key ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted")}>
            {s.label}{s.key === task.status && <span className="text-[11.5px] font-normal">current</span>}
            {status === s.key && <Check className="size-4" />}
          </button>
        ))}
        <Field label="Note (optional)" className="mt-2">
          <textarea rows={3} className={cn(input, "h-auto py-2")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client wants brighter background on 4 images" />
        </Field>
        <div className="text-[12px] text-muted-foreground">Your name, date and exact time are saved automatically.</div>
      </div>
    </Sheet>
  );
}

function TeamList({ task, me, onChanged }: { task: ClientTask; me: string | null; onChanged: () => void }) {
  const upd = useServerFn(updateMyAssignment);
  const m = useMutation({
    mutationFn: (v: { id: string; status?: AssigneeStatus; done_qty?: number }) => upd({ data: v }),
    onSuccess: () => { toast.success("Updated"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const assigned = task.assignees.reduce((s, a) => s + (a.quantity ?? 0), 0);
  const total = task.total_output;
  if (!task.assignees.length) return <div className="p-8 text-center text-[13px] text-muted-foreground">No one assigned yet.</div>;
  return (
    <div className="grid gap-2">
      {total != null && (
        <div className={cn("rounded-md px-3 py-2 text-[12.5px] font-semibold", assigned === total ? "bg-muted text-foreground" : "bg-primary/10 text-primary")}>
          Assigned {assigned} / {total} {task.output_unit ?? ""}{assigned !== total ? (assigned > total ? " — over total" : " — some output unassigned") : ""}
        </div>
      )}
      {task.assignees.map((a) => {
        const editable = task.can_manage || a.user_id === me;
        return (
          <div key={a.id} className="rounded-md border border-border p-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={a.name} url={a.avatar_url} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-bold text-foreground">{a.name || "Member"}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">{a.responsibility || "No responsibility set"}</div>
              </div>
              <div className="text-right font-mono text-[13px] font-bold">{a.done_qty}{a.quantity != null ? `/${a.quantity}` : ""}</div>
            </div>
            <div className="mt-2.5 flex gap-2">
              <select disabled={!editable || m.isPending} value={a.status} onChange={(e) => m.mutate({ id: a.id, status: e.target.value as AssigneeStatus })} className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-[13px] font-semibold disabled:opacity-60">
                {ASSIGNEE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {editable && (
                <input type="number" min="0" defaultValue={a.done_qty} aria-label="Done quantity"
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== a.done_qty) m.mutate({ id: a.id, done_qty: v }); }}
                  className="h-9 w-24 rounded-md border border-border bg-background px-2 text-[13px] font-mono" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssignTeamSheet({ task, users, onClose, onSaved }: { task: ClientTask; users: AssignableUser[]; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(setTaskAssignees);
  const [rows, setRows] = useState(task.assignees.map((a) => ({ user_id: a.user_id, responsibility: a.responsibility ?? "", quantity: a.quantity != null ? String(a.quantity) : "", status: a.status })));
  const [pick, setPick] = useState("");
  const available = users.filter((u) => !rows.some((r) => r.user_id === u.user_id));
  const nameOf = (id: string) => users.find((u) => u.user_id === id)?.full_name || task.assignees.find((a) => a.user_id === id)?.name || "Member";
  const assigned = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const m = useMutation({
    mutationFn: () => save({ data: { taskId: task.id, assignees: rows.map((r) => ({ user_id: r.user_id, responsibility: r.responsibility.trim() || null, quantity: r.quantity === "" ? null : Number(r.quantity), status: r.status })) } }),
    onSuccess: () => { toast.success("Team saved"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Sheet title="Assign team" onClose={onClose} footer={
      <button disabled={m.isPending} onClick={() => m.mutate()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-60">
        {m.isPending && <Loader2 className="size-4 animate-spin" />} Save team
      </button>
    }>
      <div className="grid gap-3 p-4">
        <div className="flex gap-2">
          <select className={input} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add a team member…</option>
            {available.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.personal_gmail}</option>)}
          </select>
          <button disabled={!pick} onClick={() => { setRows((r) => [...r, { user_id: pick, responsibility: "", quantity: "", status: "not_started" }]); setPick(""); }}
            className="h-11 shrink-0 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Add</button>
        </div>
        {task.total_output != null && (
          <div className="text-[12.5px] font-semibold text-muted-foreground">Quantity assigned: <span className="font-mono text-foreground">{assigned} / {task.total_output}</span></div>
        )}
        {rows.map((r, i) => (
          <div key={r.user_id} className="grid gap-2 rounded-md border border-border p-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[14.5px] font-bold">{nameOf(r.user_id)}</span>
              <button onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
            </div>
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <input className={input} placeholder="Responsibility (e.g. Image Production)" value={r.responsibility} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, responsibility: e.target.value } : y)))} />
              <input className={cn(input, "font-mono")} type="number" min="0" placeholder="Qty" value={r.quantity} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, quantity: e.target.value } : y)))} />
            </div>
          </div>
        ))}
        {!rows.length && <div className="p-6 text-center text-[13px] text-muted-foreground">No members yet — add from the list above.</div>}
      </div>
    </Sheet>
  );
}

/** Compact "My Tasks" list for the dashboard. */
export function MyTasksPanel({ tasks, users }: { tasks: ClientTask[]; users: AssignableUser[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = tasks.find((t) => t.id === openId) ?? null;
  if (!tasks.length) return null;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.map((t) => <TaskCard key={t.id} t={t} showClient onOpen={() => setOpenId(t.id)} />)}
      </div>
      {open && <TaskDetailSheet task={open} users={users} onClose={() => setOpenId(null)} />}
    </>
  );
}
