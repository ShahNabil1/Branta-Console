// Smart task Activity log: per-person filter, before → after details, per-person subtask progress and 20-per-page "View more".
import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompanyTaskDetail } from "@/lib/company-tasks.functions";
import { TASK_PRIORITIES, statusLabel } from "@/lib/company-task-rules";
import { cn } from "@/lib/utils";
import { PersonAvatar, fmtDateTime, fmtDue, spring } from "./task-ui";

type A = CompanyTaskDetail["activity"][number];
type D = Record<string, any>;
const PAGE = 20;

const TEXT: Record<string, string> = {
  created: "created the task", updated: "edited the task", status: "changed the task status", approved: "completed the task", archived: "deleted the task (moved to Archived)", unarchived: "restored the task", published: "made the task live", scheduled: "scheduled the task", drafted: "moved the task to drafts",
  assignees: "changed the assignees", subtask_added: "added a subtask", subtask_removed: "removed a subtask", subtask_done: "completed a subtask",
  subtask_reopened: "reopened a subtask", subtask_edited: "edited a subtask", assets_added: "added assets", asset_removed: "removed an asset",
  asset_updated: "updated an asset", submitted: "submitted work", submission_approved: "approved a submission", revision_requested: "requested a revision",
  my_status: "updated their progress", commented: "commented", comment_removed: "removed a comment", note: "added a note",
};
const TONE: Record<string, string> = {
  created: "bg-brand", approved: "bg-status-converted", submission_approved: "bg-status-converted", subtask_done: "bg-status-converted",
  revision_requested: "bg-destructive", asset_removed: "bg-destructive", subtask_removed: "bg-destructive", comment_removed: "bg-destructive", archived: "bg-destructive",
  submitted: "bg-status-contacted", my_status: "bg-brand", subtask_reopened: "bg-amber-500",
};
const FIELD: Record<string, string> = { title: "Title", description: "Description", priority: "Priority", status: "Status", due_on: "Due date", due_time: "Due time", tags: "Tags", project_id: "Project", assignee_id: "Assignee", kind: "Type", subtask_id: "Subtask" };
const PROGRESS: Record<string, string> = { todo: "Not started", doing: "Working on it", submitted: "Submitted", approved: "Approved", revision: "Revision" };

