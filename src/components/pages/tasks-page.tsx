// Company Tasks board (/app/tasks and /app/org/<slug>/tasks). The URL picks the
// company; the server returns only that company's tasks.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { CalendarDays, FolderKanban, Link2, ListChecks, MessageSquare, Plus, Search, SquareCheckBig, X } from "lucide-react";
import { PageHero } from "@/components/branta/page-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { useActiveCompany } from "@/components/company/company-switcher";
import { supabase } from "@/integrations/supabase/client";
import { listCompanyTasks, type CompanyTaskCard } from "@/lib/company-tasks.functions";
import { TASK_STATUSES, type CompanyTaskStatus } from "@/lib/company-task-rules";
import { NewTaskDrawer } from "@/components/tasks/new-task-drawer";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { AvatarStack, PriorityBadge, SegmentedProgress, StatusDot, fmtDate, spring } from "@/components/tasks/task-ui";
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

  const tasks = q.data?.tasks ?? [];
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
        <CalendarDays className="size-3.5" />{t.due_on ? fmtDate(t.due_on) : fmtDate(t.created_at)}
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
