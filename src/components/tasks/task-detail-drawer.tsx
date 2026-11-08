// Task detail: the expense drawer surface with company-profile tabs. Managers
// (C.E.O / C.O.O / HR / Group Admin) edit and review; assignees submit, comment,
// tick subtasks and log activity; everyone else in the company reads.
import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Activity, Archive, BadgeCheck, CalendarDays, Check, ExternalLink, FileText, Link2, ListChecks, MessageSquare, Plus, RotateCcw, Send, Trash2, Upload, X } from "lucide-react";
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
  submitCompanyTaskWork, updateCompanyTask, updateCompanyTaskAsset, updateCompanyTaskSubtask, type CompanyTaskDetail, type TaskMember,
} from "@/lib/company-tasks.functions";
import { MAX_TASK_ASSETS, TASK_PRIORITIES, TASK_STATUSES, parseAssetLinks, statusLabel } from "@/lib/company-task-rules";
import { cn } from "@/lib/utils";
import { AREA, AvatarStack, FIELD, LABEL, PersonAvatar, PriorityBadge, SegmentedProgress, StatusChip, fmtDateTime, fmtDue, spring } from "./task-ui";

type Tab = "overview" | "submissions" | "comments" | "activity";
type UpdPatch = { id: string; title?: string; description?: string | null; priority?: "low" | "normal" | "high" | "urgent"; status?: "todo" | "doing" | "in_review" | "done"; due_on?: string | null; due_time?: string | null; tags?: string[]; project_id?: string | null };
type SubPatch = { id: string; done?: boolean; title?: string; assignee_id?: string | null; remove?: boolean };
type AssetPatch = { id: string; assignee_id?: string | null; title?: string | null; remove?: boolean };

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
        <SheetDescription className="text-[12px]">Created by {t.created_by_person?.name ?? "—"} · {fmtDateTime(t.created_at)}</SheetDescription>
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

