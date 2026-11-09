// New Task: single-page property-list drawer (Notion-style rows) for company tasks.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { CalendarDays, Check, FileText, Flag, FolderKanban, Link2, ListChecks, Loader, Plus, SquareCheckBig, Tag, Users, X } from "lucide-react";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TestLoader } from "@/components/ui/test-loader";
import { DiscardCancelButton } from "@/components/company/danger-confirm";
import { ExpenseDrawerContent, ExpenseDrawerHeader } from "@/components/finance/expense-drawer";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { createCompanyTask, requestTaskAssetUpload, type TaskMember } from "@/lib/company-tasks.functions";
import { MAX_TASK_ASSETS, MAX_TASK_TAGS, TASK_PRIORITIES, TASK_STATUSES, submissionFileKind, type CompanyTaskStatus } from "@/lib/company-task-rules";
import { AREA, FIELD, LABEL, AssetKindToggle, PersonAvatar, PropRow, PRIORITY_SOFT, STATUS_TONE, SoftPill, spring } from "./task-ui";
import { TaskAssetComposer, type ComposedItem } from "./task-asset-composer";
import { ReceiptThumb } from "@/components/finance/receipt-media";


type Draft = {
  title: string; priority: string; status: CompanyTaskStatus; due_on: string; due_time: string; project_id: string; tags: string[];
  description: string; assignees: string[]; subtasks: { title: string; description: string; assignee_id: string }[]; assets: { id: string; url: string; file?: File; title: string; assignee_id: string; kind: "asset" | "reference"; subtask: string }[];
};
const empty = (status: CompanyTaskStatus): Draft => ({ title: "", priority: "normal", status, due_on: "", due_time: "", project_id: "", tags: [], description: "", assignees: [], subtasks: [], assets: [] });

