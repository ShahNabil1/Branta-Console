import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SERVICE_TRACKS, TRACK_FIELDS, getHubProject, updateHubProjectDetails, type HubProjectDetail, type ServiceTrack } from "@/lib/projects-hub.functions";
import { PROJECT_ROLES, listProjectMembers, setProjectMember, type ProjectRole } from "@/lib/project-team.functions";
import { listAssignableUsers } from "@/lib/leads.functions";
import { stepLabel } from "@/lib/client-tasks.functions";
import { STATUS_LABEL, trackLabel } from "./app.projects.index";

export const Route = createFileRoute("/_authenticated/app/projects/$id")({
  head: () => ({
    meta: [
      { title: "Project · Branta Tech Console" },
      { name: "description", content: "Project scope, team roles, service-track links, tasks and activity." },
      { property: "og:title", content: "Project · Branta Tech Console" },
      { property: "og:description", content: "Project scope, team roles, service-track links, tasks and activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = Route.useParams();
  const get = useServerFn(getHubProject);
  const q = useQuery({ queryKey: ["hub-project", id], queryFn: () => get({ data: { id } }) });
  const [edit, setEdit] = useState(false);
  if (q.isLoading) return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  if (q.error || !q.data) return <div className="p-8 text-sm text-destructive">{(q.error as Error)?.message ?? "Project not found"}</div>;
  const p = q.data;
  const fields = p.service_track ? TRACK_FIELDS[p.service_track] : [];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <Link to="/app/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Projects</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-lg font-semibold text-foreground">{p.title}</h1>
          <p className="text-xs text-muted-foreground">
            {p.category === "internal" ? "Internal / Official" : p.customer_code
              ? <Link to="/app/customers/$code" params={{ code: p.customer_code }} className="hover:text-primary">{p.client_name}</Link>
              : p.client_name}
            {" · "}{trackLabel(p.service_track)} · {p.project_type === "monthly" ? "Monthly retainer" : "One-time"} · {STATUS_LABEL[p.status] ?? p.status}
          </p>
        </div>
        {p.canManage && <Button size="sm" variant="outline" onClick={() => setEdit(true)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit details</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Scope & documents">
            <Row label="Scope of Work" value={p.sow_doc_url} link />
            <Row label="Client requirements" value={p.requirements_doc_url} link />
            <Row label="Start" value={p.starts_on} /><Row label="Deadline" value={p.due_on} />
            {p.project_type === "monthly" && <><Row label="Billing day" value={p.billing_day?.toString() ?? null} /><Row label="Monthly deliverables" value={p.monthly_deliverables} /></>}
            {p.notes && <p className="whitespace-pre-wrap pt-2 text-xs text-muted-foreground">{p.notes}</p>}
          </Panel>
          <Panel title={`${trackLabel(p.service_track)} workspace`}>
            {fields.length === 0 ? <p className="text-xs text-muted-foreground">Choose a service track to add its links.</p>
              : fields.map((f) => <Row key={f.key} label={f.label} value={p.track_meta[f.key] ?? null} link={f.kind === "url"} />)}
          </Panel>
          <Panel title={`Tasks (${p.task_done}/${p.task_total} done)`}>
            {p.tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasks yet.{p.customer_code ? " Create tasks from the client's Tasks tab and link them to this project." : ""}</p>
            ) : p.tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
                <span className="min-w-0 break-words">{t.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{stepLabel(t.status as never)}{t.revision_round ? ` · R${t.revision_round}` : ""}{t.due_on ? ` · ${t.due_on}` : ""}</span>
              </div>
            ))}
          </Panel>
        </div>
        <div className="space-y-4">
          <TeamPanel projectId={p.id} />
          <Panel title="Activity">
            {p.activity.length === 0 ? <p className="text-xs text-muted-foreground">No activity.</p> : p.activity.map((a) => (
              <div key={a.id} className="border-b border-border py-1.5 text-xs last:border-0">
                <div className="text-foreground">{a.body}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{a.actor_name ?? "System"} · {new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
      {edit && <EditDialog p={p} onClose={() => setEdit(false)} />}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded border border-border bg-card p-4"><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>{children}</section>;
}
function Row({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {!value ? <span className="text-xs text-muted-foreground">—</span> : link
        ? <a href={value} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all text-right text-xs text-primary hover:underline">Open<ExternalLink className="h-3 w-3" /></a>
        : <span className="min-w-0 break-words text-right text-xs">{value}</span>}
    </div>
  );
}

function TeamPanel({ projectId }: { projectId: string }) {
  const list = useServerFn(listProjectMembers);
  const q = useQuery({ queryKey: ["project-members", projectId], queryFn: () => list({ data: { projectId } }) });
  const [editing, setEditing] = useState<{ userId: string; roles: ProjectRole[] } | null>(null);
  const active = (q.data?.members ?? []).filter((m) => m.active);
  return (
    <Panel title="Team">
      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : active.length === 0
        ? <p className="text-xs text-muted-foreground">No team members yet.</p>
        : active.map((m) => (
          <button key={m.id} disabled={!q.data?.canManage} onClick={() => setEditing({ userId: m.user_id, roles: m.roles })}
            className="flex w-full items-center gap-2 border-b border-border py-2 text-left last:border-0 disabled:cursor-default">
            {m.avatar ? <img src={m.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
              : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-medium">{(m.name ?? "?").slice(0, 1)}</div>}
            <div className="min-w-0">
              <div className="break-words text-sm">{m.name ?? "Member"}</div>
              <div className="text-[11px] text-muted-foreground">{m.roles.map((r) => PROJECT_ROLES.find((x) => x.key === r)?.label ?? r).join(" · ")}</div>
            </div>
          </button>
        ))}
      {q.data?.canManage && (
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setEditing({ userId: "", roles: ["specialist"] })}>
          <UserPlus className="mr-1 h-3.5 w-3.5" />Add member
        </Button>
      )}
      {editing && <MemberDialog projectId={projectId} init={editing} existing={active.map((m) => m.user_id)} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function MemberDialog({ projectId, init, existing, onClose }: { projectId: string; init: { userId: string; roles: ProjectRole[] }; existing: string[]; onClose: () => void }) {
  const usersFn = useServerFn(listAssignableUsers);
  const setFn = useServerFn(setProjectMember);
  const users = useQuery({ queryKey: ["assignable-users"], queryFn: () => usersFn() });
  const qc = useQueryClient();
  const [userId, setUserId] = useState(init.userId);
  const [roles, setRoles] = useState<ProjectRole[]>(init.roles);
  const isNew = !init.userId;
  const m = useMutation({
    mutationFn: (r: ProjectRole[]) => setFn({ data: { projectId, userId, roles: r } }),
    onSuccess: () => {
      toast.success("Team updated");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["hub-project", projectId] });
      qc.invalidateQueries({ queryKey: ["hub-projects"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (r: ProjectRole) => setRoles((x) => x.includes(r) ? x.filter((y) => y !== r) : [...x, r]);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "Add team member" : "Edit roles"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Employee</Label>
            <select disabled={!isNew} className="h-9 w-full rounded border border-input bg-background px-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select employee…</option>
              {(users.data ?? []).filter((u) => !isNew || !existing.includes(u.user_id)).map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name ?? "Unnamed"}</option>)}
            </select></div>
          <div className="grid gap-2"><Label>Roles (one or more)</Label>
            {PROJECT_ROLES.map((r) => (
              <label key={r.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={roles.includes(r.key)} onCheckedChange={() => toggle(r.key)} />{r.label}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">They will get a Telegram alert with their roles.</p>
        </div>
        <DialogFooter className="gap-2">
          {!isNew && <Button variant="outline" className="text-destructive" disabled={m.isPending} onClick={() => m.mutate([])}>Remove from team</Button>}
          <Button disabled={m.isPending || !userId || roles.length === 0} onClick={() => m.mutate(roles)}>
            {m.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ p, onClose }: { p: HubProjectDetail; onClose: () => void }) {
  const upd = useServerFn(updateHubProjectDetails);
  const qc = useQueryClient();
  const [track, setTrack] = useState<ServiceTrack>(p.service_track ?? "other");
  const [status, setStatus] = useState(p.status);
  const [due, setDue] = useState(p.due_on ?? "");
  const [sow, setSow] = useState(p.sow_doc_url ?? "");
  const [req, setReq] = useState(p.requirements_doc_url ?? "");
  const [meta, setMeta] = useState<Record<string, string>>(p.track_meta);
  useEffect(() => { setMeta(p.track_meta); }, [p.track_meta]);
  const m = useMutation({
    mutationFn: () => upd({ data: { id: p.id, service_track: track, status: status as any, due_on: due || null, sow_doc_url: sow || null, requirements_doc_url: req || null, track_meta: meta } }),
    onSuccess: () => { toast.success("Project updated"); qc.invalidateQueries({ queryKey: ["hub-project", p.id] }); qc.invalidateQueries({ queryKey: ["hub-projects"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sel = "h-9 w-full rounded border border-input bg-background px-2 text-sm";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit project details</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Track</Label><select className={sel} value={track} onChange={(e) => setTrack(e.target.value as ServiceTrack)}>
              {SERVICE_TRACKS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
            <div><Label>Status</Label><select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><Label>Deadline</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          <div><Label>Scope of Work link</Label><Input type="url" value={sow} onChange={(e) => setSow(e.target.value)} /></div>
          <div><Label>Client requirements link</Label><Input type="url" value={req} onChange={(e) => setReq(e.target.value)} /></div>
          {TRACK_FIELDS[track].map((f) => (
            <div key={f.key}><Label>{f.label}</Label>
              <Input type={f.kind === "url" ? "url" : "text"} value={meta[f.key] ?? ""} onChange={(e) => setMeta((x) => ({ ...x, [f.key]: e.target.value }))} /></div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
