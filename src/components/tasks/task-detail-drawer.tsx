// Task detail: the expense drawer surface with company-profile tabs. Managers
// (C.E.O / C.O.O / HR / Group Admin) edit and review; assignees submit, comment,
// tick subtasks and log activity; everyone else in the company reads.
import { useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Activity, Archive, Eye, BadgeCheck, BookOpen, CalendarDays, Check, Crown, ExternalLink, Package, Play, UserCheck, FileText, Link2, ListChecks, MessageSquare, Plus, RotateCcw, Send, Trash2, Upload, X } from "lucide-react";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TestLoader } from "@/components/ui/test-loader";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ExpenseDrawerContent, ExpenseDrawerHeader } from "@/components/finance/expense-drawer";
import { SearchableSelect } from "@/components/finance/searchable-select";
import {
  addCompanyTaskAssets, addCompanyTaskComment, addCompanyTaskNote, addCompanyTaskSubtask, approveCompanyTask, archiveCompanyTask,
  deleteCompanyTaskComment, getCompanyTask, reviewCompanyTaskSubmission, setCompanyTaskAssignees, setMyCompanyTaskStatus,
  requestTaskAssetUpload, requestTaskFileUpload, submitCompanyTaskWork, updateCompanyTask, updateCompanyTaskAsset, updateCompanyTaskSubtask, type CompanyTaskDetail, type TaskFile, type TaskMember,
} from "@/lib/company-tasks.functions";
import { MAX_SUBMISSION_FILES, MAX_SUBMISSION_FILE_BYTES, MAX_TASK_ASSETS, TASK_PRIORITIES, TASK_STATUSES, parseAssetLinks, statusLabel, submissionFileKind } from "@/lib/company-task-rules";
import { ReceiptPreview, ReceiptThumb, type ReceiptMedia } from "@/components/finance/receipt-media";
import { ExpenseReceiptsGallery } from "@/components/finance/expense-receipts-gallery";
import { downloadFile } from "@/components/finance/download-file";
import { cn } from "@/lib/utils";
import { TaskAssetComposer, type ComposedItem } from "./task-asset-composer";
import { AREA, AvatarStack, FIELD, LABEL, PersonAvatar, PriorityBadge, SegmentedProgress, StatusChip, fmtDateTime, fmtDue, spring, AssetKindToggle, JourneyBar, type AssetKind } from "./task-ui";

type Tab = "overview" | "submissions" | "comments" | "activity";
type UpdPatch = { id: string; title?: string; description?: string | null; priority?: "low" | "normal" | "high" | "urgent"; status?: "todo" | "doing" | "in_review" | "done"; due_on?: string | null; due_time?: string | null; tags?: string[]; project_id?: string | null };
type SubPatch = { id: string; done?: boolean; title?: string; description?: string | null; assignee_id?: string | null; remove?: boolean };
type AssetPatch = { id: string; subtask_id?: string | null; assignee_id?: string | null; title?: string | null; kind?: AssetKind; remove?: boolean };

const ACTIVITY_TEXT: Record<string, string> = {
  created: "created the task", updated: "updated the task", status: "changed the status", approved: "approved the task", archived: "archived the task", unarchived: "restored the task", published: "made the task live", scheduled: "scheduled the task", drafted: "moved the task to drafts",
  assignees: "changed the assignees", subtask_added: "added a subtask", subtask_removed: "removed a subtask", subtask_done: "completed a subtask",
  subtask_reopened: "reopened a subtask", subtask_edited: "edited a subtask", assets_added: "added assets", asset_removed: "removed an asset",
  asset_updated: "updated an asset", submitted: "submitted work", submission_approved: "approved a submission", revision_requested: "requested a revision",
  my_status: "updated their progress", commented: "commented", comment_removed: "removed a comment", note: "added a note",
};

export function TaskDetailDrawer({ taskId, onClose, members, projects }: {
  taskId: string | null; onClose: () => void; members: TaskMember[]; projects: { id: string; title: string }[];
}) {
  return (
    <Sheet open={!!taskId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <ExpenseDrawerContent className="sm:max-w-2xl">
        {taskId ? <Body taskId={taskId} onClose={onClose} members={members} projects={projects} /> : null}
      </ExpenseDrawerContent>
    </Sheet>
  );
}

function Body({ taskId, onClose, members, projects }: { taskId: string; onClose: () => void; members: TaskMember[]; projects: { id: string; title: string }[] }) {
  const qc = useQueryClient();
  const get = useServerFn(getCompanyTask);
  const q = useQuery({ queryKey: ["company-task", taskId], queryFn: () => get({ data: { id: taskId } }) });
  const [tab, setTab] = useState<Tab>("overview");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["company-task", taskId] }); qc.invalidateQueries({ queryKey: ["company-tasks"] }); };

  if (q.isLoading) return <div className="grid flex-1 place-items-center"><TestLoader /></div>;
  if (q.error || !q.data) return <div className="p-6 text-[13px] font-semibold text-destructive">{(q.error as Error)?.message ?? "Task not found."}</div>;
  const t = q.data;
  return (
    <>
      <ExpenseDrawerHeader>
        <div className="flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
          <StatusChip value={t.status} /><PriorityBadge value={t.priority} />
          {t.approved_at && <span className="inline-flex items-center gap-1 rounded border border-status-converted/40 px-1.5 py-0.5 text-[10.5px] font-bold text-status-converted"><BadgeCheck className="size-3" />Approved</span>}
        </div>
        <SheetTitle className="mt-2 text-[20px] font-extrabold leading-tight tracking-tight">{t.title}</SheetTitle>
        <SheetDescription className="sr-only">Task details</SheetDescription>
      </ExpenseDrawerHeader>
      <div className="border-b border-border px-4">
        <UnderlineTabs<Tab> value={tab} onChange={setTab} ariaLabel="Task sections" items={[
          { id: "overview", label: "Overview", icon: FileText },
          { id: "submissions", label: "Submissions", icon: Upload, count: t.submissions.length },
          { id: "comments", label: "Comments", icon: MessageSquare, count: t.comment_rows.length },
          { id: "activity", label: "Activity", icon: Activity },
        ]} />
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
            {tab === "overview" && <Overview t={t} members={members} projects={projects} refresh={refresh} />}
            {tab === "submissions" && <Submissions t={t} refresh={refresh} />}
            {tab === "comments" && <Comments t={t} refresh={refresh} />}
            {tab === "activity" && <ActivityTab t={t} refresh={refresh} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <Footer t={t} refresh={refresh} onClose={onClose} />
    </>
  );
}

