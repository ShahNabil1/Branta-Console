import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCheck,
  ClipboardCheck,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskDetailSheet } from "@/components/clients/client-tasks";
import { getTodayOperations, type OperationsTask } from "@/lib/operations.functions";
import { TASK_STEPS, stepIndex, stepLabel } from "@/lib/client-tasks.functions";
import { listAssignableUsers } from "@/lib/leads.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/operations")({
  head: () => ({
    meta: [
      { title: "Today's Operations · Branta Tech Console" },
      { name: "description", content: "Live daily client work, team progress, reviews, revisions, and completed tasks for Branta Tech management." },
      { property: "og:title", content: "Today's Operations · Branta Tech Console" },
      { property: "og:description", content: "Live daily client work, team progress, reviews, revisions, and completed tasks for Branta Tech management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OperationsPage,
});

type ViewFilter = "all" | "active" | "review" | "revision" | "completed";

const FILTERS: { key: ViewFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "In Progress" },
  { key: "review", label: "Awaiting Review" },
  { key: "revision", label: "Revision Required" },
  { key: "completed", label: "Completed" },
];

const STATUS_STYLE: Record<string, string> = {
  review: "border-status-contacted/35 bg-status-contacted/10 text-status-contacted",
  revision_requested: "border-destructive/30 bg-destructive/10 text-destructive",
  completed: "border-status-converted/35 bg-status-converted/10 text-status-converted",
  delivered: "border-status-converted/35 bg-status-converted/10 text-status-converted",
};

function OperationsPage() {
  const getOperations = useServerFn(getTodayOperations);
  const getUsers = useServerFn(listAssignableUsers);
  const queryClient = useQueryClient();
  const operations = useQuery({
    queryKey: ["today-operations"],
    queryFn: () => getOperations(),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const users = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () => getUsers(),
    staleTime: 60_000,
    enabled: operations.data?.allowed === true,
  });
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("all");
  const [memberId, setMemberId] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["today-operations"] });
    const channel = supabase
      .channel("today-operations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_tasks" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_task_assignees" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_task_events" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_task_updates" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_task_submissions" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const allTasks = operations.data?.tasks ?? [];
  const clients = useMemo(() => [...new Map(allTasks.map((task) => [task.customer_id ?? "internal", task.customer_name || (task.customer_id ? "Unknown client" : "Internal")])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [allTasks]);
  const members = useMemo(() => [...new Map(allTasks.flatMap((task) => task.assignees.map((member) => [member.user_id, member.name || "Team member"] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1])), [allTasks]);
  const visibleTasks = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return allTasks.filter((task) => {
      const matchesView = filter === "all"
        || (filter === "active" && !["review", "revision_requested", "completed"].includes(task.status))
        || (filter === "review" && task.status === "review")
        || (filter === "revision" && task.status === "revision_requested")
        || (filter === "completed" && task.status === "completed");
      const matchesSearch = !needle || [task.title, task.customer_name, task.project_title, ...task.assignees.map((member) => member.name)]
        .some((value) => value?.toLocaleLowerCase().includes(needle));
      return matchesView && matchesSearch && (clientId === "all" || (task.customer_id ?? "internal") === clientId)
        && (memberId === "all" || task.assignees.some((member) => member.user_id === memberId));
    });
  }, [allTasks, clientId, filter, memberId, search]);
  const grouped = useMemo(() => {
    const result = new Map<string, { name: string; code: string | null; tasks: OperationsTask[] }>();
    for (const task of visibleTasks) {
      const group = result.get(task.customer_id ?? "internal") ?? { name: task.customer_name || (task.customer_id ? "Unknown client" : "Internal"), code: task.customer_code ?? null, tasks: [] };
      group.tasks.push(task);
      result.set(task.customer_id ?? "internal", group);
    }
    return [...result.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [visibleTasks]);
  const open = allTasks.find((task) => task.id === openId) ?? null;

  if (operations.isLoading) return <PageState icon={Loader2} spin title="Loading today’s operations…" />;
  if (operations.isError) return <PageState icon={AlertTriangle} title="Operations could not be loaded" detail={(operations.error as Error).message} retry={() => operations.refetch()} />;
  if (!operations.data?.allowed) return <PageState icon={AlertTriangle} title="Management access required" detail="This page is only available to Super Admin, Admin, and Manager roles." />;

  const data = operations.data;
  const summary = [
    { label: "Active Clients", value: data.metrics.active_clients, icon: BriefcaseBusiness },
    { label: "Tasks Assigned Today", value: data.metrics.assigned_today, icon: Users },
    { label: "Work Completed", value: data.metrics.work_completed, icon: CheckCheck },
    { label: "Awaiting Review", value: data.metrics.awaiting_review, icon: Clock3 },
    { label: "Revision Required", value: data.metrics.revision_required, icon: RotateCcw },
    { label: "Completed Tasks", value: data.metrics.completed_today, icon: ClipboardCheck },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 px-3 py-4 pb-24 sm:px-5 sm:py-6 lg:px-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Management · Live desk</div>
          <h1 className="mt-1 text-[22px] font-bold text-foreground sm:text-[24px]">Today’s Operations</h1>
          <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">{data.date_label} · Dhaka time</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11.5px] text-muted-foreground sm:inline">Updated {formatTime(data.generated_at)}</span>
          <Button variant="outline" size="sm" loading={operations.isFetching} onClick={() => operations.refetch()} aria-label="Refresh operations">
            <RefreshCw /> Refresh
          </Button>
        </div>
      </header>

      <section aria-label="Today’s summary" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {summary.map(({ label, value, icon: Icon }) => (
          <div key={label} className="min-h-[88px] rounded-md border border-border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
              <Icon className="size-4 shrink-0 text-primary" />
            </div>
            <div className="mt-3 font-mono text-[24px] font-bold text-foreground">{value.toLocaleString("en-US")}</div>
          </div>
        ))}
      </section>

      <section className="sticky top-0 z-20 -mx-3 border-y border-border bg-background/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:bg-card sm:px-3">
        <div className="flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] sm:pb-0">
          {FILTERS.map((item) => (
            <Button key={item.key} size="sm" variant={filter === item.key ? "default" : "outline"} className="shrink-0" onClick={() => setFilter(item.key)}>{item.label}</Button>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_180px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search task, client, project, team…" className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-[13px] font-medium outline-none focus:border-primary" />
          </label>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)} aria-label="Filter by client" className="h-10 rounded-md border border-border bg-background px-3 text-[13px] font-semibold">
            <option value="all">All clients</option>
            {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={memberId} onChange={(event) => setMemberId(event.target.value)} aria-label="Filter by team member" className="h-10 rounded-md border border-border bg-background px-3 text-[13px] font-semibold">
            <option value="all">All team members</option>
            {members.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-foreground">Client work <span className="font-mono text-muted-foreground">({visibleTasks.length})</span></h2>
        {(filter !== "all" || search || clientId !== "all" || memberId !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilter("all"); setSearch(""); setClientId("all"); setMemberId("all"); }}>Clear filters</Button>
        )}
      </div>

      {grouped.length ? (
        <div className="space-y-5">
          {grouped.map(([id, group]) => (
            <section key={id} aria-labelledby={`client-${id}`}>
              <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-[12px] font-bold text-primary">{initials(group.name)}</div>
                <div className="min-w-0 flex-1">
                  <h3 id={`client-${id}`} className="truncate text-[15px] font-bold text-foreground">{group.name}</h3>
                  <p className="text-[11.5px] font-medium text-muted-foreground">{group.code ? `${group.code} · ` : ""}{group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}</p>
                </div>
              </div>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {group.tasks.map((task) => <OperationTaskRow key={task.id} task={task} onOpen={() => setOpenId(task.id)} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid min-h-52 place-items-center rounded-md border border-dashed border-border px-5 text-center">
          <div><ClipboardCheck className="mx-auto size-7 text-muted-foreground" /><div className="mt-2 text-[15px] font-bold">No matching work</div><p className="mt-1 text-[13px] text-muted-foreground">There is no activity for the selected filters today.</p></div>
        </div>
      )}

      {open && <TaskDetailSheet task={open} users={users.data ?? []} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function OperationTaskRow({ task, onOpen }: { task: OperationsTask; onOpen: () => void }) {
  const done = task.assignees.reduce((sum, member) => sum + member.done_qty, 0);
  const total = task.total_output ?? task.assignees.reduce((sum, member) => sum + (member.quantity ?? 0), 0);
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : Math.max(0, Math.round((stepIndex(task.status) / (TASK_STEPS.length - 1)) * 100));
  return (
    <article className="rounded-md border border-border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/35">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="min-w-0 flex-1 text-[15px] font-bold text-foreground">{task.title}</h4>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold", STATUS_STYLE[task.status] ?? "border-primary/30 bg-primary/10 text-primary")}>{stepLabel(task.status)}</span>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] font-medium text-muted-foreground">{task.project_title || "No project"} · <span className="capitalize">{task.priority}</span>{task.due_on ? ` · Due ${formatDate(task.due_on)}` : ""}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center -space-x-1.5">
          {task.assignees.slice(0, 4).map((member) => <MiniAvatar key={member.id} name={member.name} url={member.avatar_url} />)}
          <span className="ml-2 truncate pl-1 text-[12px] font-semibold text-muted-foreground">{task.assignees.length ? task.assignees.map((member) => member.name || "Member").join(", ") : "Unassigned"}</span>
        </div>
        <span className="shrink-0 font-mono text-[12px] font-bold text-foreground">{total > 0 ? `${done}/${total}` : `${percent}%`}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${percent}%` }} /></div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-foreground">{task.latest_activity_label}</div>
          <div className="text-[11.5px] text-muted-foreground">{formatTime(task.latest_activity_at)}{task.completed_today > 0 ? ` · +${task.completed_today} completed` : ""}</div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpen}>Open task</Button>
      </div>
    </article>
  );
}

function MiniAvatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) return <img src={url} alt={name ?? ""} className="size-7 shrink-0 rounded-full object-cover ring-2 ring-card" />;
  return <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary ring-2 ring-card">{initials(name || "?")}</span>;
}

function PageState({ icon: Icon, title, detail, retry, spin }: { icon: typeof AlertTriangle; title: string; detail?: string; retry?: () => void; spin?: boolean }) {
  return <div className="grid min-h-[65vh] place-items-center px-5 text-center"><div><Icon className={cn("mx-auto size-7 text-muted-foreground", spin && "animate-spin")} /><h1 className="mt-3 text-[17px] font-bold">{title}</h1>{detail && <p className="mt-1 max-w-md text-[13px] text-muted-foreground">{detail}</p>}{retry && <Button className="mt-4" onClick={retry}>Try again</Button>}</div></div>;
}

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
const formatTime = (value: string) => new Date(value).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", hour12: true });
const formatDate = (value: string) => new Date(`${value}T00:00:00+06:00`).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" });