export function TaskActivityLog({ t, projects, composer }: { t: CompanyTaskDetail; projects: { id: string; title: string }[]; composer?: ReactNode }) {
  const [who, setWho] = useState<string>("all");
  const [shown, setShown] = useState(PAGE);
  const name = (id?: string | null) => (id ? t.people[id]?.name ?? t.assignee_rows.find((a) => a.user_id === id)?.name ?? "Former member" : "Anyone");
  const subName = (id?: string | null, fallback?: string | null) => {
    if (!id) return fallback ?? "Whole task";
    const i = t.subtasks.findIndex((s) => s.id === id);
    return i >= 0 ? `${i + 1}. ${t.subtasks[i].title}` : fallback ?? "Removed subtask";
  };
  const val = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "—";
    if (field === "status") return statusLabel(String(v));
    if (field === "priority") return TASK_PRIORITIES.find((p) => p.key === v)?.label ?? String(v);
    if (field === "due_on") return fmtDue(String(v), null);
    if (field === "due_time") return String(v).slice(0, 5);
    if (field === "project_id") return projects.find((p) => p.id === v)?.title ?? "Linked project";
    if (field === "assignee_id") return name(String(v));
    if (field === "subtask_id") return subName(String(v));
    if (field === "kind") return v === "reference" ? "Reference" : "Asset";
    if (Array.isArray(v)) return v.join(", ");
    const s = String(v);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  };
  const assetName = (d: D) => d.name ?? t.asset_rows.find((a) => a.url === d.url)?.title ?? (d.url ? String(d.url).replace(/^https?:\/\//, "").slice(0, 60) : "Asset");

  const people = [...new Set([t.activity.find((a) => a.kind === "created")?.actor_id, ...t.assignee_rows.map((a) => a.user_id)].filter(Boolean) as string[])];
  const involves = (a: A, uid: string) => { const d = (a.detail ?? {}) as D; return a.actor_id === uid || d.for === uid || d.assignee_id === uid; };
  const list = who === "all" ? t.activity : t.activity.filter((a) => involves(a, who));
  const count = (uid: string) => t.activity.filter((a) => involves(a, uid)).length;

  const details = (a: A): ReactNode => {
    const d = (a.detail ?? {}) as D;
    const chip = (label: string, v: ReactNode) => <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-bold"><span className="font-semibold text-muted-foreground">{label}</span>{v}</span>;
    const change = (c: { field: string; from: unknown; to: unknown }, k: number) => (
      <div key={k} className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <span className="font-bold text-foreground/80">{FIELD[c.field] ?? c.field}</span>
        <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive line-through decoration-destructive/50">{val(c.field, c.from)}</span>
        <ArrowRight className="size-3 text-muted-foreground" />
        <span className="rounded bg-status-converted/10 px-1.5 py-0.5 font-bold text-status-converted">{val(c.field, c.to)}</span>
      </div>
    );
    const changes = Array.isArray(d.changes) ? (d.changes as { field: string; from: unknown; to: unknown }[]) : [];
    switch (a.kind) {
      case "created": return <div className="flex flex-wrap gap-1">{d.title && chip("Title", d.title)}{chip("Assignees", d.assignees ?? 0)}{chip("Subtasks", d.subtasks ?? 0)}{chip("Assets", d.assets ?? 0)}{d.publish_state && chip("State", d.publish_state)}</div>;
      case "updated": case "status":
        return changes.length ? <div className="space-y-1">{changes.map(change)}</div>
          : d.status ? change({ field: "status", from: d.from_status ?? null, to: d.status }, 0)
          : Array.isArray(d.fields) ? <span className="text-[11.5px] text-muted-foreground">Changed: {d.fields.map((f: string) => FIELD[f] ?? f).join(", ")}</span> : null;
      case "my_status": return change({ field: "progress", from: d.from ? PROGRESS[d.from] ?? d.from : null, to: PROGRESS[d.status] ?? d.status }, 0);
      case "assignees": return <div className="flex flex-wrap gap-1">
        {(d.added ?? []).map((u: string) => <span key={`a${u}`} className="rounded bg-status-converted/10 px-1.5 py-0.5 text-[11px] font-bold text-status-converted">+ {name(u)}</span>)}
        {(d.removed ?? []).map((u: string) => <span key={`r${u}`} className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-bold text-destructive line-through">{name(u)}</span>)}</div>;
      case "subtask_done": case "subtask_reopened": case "subtask_added": case "subtask_removed": case "subtask_edited": {
        const owner = d.for ?? d.assignee_id ?? t.subtasks.find((s) => s.id === d.subtask_id || s.title === d.title)?.assignee_id ?? null;
        const mine = owner ? t.subtasks.filter((s) => s.assignee_id === owner) : [];
        const left = mine.filter((s) => !s.done);
        return (
          <div className="space-y-1">
            <div className={cn("flex items-center gap-1.5 text-[12px] font-bold", a.kind === "subtask_removed" && "text-destructive line-through")}><ListChecks className="size-3.5 text-muted-foreground" />{subName(d.subtask_id, d.title)}</div>
            {d.description && a.kind !== "subtask_edited" && <p className="text-[11.5px] text-muted-foreground">{d.description}</p>}
            {changes.map(change)}
            <div className="flex flex-wrap gap-1">
              {owner && chip("For", name(owner))}
              {d.auto && chip("Ticked by", "approved review")}
              {(a.kind === "subtask_done" || a.kind === "subtask_reopened") && owner && mine.length > 0 && (left.length
                ? <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold text-amber-600">{left.length} of {mine.length} still open: {left.map((s) => s.title).join(", ")}</span>
                : <span className="rounded bg-status-converted/10 px-1.5 py-0.5 text-[11px] font-bold text-status-converted">All {mine.length} of {name(owner).split(" ")[0]}'s subtasks done</span>)}
            </div>
          </div>
        );
      }
      case "assets_added": return Array.isArray(d.items) ? <ul className="space-y-0.5">{d.items.map((x: D, k: number) => <li key={k} className="flex flex-wrap items-center gap-1 text-[11.5px]"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-extrabold uppercase">{x.kind === "reference" ? "Reference" : "Asset"}</span><span className="max-w-[16rem] truncate font-bold">{x.name}</span><span className="text-muted-foreground">· {subName(x.subtask_id)} · {name(x.assignee_id)}</span></li>)}</ul> : chip("Items", d.count);
      case "asset_removed": return <div className="flex flex-wrap items-center gap-1 text-[11.5px]"><span className="rounded bg-destructive/10 px-1.5 py-0.5 font-bold text-destructive line-through">{assetName(d)}</span>{d.kind && chip("Type", val("kind", d.kind))}{"subtask_id" in d && chip("Subtask", subName(d.subtask_id))}{"assignee_id" in d && chip("For", name(d.assignee_id))}</div>;
      case "asset_updated": return <div className="space-y-1"><div className="max-w-full truncate text-[12px] font-bold">{assetName(d)}</div>{changes.length ? changes.map(change) : d.assignee_id !== undefined && change({ field: "assignee_id", from: null, to: d.assignee_id }, 0)}</div>;
      case "submitted": return <div className="flex flex-wrap gap-1">{chip("For", subName(d.subtask_id))}{d.asset_id && chip("Asset", t.asset_rows.find((x) => x.id === d.asset_id)?.title ?? "Asset")}{chip("Files", d.files ?? 0)}{d.link && chip("Link", "included")}</div>;
      case "submission_approved": case "revision_requested": return <div className="space-y-1"><div className="flex flex-wrap gap-1">{d.for && chip("Work by", name(d.for))}{"subtask_id" in d && chip("For", subName(d.subtask_id, d.subtask))}</div>{d.note && <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-2 py-1 text-[12px]">{d.note}</p>}</div>;
      case "scheduled": return d.scheduled_at ? chip("Starts", fmtDateTime(d.scheduled_at)) : null;
      case "commented": case "comment_removed": return d.body ? <p className={cn("whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-2 py-1 text-[12px]", a.kind === "comment_removed" && "text-muted-foreground line-through")}>{d.body}</p> : null;
      default: return d.note ? <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-2 py-1 text-[12.5px]">{d.note}</p> : null;
    }
  };

  return (
    <div className="space-y-3">
      {composer}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[{ id: "all", label: "Everyone", n: t.activity.length }, ...people.map((u) => ({ id: u, label: name(u), n: count(u) }))].map((p) => (
          <button key={p.id} type="button" onClick={() => { setWho(p.id); setShown(PAGE); }} aria-pressed={who === p.id}
            className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] font-bold transition-colors", who === p.id ? "border-brand bg-brand/10 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground", p.id === "all" && "pl-2.5")}>
            {p.id !== "all" && <PersonAvatar name={p.label} src={t.people[p.id]?.avatar_url ?? t.assignee_rows.find((a) => a.user_id === p.id)?.avatar_url} size={20} />}
            {p.label}<span className="font-mono text-[10.5px] text-muted-foreground">{p.n}</span>
          </button>
        ))}
      </div>
      {!list.length && <p className="py-6 text-center text-[12.5px] text-muted-foreground">No activity yet.</p>}
      <ol className="relative space-y-3 border-l border-border pl-4">
        {list.slice(0, shown).map((a, i) => {
          const p = t.people[a.actor_id];
          const body = details(a);
          return (
            <motion.li key={a.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: Math.min(i % PAGE, 12) * 0.02 }} className="relative">
              <span className={cn("absolute -left-[21px] top-1.5 size-2.5 rounded-full ring-2 ring-card", TONE[a.kind] ?? "bg-muted-foreground/50")} />
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <PersonAvatar name={p?.name ?? "?"} src={p?.avatar_url} size={18} />
                <span className="font-bold">{p?.name ?? "Team member"}</span>
                <span className="text-muted-foreground">{TEXT[a.kind] ?? a.kind}</span>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">{fmtDateTime(a.created_at)}</span>
              </div>
              {body && <div className="ml-6 mt-1.5 min-w-0 [overflow-wrap:anywhere]">{body}</div>}
            </motion.li>
          );
        })}
      </ol>
      {list.length > shown && (
        <div className="flex justify-center"><Button size="sm" variant="outline" onClick={() => setShown((n) => n + PAGE)} className="h-8 rounded-md font-bold">View more ({list.length - shown} left)</Button></div>
      )}
    </div>
  );
}
