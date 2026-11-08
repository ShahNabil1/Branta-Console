// Company Tasks board (/app/tasks and /app/org/<slug>/tasks). The URL picks the
// company; the server returns only that company's tasks.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Archive, ArchiveRestore, CalendarClock, CalendarDays, FilePen, FolderKanban, Link2, ListChecks, MessageSquare, Plus, Rocket, Search, SquareCheckBig, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHero } from "@/components/branta/page-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { useActiveCompany } from "@/components/company/company-switcher";
import { supabase } from "@/integrations/supabase/client";
import { deleteCompanyTask, listCompanyTasks, publishCompanyTask, unarchiveCompanyTask, type CompanyTaskCard } from "@/lib/company-tasks.functions";
import { TASK_STATUSES, nextGoLiveIn, taskBucket, type CompanyTaskStatus, type TaskBucket } from "@/lib/company-task-rules";
import { NewTaskDrawer } from "@/components/tasks/new-task-drawer";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { AvatarStack, PriorityBadge, SegmentedProgress, StatusDot, fmtDate, fmtDue, spring } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";

type Filter = "all" | CompanyTaskStatus | "mine";

export function TasksPage() {
  const ac = useActiveCompany().active;
  const workspace = ac && !ac.is_holding ? ac.slug : null;
  const list = useServerFn(listCompanyTasks);
  const qc = useQueryClient();
  const key = ["company-tasks", workspace ?? "holding"];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { workspace } }), enabled: !!ac, staleTime: 15_000 });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [member, setMember] = useState("");
  const [creating, setCreating] = useState<CompanyTaskStatus | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const companyId = q.data?.company.id;
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase.channel(`company-tasks-${companyId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_tasks", filter: `company_id=eq.${companyId}` }, () => qc.invalidateQueries({ queryKey: ["company-tasks"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, qc]);

  // Scheduled tasks join the board at their exact start time: re-check then and refetch.
  const [now, setNow] = useState(() => Date.now());
  const all = q.data?.tasks ?? [];
  useEffect(() => {
    const ms = nextGoLiveIn(all, now);
    if (ms === null) return;
    const h = setTimeout(() => { setNow(Date.now()); qc.invalidateQueries({ queryKey: ["company-tasks"] }); }, Math.min(ms + 250, 2_147_000_000));
    return () => clearTimeout(h);
  }, [all, now, qc]);
  const [view, setView] = useState<TaskBucket>("board");
  const byBucket = (b: TaskBucket) => all.filter((t) => taskBucket(t, now) === b);
  const tasks = byBucket("board");
  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter === "mine" && !t.assignees.some((a) => a.user_id === q.data?.me)) return false;
      if (member && !t.assignees.some((a) => a.user_id === member)) return false;
      if (s && ![t.title, t.description, t.project_title, ...t.tags, ...t.assignees.map((a) => a.name)].filter(Boolean).join(" ").toLowerCase().includes(s)) return false;
      return true;
    });
  }, [tasks, filter, member, search, q.data?.me]);
  const columns = TASK_STATUSES.filter((s) => filter === "all" || filter === "mine" || s.key === filter);
  const count = (k: string) => tasks.filter((t) => t.status === k).length;
  const canManage = !!q.data?.canManage;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-8">
      <PageHero icon={SquareCheckBig} eyebrow={ac?.name ?? "Workspace"} title="Tasks"
        subtitle={q.isLoading ? "Day-to-day work of the company" : `Day-to-day work of the company · ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
        actions={canManage ? (
          <Button onClick={() => setCreating("todo")} className="gap-1.5 shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-95">
            <Plus className="size-4" /> New task
          </Button>
        ) : undefined} />

      {canManage && (
        <div className="rounded-lg border border-border bg-card px-2 shadow-sm">
          <UnderlineTabs<TaskBucket> value={view} onChange={setView} ariaLabel="Task views" items={[
            { id: "board", label: "Board", lead: <SquareCheckBig className="size-3.5" />, count: tasks.length },
            { id: "scheduled", label: "Scheduled", lead: <CalendarClock className="size-3.5" />, count: byBucket("scheduled").length },
            { id: "draft", label: "Drafts", lead: <FilePen className="size-3.5" />, count: byBucket("draft").length },
            { id: "archived", label: "Archived", lead: <Archive className="size-3.5" />, count: byBucket("archived").length },
          ]} />
        </div>
      )}

      {view !== "board" ? <TaskQueue bucket={view} items={byBucket(view)} loading={q.isLoading} onOpen={setOpenId} /> : (<>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-2 shadow-sm">
        <UnderlineTabs<Filter> value={filter} onChange={setFilter} ariaLabel="Task filter" className="min-w-0 flex-1" items={[
          { id: "all", label: "All Tasks", count: tasks.length },
          ...TASK_STATUSES.map((s) => ({ id: s.key as Filter, label: s.label, lead: <StatusDot value={s.key} />, count: count(s.key) })),
          { id: "mine", label: "Assigned to me", count: tasks.filter((t) => t.assignees.some((a) => a.user_id === q.data?.me)).length },
        ]} />
        <div className="flex items-center gap-2 py-2">
          <div className="w-44"><SearchableSelect clearable items={(q.data?.members ?? []).map((m) => ({ value: m.user_id, label: m.name, avatar: m.avatar_url ?? "" }))} value={member} onChange={setMember} placeholder="All members" emptyText="No members" /></div>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search task…" aria-label="Search tasks" className="h-9 rounded-md pl-8 text-[12.5px]" />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="size-3.5 text-muted-foreground" /></button>}
          </div>
        </div>
      </div>

      {q.error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-[13px] font-semibold text-destructive">{(q.error as Error).message}</div>}

      <LayoutGroup>
        <div className={cn("grid gap-4", columns.length > 1 ? "md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1")}>
          {columns.map((col) => {
            const items = visible.filter((t) => t.status === col.key);
            return (
              <section key={col.key} className="flex min-w-0 flex-col rounded-lg border border-border bg-muted/40">
                <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                  <StatusDot value={col.key} />
                  <h2 className="text-[13.5px] font-bold">{col.label}</h2>
                  <motion.span key={items.length} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring}
                    className="grid min-w-5 place-items-center rounded-full bg-foreground px-1.5 font-mono text-[10.5px] font-bold text-background">{items.length}</motion.span>
                  {canManage && col.key !== "done" && (
                    <button type="button" aria-label={`New ${col.label} task`} onClick={() => setCreating(col.key)} className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"><Plus className="size-4" /></button>
                  )}
                </header>
                <div className="flex-1 space-y-2.5 p-2.5">
                  {q.isLoading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
                  <AnimatePresence initial={false}>
                    {items.map((t, i) => <TaskCard key={t.id} t={t} index={i} onOpen={() => setOpenId(t.id)} />)}
                  </AnimatePresence>
                  {!q.isLoading && !items.length && <p className="py-6 text-center text-[12px] font-semibold text-muted-foreground">No tasks</p>}
                </div>
              </section>
            );
          })}
        </div>
      </LayoutGroup>
      </>)}

      {q.data && (
        <NewTaskDrawer open={!!creating} onOpenChange={(v) => !v && setCreating(null)} initialStatus={creating ?? "todo"} workspace={workspace}
          companyName={q.data.company.name} members={q.data.members} projects={q.data.projects} me={q.data.me} onCreated={(id) => setOpenId(id)} />
      )}
      <TaskDetailDrawer taskId={openId} onClose={() => setOpenId(null)} members={q.data?.members ?? []} projects={q.data?.projects ?? []} />
    </div>
  );
}