function useAct<T>(fn: (v: T) => Promise<unknown>, refresh: () => void, ok?: string) {
  return useMutation({ mutationFn: fn, onSuccess: () => { if (ok) toast.success(ok); refresh(); }, onError: (e: Error) => toast.error(e.message) });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3 py-1.5">
      <span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Ownership({ t, edit, addable, onAdd, onRemove }: { t: CompanyTaskDetail; edit: boolean; addable: { value: string; label: string; avatar: string; hint?: string | null }[]; onAdd: (id: string) => void; onRemove: (a: { user_id: string; name: string }) => void }) {
  const creator = t.created_by_person;
  const assignedBy = (uid: string) => {
    const ev = t.activity.find((e) => e.kind === "assignees" && Array.isArray(e.detail?.added) && (e.detail.added as string[]).includes(uid));
    return ev ? t.people[ev.actor_id] ?? creator : creator;
  };
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <PersonAvatar name={creator?.name ?? "—"} src={creator?.avatar_url} size={40} className="ring-2 ring-brand/40" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-brand"><Crown className="size-3" />Task owner · Created by</div>
          <div className="truncate text-[15px] font-extrabold">{creator?.name ?? "—"}</div>
        </div>
        <div className="text-right"><div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Created</div><div className="font-mono text-[12px] font-bold">{fmtDateTime(t.created_at)}</div></div>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2"><div className="flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70"><UserCheck className="size-3" />Assigned to</div>
          {edit && <div className="ml-auto w-44"><SearchableSelect items={addable} value="" onChange={(v) => v && onAdd(v)} placeholder="+ Add assignee" emptyText="No more members" /></div>}</div>
        {!t.assignee_rows.length && <p className="mt-1.5 text-[12.5px] text-muted-foreground">No one yet</p>}
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {t.assignee_rows.map((a) => {
            const by = assignedBy(a.user_id);
            return (
              <li key={a.user_id} className={cn("flex items-center gap-2.5 rounded-lg border px-2.5 py-2", a.user_id === t.me ? "border-brand/50 bg-brand/5" : "border-border")}>
                <PersonAvatar name={a.name} src={a.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-extrabold">{a.name}{a.user_id === t.me && <span className="ml-1 text-[10px] font-bold text-brand">(You)</span>}</div>
                  <div className="truncate text-[11px] font-semibold text-muted-foreground">Assigned by {by?.name ?? "—"}</div>
                </div>
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase">{statusLabel(a.status === "submitted" ? "in_review" : a.status === "approved" ? "done" : a.status) || a.status}</span>
                {edit && <button type="button" aria-label={`Remove ${a.name}`} onClick={() => onRemove(a)} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" /></button>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SubDesc({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [v, setV] = useState(value ?? "");
  return <textarea value={v} onChange={(e) => setV(e.target.value)} maxLength={2000} rows={1} aria-label="Subtask description" placeholder="Add details for this subtask"
    onBlur={() => { if (v.trim() !== (value ?? "")) onSave(v.trim() || null); }}
    className="mt-0.5 w-full resize-y rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] font-medium leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-brand focus:bg-card" />;
}

function ProgressGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" opacity="0.3" />
      <path d="M10 2.75a7.25 7.25 0 0 1 7.25 7.25" />
      <path d="M6.75 10.25 8.9 12.4l4.35-4.65" />
    </svg>
  );
}

function Overview({ t, members, projects, refresh }: { t: CompanyTaskDetail; members: TaskMember[]; projects: { id: string; title: string }[]; refresh: () => void }) {
  const upd = useServerFn(updateCompanyTask), setAsg = useServerFn(setCompanyTaskAssignees), addSub = useServerFn(addCompanyTaskSubtask);
  const updSub = useServerFn(updateCompanyTaskSubtask), addAssets = useServerFn(addCompanyTaskAssets), updAsset = useServerFn(updateCompanyTaskAsset);
  const myStatus = useServerFn(setMyCompanyTaskStatus), submit = useServerFn(submitCompanyTaskWork);
  const edit = t.can.edit, work = t.can.work;
  const u = useAct((p: UpdPatch) => upd({ data: p }), refresh);
  const asg = useAct((ids: string[]) => setAsg({ data: { id: t.id, userIds: ids } }), refresh);
  const sub = useAct((p: { title: string; description?: string | null; assignee_id: string | null }) => addSub({ data: { taskId: t.id, ...p } }), refresh);
  const subU = useAct((p: SubPatch) => updSub({ data: p }), refresh);
  const presignAsset = useServerFn(requestTaskAssetUpload);
  const [assetPhase, setAssetPhase] = useState<string | null>(null);
  const assets = useAct(async (items: ComposedItem[]) => {
    try {
      const files = items.filter((x) => x.file);
      const rows = [];
      let n = 0;
      for (const it of items) {
        if (it.file) {
          const f = it.file; n++;
          setAssetPhase(`Uploading ${n}/${files.length}…`);
          const mime = f.type || "application/octet-stream";
          const { url, key } = await presignAsset({ data: { taskId: t.id, name: f.name, mime, size: f.size } });
          const res = await fetch(url, { method: "PUT", headers: { "Content-Type": mime }, body: f });
          if (!res.ok) throw new Error(`${f.name} could not be uploaded.`);
          rows.push({ kind: it.kind, file: { key, name: f.name, mime, size: f.size }, subtask_id: it.subtask || null, assignee_id: it.assignee_id || null });
        } else rows.push({ kind: it.kind, url: it.url, subtask_id: it.subtask || null, assignee_id: it.assignee_id || null });
      }
      return await addAssets({ data: { taskId: t.id, assets: rows } });
    } finally { setAssetPhase(null); }
  }, refresh, "Added to the task");
  const assetU = useAct((p: AssetPatch) => updAsset({ data: p }), refresh);
  const mine = useAct((s: "todo" | "doing") => myStatus({ data: { taskId: t.id, status: s } }), refresh, "Progress updated");
  const confirm = useConfirm();
  const [assetIdx, setAssetIdx] = useState<number | null>(null);
  const [assetGallery, setAssetGallery] = useState(false);
  const fileAssets = t.asset_rows.filter((a) => a.file);
  const assetMedia = fileAssets.map((a) => ({ ...toMedia(a.file!), caption: a.title || a.file!.name }));
  const sendAsset = useAct((p: { assetId: string; link: string; note: string }) => submit({ data: { taskId: t.id, assetId: p.assetId, link: p.link || null, note: p.note || null } }), refresh, "Submitted for review");

  const [title, setTitle] = useState(t.title);
  const [desc, setDesc] = useState(t.description ?? "");
  const [tag, setTag] = useState("");
  const [newSub, setNewSub] = useState("");
  const [newSubDesc, setNewSubDesc] = useState("");
  const [openAsset, setOpenAsset] = useState<string | null>(null);
  const [assetLink, setAssetLink] = useState("");
  const [assetNote, setAssetNote] = useState("");

  const meRow = t.assignee_rows.find((a) => a.user_id === t.me);
  const assigneeIds = t.assignee_rows.map((a) => a.user_id);
  const addable = members.filter((m) => !assigneeIds.includes(m.user_id)).map((m) => ({ value: m.user_id, label: m.name, avatar: m.avatar_url ?? "", hint: m.code }));
  const team = t.assignee_rows.map((a) => ({ value: a.user_id, label: a.name, avatar: a.avatar_url ?? "" }));
  const P = (id: string | null) => (id ? t.people[id] ?? t.assignee_rows.find((a) => a.user_id === id) : undefined);

  return (
    <div className="space-y-5">
      {edit && (
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Task title"
          onBlur={() => { if (title.trim() && title.trim() !== t.title) u.mutate({ id: t.id, title: title.trim() }); }} className={`${FIELD} text-[14px]`} />
      )}
      <Ownership t={t} edit={edit} addable={addable} onAdd={(v) => asg.mutate([...assigneeIds, v])}
        onRemove={async (a) => { if (await confirm({ tone: "danger", title: `Remove ${a.name} from this task?`, subject: "Their subtasks and assets become unassigned.", confirmLabel: "Remove" })) asg.mutate(assigneeIds.filter((x) => x !== a.user_id)); }} />
      <div className="divide-y divide-border/60 rounded-xl border border-border bg-card px-3.5 py-1">
        <Row label="Due date">
          {edit ? (
            <div className="flex gap-2">
              <Input type="date" defaultValue={t.due_on ?? ""} aria-label="Due date" onChange={(e) => u.mutate({ id: t.id, due_on: e.target.value || null, ...(e.target.value ? {} : { due_time: null }) })} className={`${FIELD} h-9 w-44`} />
              <Input type="time" defaultValue={t.due_time?.slice(0, 5) ?? ""} aria-label="Due time" disabled={!t.due_on} onBlur={(e) => { const v = e.target.value || null; if (v !== (t.due_time?.slice(0, 5) ?? null)) u.mutate({ id: t.id, due_time: v }); }} className={`${FIELD} h-9 w-32 font-mono`} />
            </div>
          ) : <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] font-bold"><CalendarDays className="size-3.5 text-muted-foreground" />{fmtDue(t.due_on, t.due_time)}</span>}
        </Row>
        <Row label="Status">
          {edit ? <div className="w-44"><SearchableSelect searchable={false} items={TASK_STATUSES.map((s) => ({ value: s.key, label: s.label }))} value={t.status} onChange={(v) => v && v !== t.status && u.mutate({ id: t.id, status: v as "todo" })} /></div> : <StatusChip value={t.status} />}
        </Row>
        <Row label="Priority">
          {edit ? <div className="w-44"><SearchableSelect searchable={false} items={TASK_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))} value={t.priority} onChange={(v) => v && v !== t.priority && u.mutate({ id: t.id, priority: v as "normal" })} /></div> : <PriorityBadge value={t.priority} />}
        </Row>
        <Row label="Project">
          {edit ? <div className="max-w-xs"><SearchableSelect clearable items={projects.map((p) => ({ value: p.id, label: p.title }))} value={t.project_id ?? ""} onChange={(v) => u.mutate({ id: t.id, project_id: v || null })} placeholder="— Not linked —" emptyText="No projects" /></div>
            : <span className="text-[12.5px] font-bold">{t.project_title ?? "—"}</span>}
        </Row>
        <Row label="Tags">
          <div className="flex flex-wrap items-center gap-1.5">
            {t.tags.map((g) => (
              <span key={g} className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11.5px] font-bold">{g}
                {edit && <button type="button" aria-label={`Remove ${g}`} onClick={() => u.mutate({ id: t.id, tags: t.tags.filter((x) => x !== g) })}><X className="size-3 text-muted-foreground" /></button>}
              </span>
            ))}
            {edit && <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} aria-label="Add tag" placeholder="Add more" enterKeyHint="done"
              onKeyDown={(e) => { if (e.key === "Enter" && tag.trim() && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); if (!t.tags.includes(tag.trim())) u.mutate({ id: t.id, tags: [...t.tags, tag.trim()] }); setTag(""); } }}
              className="w-24 bg-transparent text-[12px] font-semibold outline-none placeholder:text-muted-foreground/70" />}
            {!edit && !t.tags.length && <span className="text-[12.5px] text-muted-foreground">—</span>}
          </div>
        </Row>
        {t.approved_by_person && <Row label="Approved by"><span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold"><PersonAvatar name={t.approved_by_person.name} src={t.approved_by_person.avatar_url} size={20} />{t.approved_by_person.name} · {fmtDateTime(t.approved_at!)}</span></Row>}
      </div>

      {work && meRow && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-brand/10 text-brand"><ProgressGlyph /></span><span className="text-[13px] font-extrabold">My progress</span>
            <div className="ml-auto inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {([["todo", "Not started", RotateCcw], ["doing", "Working on it", Play]] as const).map(([k, label, Icon]) => {
                const on = meRow.status === k || (k === "doing" && meRow.status === "revision");
                const locked = meRow.status === "submitted" || meRow.status === "approved";
                return (
                  <button key={k} type="button" disabled={mine.isPending || on || locked} aria-pressed={on}
                    onClick={async () => {
                      const ok = await confirm({ tone: k === "doing" ? "info" : "warning", icon: Icon, title: k === "doing" ? "Start working on this task?" : "Mark as not started?",
                        subject: k === "doing" ? "Your status changes to Doing and the team sees you are on it." : "Your status goes back to To do.", confirmLabel: label });
                      if (ok) mine.mutate(k);
                    }}
                    className={cn("relative inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-[12.5px] font-extrabold transition-colors disabled:cursor-default", on ? (k === "doing" ? "text-primary-foreground" : "text-foreground") : "text-muted-foreground hover:bg-card/70 hover:text-foreground", locked && !on && "opacity-50")}>
                    {on && <motion.span layoutId="my-progress-pill" className={cn("absolute inset-0 rounded-md shadow-sm", k === "doing" ? "bg-brand" : "bg-card ring-1 ring-border")} transition={spring} />}
                    <span className="relative inline-flex items-center gap-2">{mine.isPending && mine.variables === k ? <TestLoader /> : <span className={cn("grid size-5 place-items-center rounded-full", on ? (k === "doing" ? "bg-primary-foreground/20" : "bg-muted") : "bg-muted/70")}><Icon className="size-3" /></span>}{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4"><JourneyBar status={meRow.status} /></div>
          {(meRow.status === "submitted" || meRow.status === "approved") && <p className="mt-2 text-[11.5px] font-semibold text-muted-foreground">{meRow.status === "approved" ? "Your work is approved." : "Your work is waiting for review."}</p>}
        </div>
      )}

      <section>
        <div className={LABEL}>Description</div>
        {edit ? (
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} aria-label="Description"
            onBlur={() => { if (desc !== (t.description ?? "")) u.mutate({ id: t.id, description: desc }); }} className={`mt-1.5 ${AREA}`} />
        ) : (
          <blockquote className="mt-2 whitespace-pre-wrap border-l-[3px] border-brand pl-4 text-[14.5px] font-bold leading-relaxed tracking-tight text-foreground">{t.description || <span className="font-semibold text-muted-foreground">No description.</span>}</blockquote>
        )}
      </section>

      <section>
        <div className="flex items-center gap-1.5"><ListChecks className="size-4 text-muted-foreground" /><span className={LABEL}>Subtasks</span><span className="ml-auto font-mono text-[11px] text-muted-foreground">{t.subtasks_done}/{t.subtasks_total}</span></div>
        {t.subtasks_total > 0 && <div className="mt-2"><SegmentedProgress done={t.subtasks_done} total={t.subtasks_total} /></div>}
        <ul className="mt-2 space-y-1.5">
          <AnimatePresence initial={false}>
            {[...t.subtasks].sort((a, b) => Number(b.assignee_id === t.me) - Number(a.assignee_id === t.me)).map((s) => {
              const who = P(s.assignee_id);
              const isMine = s.assignee_id === t.me;
              return (
                <motion.li key={s.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring}
                  className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-1.5", isMine ? "border-brand/50 bg-brand/5 shadow-sm" : "border-border bg-card")}>
                  <motion.button type="button" whileTap={{ scale: 0.85 }} disabled={!work || subU.isPending} aria-label={s.done ? "Mark not done" : "Mark done"}
                    onClick={() => subU.mutate({ id: s.id, done: !s.done })}
                    className={cn("grid size-4.5 shrink-0 place-items-center rounded border transition-colors", s.done ? "border-brand bg-brand text-white" : "border-border bg-card", !work && "cursor-default")}>
                    {s.done && <Check className="size-3" />}
                  </motion.button>
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-[12.5px] font-semibold transition-colors", s.done && "text-muted-foreground line-through")}>{s.title}</div>
                    {edit ? <SubDesc value={s.description} onSave={(v) => subU.mutate({ id: s.id, description: v })} />
                      : s.description ? <p className="mt-0.5 whitespace-pre-wrap border-l-2 border-brand/50 pl-2 text-[11.5px] font-medium leading-relaxed text-muted-foreground">{s.description}</p> : null}
                  </div>
                  {isMine && <span className="shrink-0 rounded bg-brand px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-primary-foreground">Mine</span>}
                  {edit ? (
                    <div className="w-36 shrink-0"><SearchableSelect clearable searchable={false} items={team} value={s.assignee_id ?? ""} onChange={(v) => subU.mutate({ id: s.id, assignee_id: v || null })} placeholder="Anyone" emptyText="No assignees" /></div>
                  ) : who ? <PersonAvatar name={who.name} src={who.avatar_url} size={20} /> : null}
                  {edit && <button type="button" aria-label="Remove subtask" onClick={async () => { if (await confirm({ tone: "danger", title: "Remove this subtask?", subject: s.title, confirmLabel: "Remove" })) subU.mutate({ id: s.id, remove: true }); }}><Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" /></button>}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {edit && (
          <div className="mt-2 flex gap-2">
            <div className="grid flex-1 gap-1.5">
              <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} maxLength={300} aria-label="New subtask" placeholder="Add subtask" className={`${FIELD} h-9`} />
              <textarea value={newSubDesc} onChange={(e) => setNewSubDesc(e.target.value)} maxLength={2000} rows={2} aria-label="Subtask description" placeholder="What exactly needs to be done (optional)" className={AREA} />
            </div>
            <Button type="button" variant="outline" disabled={!newSub.trim() || sub.isPending} onClick={() => { sub.mutate({ title: newSub.trim(), description: newSubDesc.trim() || null, assignee_id: null }); setNewSub(""); setNewSubDesc(""); }} className="h-9 gap-1 rounded-md"><Plus className="size-4" />Add</Button>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-1.5"><Link2 className="size-4 text-muted-foreground" /><span className={LABEL}>Assets & references</span><span className="ml-auto font-mono text-[11px] text-muted-foreground">{t.asset_rows.length}/{MAX_TASK_ASSETS}</span></div>
        <ul className="mt-2 space-y-1.5">
          {[...t.asset_rows].sort((a, b) => Number(b.assignee_id === t.me) - Number(a.assignee_id === t.me)).map((a) => {
            const i = t.asset_rows.indexOf(a);
            const who = P(a.assignee_id);
            const isMine = a.assignee_id === t.me;
            const isRef = a.kind === "reference";
            const subs = t.submissions.filter((s) => s.asset_id === a.id);
            const latest = subs[0];
            const canSend = work && (edit || !a.assignee_id || a.assignee_id === t.me);
            return (
              <li key={a.id} className={cn("rounded-lg border px-2.5 py-2", isMine ? "border-brand/50 bg-brand/5 shadow-sm" : "border-border bg-card")}>
                <div className="flex items-center gap-2">
                  {a.file ? <ReceiptThumb r={toMedia(a.file)} onOpen={() => setAssetIdx(fileAssets.indexOf(a))} />
                    : <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", isRef ? "bg-status-contacted/10 text-status-contacted" : "bg-brand/10 text-brand")}>{isRef ? <BookOpen className="size-4" /> : <Package className="size-4" />}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="truncate text-[12.5px] font-bold">{a.title || `${isRef ? "Reference" : "Asset"} ${i + 1}`}</span>
                      {isMine && <span className="shrink-0 rounded bg-brand px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-primary-foreground">Mine</span>}</div>
                    {edit ? <AssetKindToggle value={a.kind} onChange={(k) => k !== a.kind && assetU.mutate({ id: a.id, kind: k })} className="mt-1" />
                      : <span className={cn("mt-0.5 inline-block text-[10px] font-extrabold uppercase tracking-wider", isRef ? "text-status-contacted" : "text-brand")}>{isRef ? "Reference" : "Asset"}</span>}
                    {edit && t.subtasks.length > 0 ? <div className="mt-1 w-44"><SearchableSelect clearable searchable={false} items={t.subtasks.map((s, k) => ({ value: s.id, label: `${k + 1}. ${s.title}` }))} value={a.subtask_id ?? ""}
                        onChange={(v) => { const st = t.subtasks.find((s) => s.id === v); assetU.mutate({ id: a.id, subtask_id: v || null, ...(st?.assignee_id ? { assignee_id: st.assignee_id } : {}) }); }} placeholder="Whole task" /></div>
                      : a.subtask_id && <span className="ml-1.5 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"><ListChecks className="size-3" />{t.subtasks.findIndex((s) => s.id === a.subtask_id) + 1}. {t.subtasks.find((s) => s.id === a.subtask_id)?.title}</span>}
                  </div>
                  {latest && <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", latest.status === "approved" ? "border-status-converted/40 text-status-converted" : latest.status === "revision" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground")}>{latest.status === "pending" ? "In review" : latest.status}</span>}
                  {edit ? (
                    <div className="w-36 shrink-0"><SearchableSelect clearable searchable={false} items={team} value={a.assignee_id ?? ""} onChange={(v) => assetU.mutate({ id: a.id, assignee_id: v || null })} placeholder="Anyone" emptyText="No assignees" /></div>
                  ) : who ? <span className="inline-flex items-center gap-1 text-[11.5px] font-bold"><PersonAvatar name={who.name} src={who.avatar_url} size={18} />{who.name.split(" ")[0]}</span> : null}
                  {a.file ? <Button size="sm" variant="outline" className="h-7 gap-1 rounded-md px-2 text-[11.5px]" onClick={() => setAssetIdx(fileAssets.indexOf(a))}><Eye className="size-3" />View</Button>
                    : <Button asChild size="sm" variant="outline" className="h-7 gap-1 rounded-md px-2 text-[11.5px]"><a href={a.url} target="_blank" rel="noreferrer" title={a.url}><ExternalLink className="size-3" />Open</a></Button>}
                  {canSend && !isRef && <Button size="sm" variant="outline" onClick={() => { setOpenAsset(openAsset === a.id ? null : a.id); setAssetLink(""); setAssetNote(""); }} className="h-7 gap-1 rounded-md px-2 text-[11.5px]"><Send className="size-3" />Submit</Button>}
                  {edit && <button type="button" aria-label="Remove asset" onClick={async () => { if (await confirm({ tone: "danger", title: "Remove this link?", subject: a.title || a.file?.name || a.url, confirmLabel: "Remove" })) assetU.mutate({ id: a.id, remove: true }); }}><Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" /></button>}
                </div>
                <AnimatePresence initial={false}>
                  {openAsset === a.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
                      <div className="mt-2 grid gap-2 border-t border-border pt-2">
                        <Input value={assetLink} onChange={(e) => setAssetLink(e.target.value)} aria-label="Work link" placeholder="https://" className={`${FIELD} h-9 font-mono text-[12px]`} />
                        <textarea value={assetNote} onChange={(e) => setAssetNote(e.target.value)} rows={2} aria-label="Note" className={AREA} />
                        <div className="flex justify-end"><Button size="sm" disabled={sendAsset.isPending || (!assetLink.trim() && !assetNote.trim())}
                          onClick={() => sendAsset.mutate({ assetId: a.id, link: assetLink.trim(), note: assetNote.trim() }, { onSuccess: () => setOpenAsset(null) })} className="h-8 gap-1 rounded-md">
                          {sendAsset.isPending ? <TestLoader tone="white" /> : <Send className="size-3.5" />}Submit</Button></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
        {fileAssets.length > 1 && <Button size="sm" variant="outline" className="expense-action mt-2 h-8 gap-1 font-bold" onClick={() => setAssetGallery(true)}><Eye className="size-3.5" />View all {fileAssets.length} files</Button>}
        {assetGallery && <ExpenseReceiptsGallery title="Task files" label="File" voucherNo={t.title} receipts={assetMedia} onClose={() => setAssetGallery(false)} onView={() => {}} onDownloaded={() => {}}
          onDownload={async (r) => { if (!r.url) throw new Error("File is not ready"); await downloadFile(r.url, r.name); }} />}
        <ReceiptPreview label="File" receipts={assetMedia} index={assetIdx} onIndexChange={setAssetIdx} onClose={() => setAssetIdx(null)} />
        {edit && t.asset_rows.length < MAX_TASK_ASSETS && (
          <>
            <TaskAssetComposer room={MAX_TASK_ASSETS - t.asset_rows.length} busy={assets.isPending} existingUrls={t.asset_rows.map((a) => a.url)}
              subtasks={t.subtasks.map((s) => ({ value: s.id, label: s.title, assignee_id: s.assignee_id }))} onAdd={(items) => assets.mutate(items)} />
            {assetPhase && <p className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground"><TestLoader />{assetPhase}</p>}
          </>
        )}
      </section>
    </div>
  );
}

function toMedia(f: TaskFile): ReceiptMedia {
  const kind = submissionFileKind(f.name, f.mime);
  return { path: f.key, url: f.url ?? null, name: f.name, caption: fmtBytes(f.size), isPdf: kind === "pdf", isArchive: kind === "zip" };
}
const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Expense-style proof viewer: one file opens the preview, several open the gallery. */
function SubmissionFiles({ files, title }: { files: TaskFile[]; title: string }) {
  const media = files.map(toMedia);
  const [index, setIndex] = useState<number | null>(null);
  const [gallery, setGallery] = useState(false);
  if (!media.length) return null;
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {media.slice(0, 6).map((m, i) => <ReceiptThumb key={m.path ?? i} r={m} onOpen={() => setIndex(i)} />)}
        {media.length > 6 && <button type="button" onClick={() => setGallery(true)} className="grid size-16 place-items-center rounded-lg border border-dashed border-border font-mono text-[12px] font-bold text-muted-foreground hover:border-brand/50 hover:text-brand">+{media.length - 6}</button>}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="expense-action h-8 gap-1 font-bold" onClick={() => (media.length > 1 ? setGallery(true) : setIndex(0))}><Eye className="size-3.5" />View {media.length > 1 ? `all ${media.length} files` : "file"}</Button>
      </div>
      {gallery && <ExpenseReceiptsGallery title="Submitted files" label="File" voucherNo={title} receipts={media} onClose={() => setGallery(false)} onView={() => {}} onDownloaded={() => {}}
        onDownload={async (r) => { if (!r.url) throw new Error("File is not ready"); await downloadFile(r.url, r.name); }} />}
      <ReceiptPreview label="File" receipts={media} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />
    </div>
  );
}

function Submissions({ t, refresh }: { t: CompanyTaskDetail; refresh: () => void }) {
  const submit = useServerFn(submitCompanyTaskWork), review = useServerFn(reviewCompanyTaskSubmission), presign = useServerFn(requestTaskFileUpload);
  const confirm = useConfirm();
  const [link, setLink] = useState(""), [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const rv = useAct((p: { id: string; decision: "approved" | "revision" }) => review({ data: { ...p, note: reviewNote[p.id] || null } }), refresh);
  const asset = (id: string | null) => t.asset_rows.find((a) => a.id === id);
  const subtask = (id: string | null) => t.subtasks.find((s) => s.id === id);

  const mine = t.subtasks.filter((s) => s.assignee_id === t.me);
  const open = t.subtasks.filter((s) => !s.assignee_id);
  const targets = [
    { value: "", label: "Whole task", hint: t.title },
    ...mine.map((s) => ({ value: s.id, label: s.title, hint: s.done ? "Mine · done" : "Assigned to me" })),
    ...open.map((s) => ({ value: s.id, label: s.title, hint: "Open subtask" })),
  ];
  const localMedia: ReceiptMedia[] = files.map((f) => {
    const kind = submissionFileKind(f.name, f.type);
    return { path: null, file: f, name: f.name, caption: fmtBytes(f.size), isPdf: kind === "pdf", isArchive: kind === "zip" };
  });

  const pick = (list: FileList | null) => {
    const next: File[] = [];
    for (const f of Array.from(list ?? [])) {
      if (!submissionFileKind(f.name, f.type)) { toast.error(`${f.name}: only images, PDFs and ZIP files`); continue; }
      if (f.size > MAX_SUBMISSION_FILE_BYTES) { toast.error(`${f.name} is larger than 50 MB`); continue; }
      if (!files.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    const room = MAX_SUBMISSION_FILES - files.length;
    if (next.length > room) toast.error(`At most ${MAX_SUBMISSION_FILES} files per submission`);
    setFiles([...files, ...next.slice(0, Math.max(0, room))]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const send = useMutation({
    mutationFn: async () => {
      const uploaded: TaskFile[] = [];
      for (const [i, f] of files.entries()) {
        setPhase(`Uploading ${i + 1}/${files.length}…`);
        const mime = f.type || "application/octet-stream";
        const { url, key } = await presign({ data: { taskId: t.id, name: f.name, mime, size: f.size } });
        const res = await fetch(url, { method: "PUT", headers: { "Content-Type": mime }, body: f });
        if (!res.ok) throw new Error(`${f.name} could not be uploaded.`);
        uploaded.push({ key, name: f.name, mime, size: f.size });
      }
      setPhase("Saving…");
      await submit({ data: { taskId: t.id, subtaskId: target || null, files: uploaded, link: link.trim() || null, note: note.trim() || null } });
    },
    onSuccess: () => { toast.success("Submitted for review"); setLink(""); setNote(""); setFiles([]); setTarget(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPhase(null),
  });
  const ready = !!(link.trim() || note.trim() || files.length);
  const targetLabel = targets.find((x) => x.value === target)?.label ?? "Whole task";

  return (
    <div className="space-y-4">
      {t.can.work && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3.5 py-2.5"><Upload className="size-4 text-brand" /><span className="text-[13px] font-extrabold">Submit work</span></div>
          <div className="space-y-3 p-3.5">
            <div>
              <div className={LABEL}>What are you submitting?</div>
              <div className="mt-1.5"><SearchableSelect items={targets} value={target} onChange={(v) => setTarget(v ?? "")} placeholder="Whole task" emptyText="No subtasks" /></div>
              {!mine.length && <p className="mt-1 text-[11px] text-muted-foreground">No subtasks are assigned to you, so this goes in for the whole task or an open subtask.</p>}
            </div>
            <div>
              <div className="flex items-center gap-2"><span className={LABEL}>Files</span><span className="ml-auto font-mono text-[11px] text-muted-foreground">{files.length}/{MAX_SUBMISSION_FILES}</span></div>
              <input ref={inputRef} type="file" multiple hidden accept="image/*,.pdf,application/pdf,.zip,application/zip,application/x-zip-compressed" onChange={(e) => pick(e.target.files)} />
              <button type="button" onClick={() => inputRef.current?.click()} disabled={send.isPending || files.length >= MAX_SUBMISSION_FILES}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
                className="mt-1.5 flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4 text-center transition-colors hover:border-brand/50 hover:bg-brand/5 disabled:opacity-50">
                <Upload className="size-5 text-brand" />
                <span className="text-[12.5px] font-bold">Upload images, PDFs or ZIP files</span>
                <span className="text-[11px] text-muted-foreground">Click or drop here · up to 50 MB each</span>
              </button>
              {!!files.length && (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  <AnimatePresence initial={false}>
                    {localMedia.map((m, i) => (
                      <motion.li key={`${m.name}-${files[i].size}`} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={spring}
                        className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2">
                        <ReceiptThumb r={m} onOpen={() => setPreviewIdx(i)} />
                        <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-bold" title={m.name}>{m.name}</div><div className="font-mono text-[10.5px] text-muted-foreground">{m.caption}</div></div>
                        <button type="button" aria-label={`Remove ${m.name}`} disabled={send.isPending} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-3.5 text-muted-foreground hover:text-destructive" /></button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
            <div>
              <div className={LABEL}>Link (optional)</div>
              <Input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Work link" placeholder="https://" className={`mt-1.5 ${FIELD} h-9 font-mono text-[12px]`} />
            </div>
            <div>
              <div className={LABEL}>Note (optional)</div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} aria-label="Note" className={`mt-1.5 ${AREA}`} />
            </div>
            <div className="flex justify-end">
              <Button size="sm" disabled={send.isPending || !ready} className="h-9 min-w-40 gap-1.5 rounded-md" onClick={async () => {
                const ok = await confirm({ tone: "info", icon: Send, title: "Submit for review?", subject: targetLabel,
                  points: [files.length ? `${files.length} file${files.length > 1 ? "s" : ""} will be uploaded.` : "No files attached.", link.trim() ? "Includes a link." : "", note.trim() ? "Includes a note." : ""].filter(Boolean),
                  confirmLabel: "Submit" });
                if (ok) send.mutate();
              }}>
                {send.isPending ? <><TestLoader tone="white" />{phase ?? "Saving…"}</> : <><Send className="size-3.5" />Submit for review</>}
              </Button>
            </div>
          </div>
          <ReceiptPreview label="File" receipts={localMedia} index={previewIdx} onIndexChange={setPreviewIdx} onClose={() => setPreviewIdx(null)} />
        </div>
      )}
      {!t.submissions.length && <p className="py-8 text-center text-[12.5px] text-muted-foreground">No submissions yet.</p>}
      <ul className="space-y-2">
        {t.submissions.map((s, i) => {
          const who = t.people[s.user_id];
          const a = asset(s.asset_id), st = subtask(s.subtask_id);
          return (
            <motion.li key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.03 }} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <PersonAvatar name={who?.name ?? "?"} src={who?.avatar_url} size={24} />
                <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-bold">{who?.name ?? "Team member"}</div><div className="text-[11px] text-muted-foreground">{fmtDateTime(s.created_at)}</div></div>
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", s.status === "approved" ? "border-status-converted/40 text-status-converted" : s.status === "revision" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground")}>{s.status === "pending" ? "In review" : s.status === "revision" ? "Revision" : "Approved"}</span>
              </div>
              <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-[11.5px] font-bold">
                <ListChecks className="size-3.5 shrink-0 text-brand" /><span className="truncate">For: {st ? st.title : a ? a.title || "Asset" : "Whole task"}</span>
              </div>
              <SubmissionFiles files={s.files ?? []} title={`${who?.name ?? "Submission"} · ${fmtDateTime(s.created_at)}`} />
              {s.link && <div className="mt-2"><Button asChild size="sm" variant="outline" className="h-8 gap-1 rounded-md text-[11.5px]"><a href={s.link} target="_blank" rel="noreferrer" title={s.link}><ExternalLink className="size-3.5" />Open link</a></Button></div>}
              {s.note && <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{s.note}</p>}
              {s.review_note && <p className="mt-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[12px]"><span className="font-bold">Review: </span>{s.review_note}</p>}
              {t.can.review && s.status === "pending" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <Input value={reviewNote[s.id] ?? ""} onChange={(e) => setReviewNote({ ...reviewNote, [s.id]: e.target.value })} aria-label="Review note" placeholder="Instructions / reason (required for revision)" className={`${FIELD} h-8 min-w-40 flex-1`} />
                  <Button size="sm" variant="outline" disabled={rv.isPending || !(reviewNote[s.id] ?? "").trim()} onClick={async () => {
                    if (await confirm({ tone: "warning", icon: RotateCcw, title: `Send back to ${who?.name ?? "this person"}?`, subject: reviewNote[s.id], confirmLabel: "Request revision" })) rv.mutate({ id: s.id, decision: "revision" });
                  }} className="h-8 gap-1 rounded-md"><RotateCcw className="size-3.5" />Request revision</Button>
                  <Button size="sm" disabled={rv.isPending} onClick={async () => {
                    if (await confirm({ tone: "info", icon: Check, title: `Approve ${who?.name ?? "this"} submission?`, subject: st ? st.title : "Whole task", confirmLabel: "Approve" })) rv.mutate({ id: s.id, decision: "approved" });
                  }} className="h-8 gap-1 rounded-md"><Check className="size-3.5" />Approve</Button>
                </div>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function Comments({ t, refresh }: { t: CompanyTaskDetail; refresh: () => void }) {
  const add = useServerFn(addCompanyTaskComment), del = useServerFn(deleteCompanyTaskComment);
  const [body, setBody] = useState("");
  const post = useAct(() => add({ data: { taskId: t.id, body: body.trim() } }), refresh);
  const rm = useAct((id: string) => del({ data: { id } }), refresh);
  return (
    <div className="space-y-3">
      {!t.comment_rows.length && <p className="py-8 text-center text-[12.5px] text-muted-foreground">No comments yet.</p>}
      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {t.comment_rows.map((c) => {
            const who = t.people[c.user_id];
            return (
              <motion.li key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring} className="flex gap-2.5">
                <PersonAvatar name={who?.name ?? "?"} src={who?.avatar_url} size={26} />
                <div className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2">
                  <div className="flex items-center gap-2"><span className="text-[12.5px] font-bold">{who?.name ?? "Team member"}</span><span className="text-[11px] text-muted-foreground">{fmtDateTime(c.created_at)}</span>
                    {(t.can.edit) && <button type="button" aria-label="Remove comment" onClick={() => rm.mutate(c.id)} className="ml-auto"><Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" /></button>}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed">{c.body}</p>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {t.can.work ? (
        <div className="sticky bottom-0 rounded-xl border border-border bg-card p-2 shadow-sm">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={4000} aria-label="Write a comment" placeholder="Write a comment" className="w-full resize-none bg-transparent px-1.5 py-1 text-[13px] outline-none" />
          <div className="flex justify-end"><Button size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate(undefined, { onSuccess: () => setBody("") })} className="h-8 gap-1 rounded-md">{post.isPending ? <TestLoader tone="white" /> : <Send className="size-3.5" />}Comment</Button></div>
        </div>
      ) : <p className="text-center text-[11.5px] text-muted-foreground">Only this task's assignees can comment.</p>}
    </div>
  );
}

function ActivityTab({ t, refresh }: { t: CompanyTaskDetail; refresh: () => void }) {
  const addNote = useServerFn(addCompanyTaskNote);
  const [note, setNote] = useState("");
  const post = useAct(() => addNote({ data: { taskId: t.id, note: note.trim() } }), refresh);
  return (
    <div className="space-y-3">
      {t.can.work && (
        <div className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} aria-label="Add an activity note" placeholder="Add an activity note" enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === "Enter" && note.trim() && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); post.mutate(undefined, { onSuccess: () => setNote("") }); } }} className={`${FIELD} h-9`} />
          <Button size="sm" disabled={!note.trim() || post.isPending} onClick={() => post.mutate(undefined, { onSuccess: () => setNote("") })} className="h-9 rounded-md">Add</Button>
        </div>
      )}
      <ol className="relative space-y-3 border-l border-border pl-4">
        {t.activity.map((a, i) => {
          const who = t.people[a.actor_id];
          const d = a.detail as { note?: string; status?: string };
          return (
            <motion.li key={a.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: Math.min(i, 12) * 0.02 }} className="relative">
              <span className="absolute -left-[21px] top-1 grid size-2.5 place-items-center rounded-full bg-card ring-2 ring-border" />
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <PersonAvatar name={who?.name ?? "?"} src={who?.avatar_url} size={18} />
                <span className="font-bold">{who?.name ?? "Team member"}</span>
                <span className="text-muted-foreground">{ACTIVITY_TEXT[a.kind] ?? a.kind}{a.kind === "status" && d.status ? ` → ${statusLabel(d.status)}` : ""}</span>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">{fmtDateTime(a.created_at)}</span>
              </div>
              {d.note && <p className="ml-6 mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-2 py-1 text-[12.5px]">{d.note}</p>}
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

function Footer({ t, refresh, onClose }: { t: CompanyTaskDetail; refresh: () => void; onClose: () => void }) {
  const approve = useServerFn(approveCompanyTask), archive = useServerFn(archiveCompanyTask);
  const confirm = useConfirm();
  const ap = useAct(() => approve({ data: { id: t.id } }), refresh, "Task approved");
  const pending = t.submissions.filter((s) => s.status === "pending").length;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-6 py-3.5">
      <div className="flex items-center gap-2"><span className="text-[12px] font-semibold text-muted-foreground">Team</span><AvatarStack people={t.assignees} max={6} /></div>
      <div className="flex items-center gap-2">
        {t.can.edit && !t.archived_at && (
          <Button variant="outline" onClick={async () => {
            const ok = await confirm({ tone: "danger", title: `Archive "${t.title}"?`, description: "The task leaves the board and moves to the Archived list, where you can unarchive it anytime. Its submissions, comments and activity stay.", confirmLabel: "Archive",
              onConfirm: async () => { await archive({ data: { id: t.id } }); } });
            if (ok) { toast.success("Task archived"); refresh(); onClose(); }
          }} className="h-9 gap-1 rounded-md"><Archive className="size-4" />Archive</Button>
        )}
        {t.can.review && !t.approved_at && (
          <Button onClick={async () => {
            const ok = await confirm({
              tone: pending ? "warning" : "info", icon: BadgeCheck, title: `Approve "${t.title}"?`,
              subject: "The task is marked as approved and done.",
              points: pending ? [`${pending} submission${pending > 1 ? "s are" : " is"} still waiting for review.`] : undefined,
              confirmLabel: "Approve task",
            });
            if (ok) ap.mutate(undefined);
          }} disabled={ap.isPending} className="h-9 gap-1.5 rounded-md shadow-md shadow-brand/25 transition-all active:scale-95">
            {ap.isPending ? <TestLoader tone="white" /> : <BadgeCheck className="size-4" />}Approve task{pending ? ` (${pending} pending)` : ""}
          </Button>
        )}
      </div>
    </div>
  );
}
