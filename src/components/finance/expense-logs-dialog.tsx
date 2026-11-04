import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listExpenseLogs, ACTION_LABEL } from "@/lib/expense-logs.functions";
import { listEmployeesForFinance } from "@/lib/finance.functions";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ExpenseDrawerContent, ExpenseDrawerHeader } from "./expense-drawer";
import { SearchableSelect, type SearchableItem } from "./searchable-select";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Loader2, History, ArrowRight, CalendarRange, Pencil, FileText, Share2, Eye, Download, Plus, Trash2, RotateCcw, Clock } from "lucide-react";
import { activityGroup, activityPresets, activityRange, dhakaDay, matchesActivity, type ActivityGroup, type ActivityPreset } from "./expense-activity-filters";
import { cn } from "@/lib/utils";

function eventStyle(action: string) {
  if (action === "created" || action === "restored") return { icon: action === "created" ? Plus : RotateCcw, tone: "border-status-converted/25 bg-status-converted/5", ink: "text-status-converted" };
  if (/deleted|purged|removed|disabled/.test(action)) return { icon: Trash2, tone: "border-destructive/25 bg-destructive/5", ink: "text-destructive" };
  if (action === "updated") return { icon: Pencil, tone: "border-status-contacted/25 bg-status-contacted/5", ink: "text-status-contacted" };
  if (activityGroup(action) === "sharing") return { icon: Share2, tone: "border-status-viewed/25 bg-status-viewed/5", ink: "text-status-viewed" };
  return { icon: action.includes("download") ? Download : action.includes("view") ? Eye : FileText, tone: "border-status-new/25 bg-status-new/5", ink: "text-status-new" };
}
const groups: { id: ActivityGroup; label: string; icon: typeof History }[] = [
  { id: "all", label: "All activity", icon: History }, { id: "changes", label: "Changes", icon: Pencil },
  { id: "documents", label: "Documents", icon: FileText }, { id: "sharing", label: "Sharing", icon: Share2 },
];
const dateClass = "h-10 w-full min-w-0 rounded-md border border-border bg-card px-2 text-[12px] font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