function Overview({ t, members, projects, refresh }: { t: CompanyTaskDetail; members: TaskMember[]; projects: { id: string; title: string }[]; refresh: () => void }) {
  const upd = useServerFn(updateCompanyTask), setAsg = useServerFn(setCompanyTaskAssignees), addSub = useServerFn(addCompanyTaskSubtask);
  const updSub = useServerFn(updateCompanyTaskSubtask), addAssets = useServerFn(addCompanyTaskAssets), updAsset = useServerFn(updateCompanyTaskAsset);
  const myStatus = useServerFn(setMyCompanyTaskStatus), submit = useServerFn(submitCompanyTaskWork);
  const edit = t.can.edit, work = t.can.work;
  const u = useAct((p: UpdPatch) => upd({ data: p }), refresh);
  const asg = useAct((ids: string[]) => setAsg({ data: { id: t.id, userIds: ids } }), refresh);
  const sub = useAct((p: { title: string; assignee_id: string | null }) => addSub({ data: { taskId: t.id, ...p } }), refresh);
  const subU = useAct((p: SubPatch) => updSub({ data: p }), refresh);
  const assets = useAct((urls: string[]) => addAssets({ data: { taskId: t.id, assets: urls.map((url) => ({ url })) } }), refresh, "Links added");
  const assetU = useAct((p: AssetPatch) => updAsset({ data: p }), refresh);
  const mine = useAct((s: "todo" | "doing") => myStatus({ data: { taskId: t.id, status: s } }), refresh);
  const sendAsset = useAct((p: { assetId: string; link: string; note: string }) => submit({ data: { taskId: t.id, assetId: p.assetId, link: p.link || null, note: p.note || null } }), refresh, "Submitted for review");

  const [title, setTitle] = useState(t.title);
  const [desc, setDesc] = useState(t.description ?? "");
  const [tag, setTag] = useState("");
  const [newSub, setNewSub] = useState("");
  const [links, setLinks] = useState("");
  const [openAsset, setOpenAsset] = useState<string | null>(null);
  const [assetLink, setAssetLink] = useState("");
  const [assetNote, setAssetNote] = useState("");

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
      <div className="divide-y divide-border/60 rounded-xl border border-border bg-card px-3.5 py-1">
        <Row label="Assignees">
          <div className="flex flex-wrap items-center gap-1.5">
            <AnimatePresence initial={false}>
              {t.assignee_rows.map((a) => (
                <motion.span key={a.user_id} layout initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} transition={spring}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-0.5 pr-2 text-[12px] font-bold">
                  <PersonAvatar name={a.name} src={a.avatar_url} size={20} />{a.name}
                  <span className="font-mono text-[10px] font-semibold uppercase text-muted-foreground">{a.status}</span>
                  {edit && <button type="button" aria-label={`Remove ${a.name}`} onClick={() => asg.mutate(assigneeIds.filter((x) => x !== a.user_id))}><X className="size-3 text-muted-foreground hover:text-foreground" /></button>}
                </motion.span>
              ))}
            </AnimatePresence>
            {!t.assignee_rows.length && <span className="text-[12.5px] text-muted-foreground">No one yet</span>}
            {edit && <div className="w-44"><SearchableSelect items={addable} value="" onChange={(v) => v && asg.mutate([...assigneeIds, v])} placeholder="+ Add" emptyText="No more members" /></div>}
          </div>
        </Row>
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

      {work && !edit && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
          <span className="text-[12.5px] font-bold">My progress</span>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" disabled={mine.isPending} onClick={() => mine.mutate("todo")} className="h-8 rounded-md">Not started</Button>
            <Button size="sm" disabled={mine.isPending} onClick={() => mine.mutate("doing")} className="h-8 rounded-md">Working on it</Button>
          </div>
        </div>
      )}

      <section>
        <div className={LABEL}>Description</div>
        {edit ? (
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} aria-label="Description"
            onBlur={() => { if (desc !== (t.description ?? "")) u.mutate({ id: t.id, description: desc }); }} className={`mt-1.5 ${AREA}`} />
        ) : (
          <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px] leading-relaxed">{t.description || "—"}</p>
        )}
      </section>

      <section>
        <div className="flex items-center gap-1.5"><ListChecks className="size-4 text-muted-foreground" /><span className={LABEL}>Subtasks</span><span className="ml-auto font-mono text-[11px] text-muted-foreground">{t.subtasks_done}/{t.subtasks_total}</span></div>
        {t.subtasks_total > 0 && <div className="mt-2"><SegmentedProgress done={t.subtasks_done} total={t.subtasks_total} /></div>}
        <ul className="mt-2 space-y-1.5">
          <AnimatePresence initial={false}>
            {t.subtasks.map((s) => {
              const who = P(s.assignee_id);
              return (
                <motion.li key={s.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
                  <motion.button type="button" whileTap={{ scale: 0.85 }} disabled={!work || subU.isPending} aria-label={s.done ? "Mark not done" : "Mark done"}
                    onClick={() => subU.mutate({ id: s.id, done: !s.done })}
                    className={cn("grid size-4.5 shrink-0 place-items-center rounded border transition-colors", s.done ? "border-brand bg-brand text-white" : "border-border bg-card", !work && "cursor-default")}>
                    {s.done && <Check className="size-3" />}
                  </motion.button>
                  <span className={cn("min-w-0 flex-1 truncate text-[12.5px] font-semibold transition-colors", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                  {edit ? (
                    <div className="w-36 shrink-0"><SearchableSelect clearable searchable={false} items={team} value={s.assignee_id ?? ""} onChange={(v) => subU.mutate({ id: s.id, assignee_id: v || null })} placeholder="Anyone" emptyText="No assignees" /></div>
                  ) : who ? <PersonAvatar name={who.name} src={who.avatar_url} size={20} /> : null}
                  {edit && <button type="button" aria-label="Remove subtask" onClick={() => subU.mutate({ id: s.id, remove: true })}><Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" /></button>}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {edit && (
          <div className="mt-2 flex gap-2">
            <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} maxLength={300} aria-label="New subtask" placeholder="Add subtask" enterKeyHint="done"
              onKeyDown={(e) => { if (e.key === "Enter" && newSub.trim() && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); sub.mutate({ title: newSub.trim(), assignee_id: null }); setNewSub(""); } }} className={`${FIELD} h-9`} />
            <Button type="button" variant="outline" disabled={!newSub.trim() || sub.isPending} onClick={() => { sub.mutate({ title: newSub.trim(), assignee_id: null }); setNewSub(""); }} className="h-9 gap-1 rounded-md"><Plus className="size-4" />Add</Button>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-1.5"><Link2 className="size-4 text-muted-foreground" /><span className={LABEL}>Assets & references</span><span className="ml-auto font-mono text-[11px] text-muted-foreground">{t.asset_rows.length}/{MAX_TASK_ASSETS}</span></div>
        <ul className="mt-2 space-y-1.5">
          {t.asset_rows.map((a, i) => {
            const who = P(a.assignee_id);
            const subs = t.submissions.filter((s) => s.asset_id === a.id);
            const latest = subs[0];
            const canSend = work && (edit || !a.assignee_id || a.assignee_id === t.me);
            return (
              <li key={a.id} className="rounded-lg border border-border bg-card px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted font-mono text-[10.5px] font-bold text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-bold">{a.title || `Asset ${i + 1}`}</div>
                    <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-brand">{a.url}<ExternalLink className="size-3 shrink-0" /></a>
                  </div>
                  {latest && <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", latest.status === "approved" ? "border-status-converted/40 text-status-converted" : latest.status === "revision" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground")}>{latest.status === "pending" ? "In review" : latest.status}</span>}
                  {edit ? (
                    <div className="w-36 shrink-0"><SearchableSelect clearable searchable={false} items={team} value={a.assignee_id ?? ""} onChange={(v) => assetU.mutate({ id: a.id, assignee_id: v || null })} placeholder="Anyone" emptyText="No assignees" /></div>
                  ) : who ? <span className="inline-flex items-center gap-1 text-[11.5px] font-bold"><PersonAvatar name={who.name} src={who.avatar_url} size={18} />{who.name.split(" ")[0]}</span> : null}
                  {canSend && <Button size="sm" variant="outline" onClick={() => { setOpenAsset(openAsset === a.id ? null : a.id); setAssetLink(""); setAssetNote(""); }} className="h-7 gap-1 rounded-md px-2 text-[11.5px]"><Send className="size-3" />Submit</Button>}
                  {edit && <button type="button" aria-label="Remove asset" onClick={() => assetU.mutate({ id: a.id, remove: true })}><Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" /></button>}
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
        {edit && t.asset_rows.length < MAX_TASK_ASSETS && (
          <div className="mt-2 space-y-2">
            <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2} aria-label="Paste links" placeholder="Paste links, one per line" className={`${AREA} font-mono text-[12px]`} />
            <div className="flex justify-end"><Button size="sm" variant="outline" disabled={assets.isPending || !links.trim()} onClick={() => {
              const urls = parseAssetLinks(links).filter((x) => !t.asset_rows.some((a) => a.url === x)).slice(0, MAX_TASK_ASSETS - t.asset_rows.length);
              if (!urls.length) return toast.error("Paste one or more http(s) links");
              assets.mutate(urls, { onSuccess: () => setLinks("") });
            }} className="h-8 gap-1 rounded-md"><Plus className="size-3.5" />Add links</Button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function Submissions({ t, refresh }: { t: CompanyTaskDetail; refresh: () => void }) {
  const submit = useServerFn(submitCompanyTaskWork), review = useServerFn(reviewCompanyTaskSubmission);
  const [link, setLink] = useState(""), [note, setNote] = useState("");
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const send = useAct(() => submit({ data: { taskId: t.id, link: link.trim() || null, note: note.trim() || null } }), refresh, "Submitted for review");
  const rv = useAct((p: { id: string; decision: "approved" | "revision" }) => review({ data: { ...p, note: reviewNote[p.id] || null } }), refresh);
  const asset = (id: string | null) => t.asset_rows.find((a) => a.id === id);
  return (
    <div className="space-y-4">
      {t.can.work && (
        <div className="rounded-xl border border-border bg-muted/30 p-3.5">
          <div className={LABEL}>Submit work</div>
          <Input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Work link" placeholder="https://" className={`mt-1.5 ${FIELD} h-9 font-mono text-[12px]`} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} aria-label="Note" className={`mt-2 ${AREA}`} />
          <div className="mt-2 flex justify-end"><Button size="sm" disabled={send.isPending || (!link.trim() && !note.trim())} onClick={() => send.mutate(undefined, { onSuccess: () => { setLink(""); setNote(""); } })} className="h-8 gap-1 rounded-md">
            {send.isPending ? <TestLoader tone="white" /> : <Send className="size-3.5" />}Submit for review</Button></div>
        </div>
      )}
      {!t.submissions.length && <p className="py-8 text-center text-[12.5px] text-muted-foreground">No submissions yet.</p>}
      <ul className="space-y-2">
        {t.submissions.map((s, i) => {
          const who = t.people[s.user_id];
          const a = asset(s.asset_id);
          return (
            <motion.li key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.03 }} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <PersonAvatar name={who?.name ?? "?"} src={who?.avatar_url} size={24} />
                <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-bold">{who?.name ?? "Team member"}</div><div className="text-[11px] text-muted-foreground">{fmtDateTime(s.created_at)}{a ? ` · ${a.title || "Asset"}` : ""}</div></div>
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", s.status === "approved" ? "border-status-converted/40 text-status-converted" : s.status === "revision" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground")}>{s.status === "pending" ? "In review" : s.status === "revision" ? "Revision" : "Approved"}</span>
              </div>
              {s.link && <a href={s.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 truncate font-mono text-[11.5px] text-brand hover:underline">{s.link}<ExternalLink className="size-3 shrink-0" /></a>}
              {s.note && <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{s.note}</p>}
              {s.review_note && <p className="mt-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[12px]"><span className="font-bold">Review: </span>{s.review_note}</p>}
              {t.can.review && s.status === "pending" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <Input value={reviewNote[s.id] ?? ""} onChange={(e) => setReviewNote({ ...reviewNote, [s.id]: e.target.value })} aria-label="Review note" placeholder="Review note (optional)" className={`${FIELD} h-8 min-w-40 flex-1`} />
                  <Button size="sm" variant="outline" disabled={rv.isPending} onClick={() => rv.mutate({ id: s.id, decision: "revision" })} className="h-8 gap-1 rounded-md"><RotateCcw className="size-3.5" />Request revision</Button>
                  <Button size="sm" disabled={rv.isPending} onClick={() => rv.mutate({ id: s.id, decision: "approved" })} className="h-8 gap-1 rounded-md"><Check className="size-3.5" />Approve</Button>
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