export function NewTaskDrawer({ open, onOpenChange, workspace, companyName, members, projects, me, initialStatus = "todo", onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; workspace: string | null; companyName: string;
  members: TaskMember[]; projects: { id: string; title: string }[]; me: string; initialStatus?: CompanyTaskStatus; onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createCompanyTask);
  const [d, setD] = useState<Draft>(() => empty(initialStatus));
  const [tag, setTag] = useState("");
  const [sub, setSub] = useState("");
  const [mode, setMode] = useState<"live" | "scheduled" | "draft">("live");
  const [startOn, setStartOn] = useState(""); const [startAt, setStartAt] = useState("09:00");
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) { setLastOpen(open); if (open) { setD(empty(initialStatus)); setMode("live"); setStartOn(""); setTag(""); setSub(""); } }

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const memberItems = members
    .map((m) => ({ value: m.user_id, label: m.user_id === me ? `${m.name} (me)` : m.name, avatar: m.avatar_url ?? "", hint: m.code }));
  const teamItems = d.assignees.map((u) => ({ value: u, label: memberById.get(u)?.name ?? "Team member", avatar: memberById.get(u)?.avatar_url ?? "" }));
  const dirty = JSON.stringify(d) !== JSON.stringify(empty(initialStatus));

  const addTag = () => {
    const t = tag.trim();
    if (!t) return;
    if (d.tags.length >= MAX_TASK_TAGS) return toast.error(`At most ${MAX_TASK_TAGS} tags`);
    if (!d.tags.includes(t)) setD({ ...d, tags: [...d.tags, t] });
    setTag("");
  };
  const addSub = () => {
    const t = sub.trim();
    if (!t) return;
    setD({ ...d, subtasks: [...d.subtasks, { title: t, description: "", assignee_id: "" }] });
    setSub("");
  };
  const addItems = (items: ComposedItem[]) => setD((cur) => ({ ...cur, assets: [...cur.assets, ...items.map((it) => ({
    id: crypto.randomUUID(), url: it.url ?? "", file: it.file, title: it.file?.name ?? "", kind: it.kind, subtask: it.subtask,
    assignee_id: it.assignee_id && cur.assignees.includes(it.assignee_id) ? it.assignee_id : "",
  }))] }));
  const presign = useServerFn(requestTaskAssetUpload);
  const [phase, setPhase] = useState<string | null>(null);
  const removeAssignee = (u: string) => setD({
    ...d, assignees: d.assignees.filter((x) => x !== u),
    subtasks: d.subtasks.map((s) => (s.assignee_id === u ? { ...s, assignee_id: "" } : s)),
    assets: d.assets.map((a) => (a.assignee_id === u ? { ...a, assignee_id: "" } : a)),
  });

  const startIso = startOn && startAt ? new Date(`${startOn}T${startAt}`).toISOString() : null;
  const scheduleBad = mode === "scheduled" && (!startIso || new Date(startIso).getTime() <= Date.now());
  const save = useMutation({
    mutationFn: async () => {
      const files = d.assets.filter((a) => a.file);
      const uploaded = new Map<string, { key: string; name: string; mime: string; size: number }>();
      for (const [i, a] of files.entries()) {
        const f = a.file!;
        setPhase(`Uploading ${i + 1}/${files.length}…`);
        const mime = f.type || "application/octet-stream";
        const { url, key } = await presign({ data: { workspace, name: f.name, mime, size: f.size } });
        const res = await fetch(url, { method: "PUT", headers: { "Content-Type": mime }, body: f });
        if (!res.ok) throw new Error(`${f.name} could not be uploaded.`);
        uploaded.set(a.id, { key, name: f.name, mime, size: f.size });
      }
      setPhase("Saving…");
      return create({ data: {
      publish_state: mode, scheduled_at: mode === "scheduled" ? startIso : null,
      workspace, title: d.title.trim(), description: d.description || null, priority: d.priority as "normal", status: d.status,
      due_on: d.due_on || null, due_time: d.due_on && d.due_time ? d.due_time : null, tags: d.tags, project_id: d.project_id || null, assignees: d.assignees,
      subtasks: d.subtasks.map((s) => ({ title: s.title, description: s.description.trim() || null, assignee_id: s.assignee_id || null })),
      assets: d.assets.map((a) => ({ kind: a.kind, url: a.file ? null : a.url, file: uploaded.get(a.id) ?? null, title: a.title || null, assignee_id: a.assignee_id || null, subtask_index: a.subtask !== "" && d.subtasks[Number(a.subtask)] ? Number(a.subtask) : null })),
    } });
    },
    onSettled: () => setPhase(null),
    onSuccess: (r) => {
      toast.success(mode === "draft" ? "Draft saved" : mode === "scheduled" ? "Task scheduled" : "Task created");
      qc.invalidateQueries({ queryKey: ["company-tasks"] });
      onOpenChange(false);
      onCreated?.(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v && !save.isPending) onOpenChange(false); }}>
      <ExpenseDrawerContent className="sm:inset-y-3 sm:right-3 sm:h-auto sm:max-w-[680px] sm:rounded-2xl sm:border sm:border-border sm:shadow-[0_24px_60px_-20px_rgb(0_0_0/0.25)]">
        <ExpenseDrawerHeader className="border-b-0 pb-1 pt-4">
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <SquareCheckBig className="size-4" strokeWidth={1.75} />
            <span>{companyName}</span><span>/</span><span>Tasks</span><span>/</span><span className="text-foreground">New task</span>
          </div>
          <SheetTitle className="sr-only">New task</SheetTitle>
          <SheetDescription className="sr-only">Create a task for {companyName}</SheetDescription>
          <input data-drawer-autofocus value={d.title} maxLength={200} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Untitled task" aria-label="Title"
            className="mt-4 w-full bg-transparent text-[26px] font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/50" />
        </ExpenseDrawerHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
              <div className="divide-y-0">
                <PropRow icon={Loader} label="Status">
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_STATUSES.filter((s) => s.key !== "done").map((s) => (
                      <button key={s.key} type="button" onClick={() => setD({ ...d, status: s.key as CompanyTaskStatus })}
                        className={`rounded-md transition-opacity ${d.status === s.key ? "ring-1 ring-foreground/25" : "opacity-60 hover:opacity-100"}`}>
                        <SoftPill dot tone={STATUS_TONE[s.key] ?? "grey"}>{s.label}</SoftPill>
                      </button>
                    ))}
                  </div>
                </PropRow>
                <PropRow icon={Flag} label="Priority">
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_PRIORITIES.map((p) => (
                      <button key={p.key} type="button" onClick={() => setD({ ...d, priority: p.key })}
                        className={`rounded-md transition-opacity ${d.priority === p.key ? "ring-1 ring-foreground/25" : "opacity-60 hover:opacity-100"}`}>
                        <SoftPill tone={PRIORITY_SOFT[p.key] ?? "grey"}>{p.label}</SoftPill>
                      </button>
                    ))}
                  </div>
                </PropRow>
                <PropRow icon={CalendarDays} label="Due date">
                  <div className="grid max-w-80 grid-cols-[1fr_7rem] gap-2">
                    <Input type="date" value={d.due_on} onChange={(e) => setD({ ...d, due_on: e.target.value, due_time: e.target.value ? d.due_time : "" })} className={FIELD} aria-label="Due date" />
                    <Input type="time" value={d.due_time} disabled={!d.due_on} onChange={(e) => setD({ ...d, due_time: e.target.value })} className={`${FIELD} font-mono`} aria-label="Due time" />
                  </div>
                </PropRow>
                <PropRow icon={FolderKanban} label="Project">
                  <div className="max-w-80"><SearchableSelect clearable items={projects.map((p) => ({ value: p.id, label: p.title }))} value={d.project_id} onChange={(v) => setD({ ...d, project_id: v })} placeholder="Not linked" emptyText="No projects in this company" /></div>
                </PropRow>
                <PropRow icon={Tag} label="Tags">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AnimatePresence initial={false}>
                      {d.tags.map((t) => (
                        <motion.span key={t} layout initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} transition={spring}
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[12px] font-medium text-foreground/75">
                          {t}<button type="button" aria-label={`Remove ${t}`} onClick={() => setD({ ...d, tags: d.tags.filter((x) => x !== t) })}><X className="size-3 text-muted-foreground hover:text-foreground" /></button>
                        </motion.span>
                      ))}
                    </AnimatePresence>
                    <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} enterKeyHint="done"
                      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); addTag(); } }}
                      onBlur={addTag} aria-label="Add tag" placeholder="+ Add tag" className="min-w-24 flex-1 bg-transparent px-1 py-1 text-[12.5px] outline-none placeholder:text-muted-foreground" />
                  </div>
                </PropRow>
              </div>
              <div className="space-y-5">
                <PropRow icon={Users} label="Assignees" top>
                  <div className="max-w-64"><SearchableSelect items={memberItems} value="" checked={d.assignees} onChange={(v) => { if (!v) return; if (d.assignees.includes(v)) removeAssignee(v); else setD({ ...d, assignees: [...d.assignees, v] }); }} placeholder={d.assignees.length ? `+ Add more (${d.assignees.length})` : "+ Invite / add"} emptyText="No members" /></div>
                  <motion.ul layout className="mt-2 flex flex-wrap gap-1.5">
                    <AnimatePresence initial={false}>
                      {d.assignees.map((u) => {
                        const m = memberById.get(u);
                        return (
                          <motion.li key={u} layout initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} transition={spring}
                            className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-[12.5px] font-medium">
                            <PersonAvatar name={m?.name ?? "?"} src={m?.avatar_url} size={20} />{m?.name ?? "Team member"}{u === me && <span className="text-muted-foreground">(me)</span>}
                            <button type="button" aria-label="Remove assignee" onClick={() => removeAssignee(u)}><X className="size-3 text-muted-foreground hover:text-foreground" /></button>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </motion.ul>
                  {!d.assignees.includes(me) && memberById.has(me) && (
                    <button type="button" onClick={() => setD({ ...d, assignees: [...d.assignees, me] })} className="mt-2 text-[12.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Assign to me</button>
                  )}
                </PropRow>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5"><ListChecks className="size-4 text-muted-foreground" /><span className={LABEL}>Subtasks</span><span className="ml-auto font-mono text-[11px] text-muted-foreground">{d.subtasks.length}</span></div>
                  <ul className="mt-2 space-y-1.5">
                    <AnimatePresence initial={false}>
                      {d.subtasks.map((s, i) => (
                        <motion.li key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring}
                          className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/60" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-semibold">{s.title}</div>
                            <textarea value={s.description} maxLength={2000} rows={1} aria-label="Subtask description" placeholder="Add details for this subtask (optional)"
                              onChange={(e) => setD({ ...d, subtasks: d.subtasks.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
                              className="mt-0.5 w-full resize-y rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] font-medium text-muted-foreground outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-brand focus:bg-card" />
                          </div>
                          <div className="w-40 shrink-0"><SearchableSelect clearable searchable={false} items={teamItems} value={s.assignee_id} onChange={(v) => setD({ ...d, subtasks: d.subtasks.map((x, j) => (j === i ? { ...x, assignee_id: v } : x)) })} placeholder="Anyone" emptyText="Add assignees first" /></div>
                          <button type="button" aria-label="Remove subtask" onClick={() => setD({ ...d, subtasks: d.subtasks.filter((_, j) => j !== i) })}><X className="size-3.5 text-muted-foreground hover:text-foreground" /></button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <Input value={sub} onChange={(e) => setSub(e.target.value)} maxLength={300} aria-label="New subtask" enterKeyHint="done"
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); addSub(); } }} className={FIELD} />
                    <Button type="button" variant="outline" onClick={addSub} className="h-10 gap-1 rounded-lg"><Plus className="size-4" />Add</Button>
                  </div>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[13px] text-muted-foreground"><FileText className="size-4" strokeWidth={1.75} />Description</div>
                  <textarea placeholder="Add a short description…" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={4} className={AREA} />
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5"><Link2 className="size-4 text-muted-foreground" /><span className={LABEL}>Assets & reference links</span><span className="ml-auto font-mono text-[11px] text-muted-foreground">{d.assets.length}/{MAX_TASK_ASSETS}</span></div>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">Choose the type and subtask first, then paste links or upload files — up to {MAX_TASK_ASSETS} items.</p>
                  <TaskAssetComposer room={MAX_TASK_ASSETS - d.assets.length} busy={save.isPending} existingUrls={d.assets.map((a) => a.url)} onAdd={addItems}
                    subtasks={d.subtasks.map((st, i) => ({ value: String(i), label: st.title, assignee_id: st.assignee_id || null }))} />
                  <ul className="mt-2 space-y-1.5">
                    <AnimatePresence initial={false}>
                      {d.assets.map((a, i) => (
                        <motion.li key={a.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring}
                          className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 sm:grid-cols-[1fr_10rem_auto]">
                          <div className="flex min-w-0 items-center gap-2">
                          {a.file && <ReceiptThumb r={{ path: null, file: a.file, name: a.file.name, caption: "", isPdf: submissionFileKind(a.file.name, a.file.type) === "pdf", isArchive: submissionFileKind(a.file.name, a.file.type) === "zip" }} onOpen={() => {}} />}
                          <div className="min-w-0 flex-1">
                            <input value={a.title} onChange={(e) => setD({ ...d, assets: d.assets.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} maxLength={200} aria-label="Asset name" placeholder={`Asset ${i + 1}`}
                              className="w-full bg-transparent text-[12.5px] font-bold outline-none" />
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <AssetKindToggle value={a.kind} onChange={(k) => setD({ ...d, assets: d.assets.map((x, j) => (j === i ? { ...x, kind: k } : x)) })} />
                              {d.subtasks.length > 0 && <div className="w-40"><SearchableSelect clearable searchable={false} items={d.subtasks.map((st, k) => ({ value: String(k), label: `${k + 1}. ${st.title}` }))} value={a.subtask}
                                onChange={(v) => { const st = v ? d.subtasks[Number(v)] : undefined; setD({ ...d, assets: d.assets.map((x, j) => (j === i ? { ...x, subtask: v ?? "", assignee_id: st?.assignee_id || x.assignee_id } : x)) }); }} placeholder="Whole task" /></div>}
                            </div>
                          </div>
                          </div>
                          <div className="col-span-2 sm:col-span-1"><SearchableSelect clearable searchable={false} items={teamItems} value={a.assignee_id} onChange={(v) => setD({ ...d, assets: d.assets.map((x, j) => (j === i ? { ...x, assignee_id: v } : x)) })} placeholder="Anyone" emptyText="Add assignees first" /></div>
                          <button type="button" aria-label="Remove link" onClick={() => setD({ ...d, assets: d.assets.filter((_, j) => j !== i) })} className="row-start-1 col-start-2 sm:col-start-3"><X className="size-3.5 text-muted-foreground hover:text-foreground" /></button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
                <div>
                  <label className={LABEL}>When does it start?</label>
                  <div role="radiogroup" aria-label="Publishing" className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1">
                    {([["live", "Publish now"], ["scheduled", "Schedule"], ["draft", "Save as draft"]] as const).map(([k, l]) => (
                      <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                        className={`relative rounded-md px-2 py-1.5 text-[12.5px] font-bold transition-colors ${mode === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {mode === k && <motion.span layoutId="task-publish-mode" transition={spring} className="absolute inset-0 rounded-md border border-border bg-card shadow-sm" />}
                        <span className="relative">{l}</span>
                      </button>
                    ))}
                  </div>
                  <AnimatePresence initial={false}>
                    {mode === "scheduled" && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
                        <div className="mt-2 grid grid-cols-[1fr_7.5rem] gap-2">
                          <Input type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} className={FIELD} aria-label="Start date" />
                          <Input type="time" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`${FIELD} font-mono`} aria-label="Start time" />
                        </div>
                        <p className={`mt-1.5 text-[11.5px] font-semibold ${scheduleBad && startOn ? "text-destructive" : "text-muted-foreground"}`}>
                          {scheduleBad && startOn ? "Pick a time in the future." : "The task appears in To Do for everyone at exactly this time."}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {mode === "draft" && <p className="mt-1.5 text-[11.5px] font-semibold text-muted-foreground">Only task managers can see drafts. Publish or schedule it later.</p>}
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div><div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Assignees</div><div className="mt-0.5 font-mono text-[15px] font-bold">{d.assignees.length}</div></div>
                  <div><div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Subtasks</div><div className="mt-0.5 font-mono text-[15px] font-bold">{d.subtasks.length}</div></div>
                  <div><div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Assets</div><div className="mt-0.5 font-mono text-[15px] font-bold">{d.assets.length}</div></div>
                </div>
              </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-6 py-3.5">
          <DiscardCancelButton dirty={dirty} onCancel={() => onOpenChange(false)} className="h-9 rounded-md" disabled={save.isPending} />
          <div className="flex items-center gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending || !d.title.trim() || scheduleBad} className="h-9 min-w-28 gap-1.5 rounded-lg">
                {save.isPending ? <TestLoader tone="white" /> : <Check className="size-4" />}{save.isPending ? phase ?? "Saving…" : mode === "draft" ? "Save draft" : mode === "scheduled" ? "Schedule task" : "Create task"}
              </Button>
          </div>
        </div>
      </ExpenseDrawerContent>
    </Sheet>
  );
}