export function ExpenseLogsDialog({ expenseId, voucherNo, createdAt, employeeItems: suppliedEmployees, onClose }: {
  expenseId: string; voucherNo: string | null; createdAt?: string; employeeItems?: SearchableItem[]; onClose: () => void;
}) {
  const listFn = useServerFn(listExpenseLogs);
  const employeesFn = useServerFn(listEmployeesForFinance);
  const q = useQuery({ queryKey: ["expense-logs", expenseId], queryFn: () => listFn({ data: { expenseId } }) });
  const employees = useQuery({ queryKey: ["finance-employees"], queryFn: () => employeesFn(), enabled: !suppliedEmployees, staleTime: 60_000 });
  const logs = q.data ?? [];
  const items = suppliedEmployees ?? (employees.data ?? []).map(e => ({ value: e.user_id, label: e.full_name ?? e.user_id.slice(0, 8), hint: e.employee_code, sub: e.job_role, avatar: e.avatar_url ?? "", keywords: [e.full_name, e.employee_code, e.job_role] }));
  const missingActors = [...new Set(logs.flatMap(l => l.actor_id && !items.some(e => e.value === l.actor_id) ? [l.actor_id] : []))].sort();
  // Existing RLS-protected profile reads supply historical/deactivated actors too.
  const historical = useQuery({ queryKey: ["expense-log-actors", missingActors], enabled: missingActors.length > 0,
    queryFn: async () => { const { data, error } = await supabase.from("profiles").select("user_id,full_name,avatar_url").in("user_id", missingActors); if (error) throw error; return data ?? []; }, staleTime: 60_000 });
  const people = new Map(items.map(e => [e.value, e]));
  for (const p of historical.data ?? []) people.set(p.user_id, { value: p.user_id, label: p.full_name ?? p.user_id.slice(0, 8), avatar: p.avatar_url ?? "" });
  for (const l of logs) if (l.actor_id && !people.has(l.actor_id)) people.set(l.actor_id, { value: l.actor_id, label: l.actor_name || l.actor_id.slice(0, 8), avatar: "" });
  const actorIds = new Set(logs.map(l => l.actor_id));
  const employeeOptions = [...people.values()].filter(p => actorIds.has(p.value));
  const [actor, setActor] = useState("");
  const [group, setGroup] = useState<ActivityGroup>("all");
  const [preset, setPreset] = useState<ActivityPreset>("all");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [draft, setDraft] = useState({ from: "", to: "" });
  const today = dhakaDay(new Date());
  const earliest = createdAt ?? logs.find(l => l.action === "created")?.created_at ?? logs.at(-1)?.created_at;
  const firstDay = earliest ? dhakaDay(earliest) : today;
  const range = activityRange(preset, firstDay, today, custom);
  const validDraft = !!draft.from && !!draft.to && draft.from >= firstDay && draft.to <= today && draft.from <= draft.to;
  const dateLogs = logs.filter(l => matchesActivity(l, range, actor, "all"));
  const filtered = dateLogs.filter(l => group === "all" || activityGroup(l.action) === group);
  const presets = activityPresets(firstDay, today);

  return <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
    <ExpenseDrawerContent>
      <ExpenseDrawerHeader>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-inset ring-brand/20"><History className="size-5" /></span>
          <div className="min-w-0"><SheetTitle className="text-[16px] font-bold">Activity log</SheetTitle>
            <SheetDescription className="mt-1 break-words font-mono text-[11.5px] [overflow-wrap:anywhere]">{voucherNo ?? expenseId.slice(0, 8)} · {logs.length} events</SheetDescription>
          </div>
        </div>
      </ExpenseDrawerHeader>
      <div className="min-w-0 shrink-0 border-b border-border px-5 py-3 sm:px-6">
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverAnchor asChild><div className="min-w-0"><UnderlineTabs size="sm" ariaLabel="Activity date range" value={preset}
            onChange={id => { if (id === "custom") { setDraft(range); setCustomOpen(true); } else setPreset(id); }}
            items={presets.map(p => ({ ...p, icon: p.id === "custom" ? CalendarRange : undefined }))} /></div></PopoverAnchor>
          <PopoverContent align="end" className="w-[min(340px,calc(100vw-32px))] rounded-lg p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 text-[11px] font-bold">From<input type="date" aria-label="Activity from date" className={dateClass} min={firstDay} max={draft.to || today} value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} /></label>
              <label className="min-w-0 text-[11px] font-bold">To<input type="date" aria-label="Activity to date" className={dateClass} min={draft.from || firstDay} max={today} value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} /></label>
            </div>
            <Button size="sm" className="expense-action mt-3 w-full font-bold" disabled={!validDraft} onClick={() => { setCustom(draft); setPreset("custom"); setCustomOpen(false); }}>Apply range</Button>
          </PopoverContent>
        </Popover>
        <div className="mt-3 space-y-1.5"><div className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Employee</div>
          <SearchableSelect items={employeeOptions} value={actor} onChange={setActor} placeholder="All employees" clearable emptyText="No matching employees" />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-mono"><CalendarRange className="size-3.5" />{range.from} → {range.to}</span>
          <span>{filtered.length} of {logs.length} events</span>
        </div>
      </div>
      <div className="min-w-0 shrink-0 border-b border-border px-3 sm:px-4"><UnderlineTabs size="sm" ariaLabel="Activity type" value={group} onChange={setGroup}
        items={groups.map(g => ({ ...g, count: dateLogs.filter(l => g.id === "all" || activityGroup(l.action) === g.id).length }))} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        {q.isLoading ? <div className="grid h-40 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          : q.isError ? <p role="alert" className="py-10 text-center text-[12px] text-destructive">Activity could not be loaded.</p>
          : filtered.length === 0 ? <div className="grid place-items-center gap-2 py-12 text-center text-muted-foreground"><History className="size-8 opacity-40" /><p className="text-[12px] font-semibold">{logs.length ? "No activity matches these filters." : "No activity recorded yet."}</p></div>
          : <ol key={`${group}-${preset}-${actor}-${range.from}-${range.to}`} className="space-y-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-200">
            {filtered.map(l => {
              const { icon: Icon, tone, ink } = eventStyle(l.action);
              const person = l.actor_id ? people.get(l.actor_id) : undefined;
              const name = person?.label || l.actor_name || "System";
              return <li key={l.id} className={cn("min-w-0 rounded-lg border p-3 transition-colors hover:border-foreground/20", tone)}>
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-md border bg-card", tone, ink)}><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1"><div className={cn("break-words text-[12px] font-extrabold [overflow-wrap:anywhere]", ink)}>{ACTION_LABEL[l.action] ?? l.title ?? l.action}</div>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"><Clock className="size-3 shrink-0" />{new Date(l.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })} (GMT+6)</div>
                  </div>
                </div>
                <div className="mt-2.5 flex min-w-0 items-center gap-2 border-t border-border/60 pt-2.5">
                  <Avatar className="size-7 ring-2 ring-card"><AvatarImage src={person?.avatar || undefined} alt={name} className="object-cover" /><AvatarFallback className="bg-card text-[10px] font-bold">{name.split(/\s+/).slice(0, 2).map(n => n[0]).join("")}</AvatarFallback></Avatar>
                  <span className="min-w-0 break-words text-[11.5px] font-bold [overflow-wrap:anywhere]">{name}</span>
                  {person?.hint && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{person.hint}</span>}
                </div>
                {l.reason && <p className="mt-3 break-words border-l-2 border-status-contacted bg-card/70 px-3 py-2 text-[12px] leading-relaxed [overflow-wrap:anywhere]"><span className="font-bold text-status-contacted">Reason · </span>{l.reason}</p>}
                {!!l.changes?.length && <ul className="mt-3 space-y-2">{l.changes.map((c, i) => <li key={i} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1.5 text-[11.5px]">
                  <span className="col-span-3 break-words font-bold [overflow-wrap:anywhere]">{c.field}</span>
                  <span className="min-w-0 break-words rounded-md border border-destructive/15 bg-destructive/5 px-2 py-1.5 text-destructive line-through [overflow-wrap:anywhere]">{c.before ?? "—"}</span>
                  <ArrowRight className="mt-2 size-3 text-muted-foreground" />
                  <span className="min-w-0 break-words rounded-md border border-status-converted/20 bg-status-converted/10 px-2 py-1.5 font-semibold text-status-converted [overflow-wrap:anywhere]">{c.after ?? "—"}</span>
                </li>)}</ul>}
                {Object.entries(l.metadata ?? {}).filter(([, v]) => v !== null).map(([key, value]) => <div key={key} className="mt-2 break-words text-[11px] [overflow-wrap:anywhere]"><span className="font-bold text-muted-foreground">{key.replaceAll("_", " ")} · </span>{String(value)}</div>)}
              </li>;
            })}
          </ol>}
      </div>
    </ExpenseDrawerContent>
  </Sheet>;
}