function TaskCard({ t, index, onOpen }: { t: CompanyTaskCard; index: number; onOpen: () => void }) {
  return (
    <motion.button type="button" layout layoutId={t.id} onClick={onOpen}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { ...spring, delay: Math.min(index, 8) * 0.03 } }} exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }}
      className="group block w-full rounded-lg border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2 text-[11.5px] font-semibold text-muted-foreground">
        <CalendarDays className="size-3.5" />{t.due_on ? fmtDue(t.due_on, t.due_time) : fmtDate(t.created_at)}
        <span className="ml-auto"><PriorityBadge value={t.priority} /></span>
      </div>
      <div className="px-3 pb-2 pt-2.5">
        <div className="line-clamp-2 text-[14.5px] font-bold leading-snug text-foreground">{t.title}</div>
        {t.description && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{t.description}</p>}
        {(t.project_title || t.tags.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {t.project_title && <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10.5px] font-bold text-foreground/80"><FolderKanban className="size-3" />{t.project_title}</span>}
            {t.tags.slice(0, 3).map((g) => <span key={g} className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10.5px] font-bold text-foreground/80">{g}</span>)}
          </div>
        )}
        {t.subtasks_total > 0 && (
          <div className="mt-2.5 rounded-md border border-border px-2 py-1.5">
            <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><ListChecks className="size-3.5" />Sub task<span className="ml-auto font-mono">{String(t.subtasks_done).padStart(2, "0")}/{String(t.subtasks_total).padStart(2, "0")}</span></div>
            <SegmentedProgress done={t.subtasks_done} total={t.subtasks_total} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-border/70 px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" />{String(t.comments).padStart(2, "0")}</span>
        <span className="inline-flex items-center gap-1"><Link2 className="size-3.5" />{String(t.assets).padStart(2, "0")}</span>
        <span className="ml-auto"><AvatarStack people={t.assignees} size={20} /></span>
      </div>
    </motion.button>
  );
}

const QUEUE_EMPTY: Record<Exclude<TaskBucket, "board">, string> = {
  scheduled: "No scheduled tasks. Choose Schedule when creating a task.",
  draft: "No drafts. Choose Save as draft when creating a task.",
  archived: "No archived tasks.",
};
const fmtStart = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
const pad = (n: number) => String(n).padStart(2, "0");

/** Scheduled / Drafts / Archived: manager-only lists with reschedule, go-live, delete and restore. */
function TaskQueue({ bucket, items, loading, onOpen }: { bucket: Exclude<TaskBucket, "board">; items: CompanyTaskCard[]; loading: boolean; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const publish = useServerFn(publishCompanyTask), del = useServerFn(deleteCompanyTask), restore = useServerFn(unarchiveCompanyTask);
  const [scheduling, setScheduling] = useState<CompanyTaskCard | null>(null);
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ["company-tasks"] }); };
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); done(msg); } catch (e) { toast.error((e as Error).message); } };

  return (
    <>
      {loading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
        : !items.length ? <div className="rounded-lg border border-dashed border-border bg-card py-14 text-center text-[13px] font-semibold text-muted-foreground">{QUEUE_EMPTY[bucket]}</div>
        : (
          <motion.div layout className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {items.map((t, i) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { ...spring, delay: Math.min(i, 8) * 0.03 } }} exit={{ opacity: 0, scale: 0.96 }}
                  className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-2 text-[11.5px] font-bold">
                    {bucket === "scheduled" && <><CalendarClock className="size-3.5 text-brand" /><span>Starts {fmtStart(t.scheduled_at!)}</span></>}
                    {bucket === "draft" && <><FilePen className="size-3.5 text-muted-foreground" /><span className="text-muted-foreground">Draft · only managers see it</span></>}
                    {bucket === "archived" && <><Archive className="size-3.5 text-muted-foreground" /><span className="text-muted-foreground">Archived {fmtStart(t.archived_at!)}</span></>}
                    <span className="ml-auto"><PriorityBadge value={t.priority} /></span>
                  </div>
                  <button type="button" onClick={() => onOpen(t.id)} className="flex-1 px-3 py-2.5 text-left hover:bg-muted/20" aria-label={`Open ${t.title} to edit`}>
                    <div className="line-clamp-2 text-[14.5px] font-bold leading-snug">{t.title}</div>
                    {t.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{t.description}</p>}
                    <div className="mt-2 flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
                      {t.due_on && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />Due {fmtDue(t.due_on, t.due_time)}</span>}
                      <span className="ml-auto"><AvatarStack people={t.assignees} size={20} /></span>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 px-3 py-2">
                    {bucket === "archived" ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1 rounded-md" onClick={async () => {
                        const ok = await confirm({ tone: "info", icon: ArchiveRestore, title: `Restore "${t.title}"?`, subject: "The task goes back to the board with its history.", confirmLabel: "Restore",
                          onConfirm: async () => { await restore({ data: { id: t.id } }); } });
                        if (ok) done("Task restored");
                      }}><ArchiveRestore className="size-3.5" />Unarchive</Button>
                    ) : (<>
                      <Button size="sm" variant="outline" className="h-8 gap-1 rounded-md" onClick={() => setScheduling(t)}><CalendarClock className="size-3.5" />{bucket === "scheduled" ? "Reschedule" : "Schedule"}</Button>
                      <Button size="sm" className="h-8 gap-1 rounded-md" onClick={async () => {
                        const ok = await confirm({ tone: "info", icon: Rocket, title: `Go live with "${t.title}"?`, subject: "It appears in To Do right now and everyone can see and work on it.", confirmLabel: "Go live now",
                          onConfirm: async () => { await publish({ data: { id: t.id, publish_state: "live" } }); } });
                        if (ok) done("Task is live");
                      }}><Rocket className="size-3.5" />Go live now</Button>
                      {bucket === "scheduled" && <Button size="sm" variant="ghost" className="h-8 rounded-md" onClick={() => run(() => publish({ data: { id: t.id, publish_state: "draft" } }), "Moved to drafts")}>Move to draft</Button>}
                      <Button size="sm" variant="ghost" aria-label="Delete task" className="ml-auto h-8 gap-1 rounded-md text-destructive hover:text-destructive" onClick={async () => {
                        const ok = await confirm({ tone: "danger", title: `Delete "${t.title}"?`, description: "Nobody has started this task yet. It is removed for good.", confirmLabel: "Delete",
                          onConfirm: async () => { await del({ data: { id: t.id } }); } });
                        if (ok) done("Task deleted");
                      }}><Trash2 className="size-3.5" />Delete</Button>
                    </>)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      <ScheduleDialog task={scheduling} onClose={() => setScheduling(null)} onSave={async (iso) => {
        await publish({ data: { id: scheduling!.id, publish_state: "scheduled", scheduled_at: iso } });
        done(bucket === "scheduled" ? "Task rescheduled" : "Task scheduled");
      }} />
    </>
  );
}

function ScheduleDialog({ task, onClose, onSave }: { task: CompanyTaskCard | null; onClose: () => void; onSave: (iso: string) => Promise<void> }) {
  const [day, setDay] = useState(""); const [time, setTime] = useState("09:00"); const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if ((task?.id ?? null) !== last) {
    setLast(task?.id ?? null);
    if (task?.scheduled_at) { const d = new Date(task.scheduled_at); setDay(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`); }
    else { setDay(""); setTime("09:00"); }
  }
  const iso = day && time ? new Date(`${day}T${time}`).toISOString() : null;
  const bad = !iso || new Date(iso).getTime() <= Date.now();
  return (
    <Dialog open={!!task} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{task?.scheduled_at ? "Reschedule task" : "Schedule task"}</DialogTitle>
          <DialogDescription>"{task?.title}" appears in To Do for everyone at exactly this time.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_7.5rem] gap-2">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Start date" />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Start time" className="font-mono" />
        </div>
        {bad && day && <p className="text-[12px] font-semibold text-destructive">Pick a time in the future.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button disabled={bad || busy} onClick={async () => {
            setBusy(true);
            try { await onSave(iso!); onClose(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
          }}>{busy ? "Saving…" : "Save schedule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
