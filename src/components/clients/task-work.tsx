// Work updates feed, work submissions (+ manager review), and finance-only panel.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, FileText, Folder, HardDrive, Loader2, Lock, Pencil, Plus, RotateCcw, Send, Trash2, X, XCircle, BadgeCheck } from "lucide-react";
import {
  PAYMENT_STATUSES, editWorkUpdate, getFinance, listSubmissions, listWorkUpdates, postWorkUpdate, reviewSubmission,
  saveFinance, submitWork, suggestPaymentStatus, type PaymentStatus, type SubmissionLink, type WorkSubmission,
} from "@/lib/task-work.functions";
import { cn } from "@/lib/utils";

const input = "h-11 w-full rounded-md border border-border bg-background px-3 text-[14px] focus:border-primary focus:outline-none";
const tz = { timeZone: "Asia/Dhaka" } as const;
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-US", { ...tz, hour: "numeric", minute: "2-digit" });
const fmtTs = (d: string) => new Date(d).toLocaleString("en-GB", { ...tz, day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const dayKey = (d: string) => new Date(d).toLocaleDateString("en-CA", tz);
function dayLabel(d: string) {
  const k = dayKey(d), today = dayKey(new Date().toISOString()), y = dayKey(new Date(Date.now() - 864e5).toISOString());
  if (k === today) return "Today";
  if (k === y) return "Yesterday";
  return new Date(d).toLocaleDateString("en-GB", { ...tz, day: "2-digit", month: "short", year: "numeric" });
}
const initials = (n: string | null) => (n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
function Avatar({ name, url, size = 30 }: { name: string | null; url: string | null; size?: number }) {
  return url ? <img src={url} alt={name ?? ""} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>;
}
function MiniSheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[100dvh] w-full flex-col rounded-t-xl bg-card animate-[sheet-up_.25s_ease-out] sm:max-h-[90dvh] sm:max-w-lg sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-[16px] font-bold">{title}</div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md hover:bg-muted"><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        <div className="border-t border-border p-3 pb-safe">{footer}</div>
      </div>
    </div>
  );
}
const PrimaryBtn = ({ pending, onClick, children, className }: { pending?: boolean; onClick: () => void; children: React.ReactNode; className?: string }) => (
  <button disabled={pending} onClick={onClick} className={cn("inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-60", className)}>
    {pending && <Loader2 className="size-4 animate-spin" />}{children}
  </button>
);

// ---------------- Updates feed ----------------
export function WorkUpdatesFeed({ taskId, me, canPost, onChanged }: { taskId: string; me: string | null; canPost: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listWorkUpdates);
  const post = useServerFn(postWorkUpdate);
  const edit = useServerFn(editWorkUpdate);
  const q = useQuery({ queryKey: ["task-updates", taskId], queryFn: () => list({ data: { taskId } }), refetchInterval: 30_000 });
  const [body, setBody] = useState("");
  const [items, setItems] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [q.data?.length]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["task-updates", taskId] }); onChanged(); };
  const m = useMutation({
    mutationFn: () => post({ data: { taskId, body: body.trim(), items_done: items === "" ? null : Number(items) } }),
    onSuccess: () => { setBody(""); setItems(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const em = useMutation({
    mutationFn: (v: { id: string; body: string }) => edit({ data: v }),
    onSuccess: () => { setEditing(null); toast.success("Update edited"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = q.data ?? [];
  return (
    <div className="grid gap-3">
      {q.isLoading ? <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /> : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">No updates yet. Share progress like “4 products completed”.</div>
      ) : (
        <ol className="grid gap-2.5">
          {rows.map((u, i) => {
            const showDay = i === 0 || dayKey(rows[i - 1]!.created_at) !== dayKey(u.created_at);
            const mine = u.author_id === me;
            const editable = mine && Date.now() - new Date(u.created_at).getTime() < 10 * 60_000;
            return (
              <li key={u.id} className="animate-[bubble-in_.2s_ease-out]">
                {showDay && <div className="my-2 text-center"><span className="rounded-full bg-muted px-3 py-1 text-[11.5px] font-semibold text-muted-foreground">{dayLabel(u.created_at)}</span></div>}
                <div className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
                  <Avatar name={u.author_name} url={u.author_avatar} />
                  <div className={cn("max-w-[82%] rounded-2xl px-3.5 py-2.5", u.is_manager ? "border border-primary/40 bg-primary/10" : mine ? "bg-foreground/[0.06]" : "border border-border bg-card")}>
                    <div className="flex items-baseline gap-2 text-[12px]">
                      <span className="font-mono font-bold text-foreground">{fmtTime(u.created_at)}</span>
                      <span className="font-semibold text-foreground">— {u.author_name || "Member"}</span>
                      {u.is_manager && <span className="rounded bg-primary px-1.5 text-[10px] font-bold uppercase text-primary-foreground">Manager</span>}
                    </div>
                    {editing?.id === u.id ? (
                      <div className="mt-1.5 grid gap-1.5">
                        <textarea rows={2} className={cn(input, "h-auto py-2")} value={editing.body} onChange={(e) => setEditing({ id: u.id, body: e.target.value })} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditing(null)} className="h-8 rounded-md px-3 text-[12.5px] font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
                          <button onClick={() => editing.body.trim() && em.mutate({ id: u.id, body: editing.body.trim() })} className="h-8 rounded-md bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground">Save</button>
                        </div>
                      </div>
                    ) : <p className="mt-0.5 whitespace-pre-wrap text-[14.5px] font-medium text-foreground">{u.body}</p>}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {u.items_done != null && <span className="rounded-full bg-card px-2 py-0.5 font-mono font-bold text-foreground">+{u.items_done} items</span>}
                      {u.edited_at && <span>edited</span>}
                      {editable && editing?.id !== u.id && <button onClick={() => setEditing({ id: u.id, body: u.body })} className="inline-flex items-center gap-1 font-semibold hover:text-foreground"><Pencil className="size-3" />Edit</button>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={endRef} />
      {canPost && (
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-card px-4 pt-3 pb-1">
          <div className="flex items-end gap-2">
            <textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a progress update…" maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) m.mutate(); }}
              className="min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none" />
            <input type="number" min="0" inputMode="numeric" value={items} onChange={(e) => setItems(e.target.value)} placeholder="Items" aria-label="Items completed"
              className="h-11 w-20 rounded-2xl border border-border bg-background px-2 text-center font-mono text-[13px] focus:border-primary focus:outline-none" />
            <button disabled={!body.trim() || m.isPending} onClick={() => m.mutate()} aria-label="Send update"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-90 disabled:opacity-40">
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Name, date & exact time saved automatically. Updates are never deleted.</div>
        </div>
      )}
    </div>
  );
}

// ---------------- Submissions ----------------
const LINK_KINDS = [
  { key: "drive", label: "Google Drive", icon: HardDrive },
  { key: "folder", label: "Folder", icon: Folder },
  { key: "file", label: "File", icon: FileText },
] as const;
const SUB_STATUS: Record<WorkSubmission["status"], { label: string; cls: string }> = {
  submitted: { label: "Awaiting review", cls: "border-primary/40 bg-primary/10 text-primary" },
  approved: { label: "Approved", cls: "border-[var(--color-status-converted)]/40 text-[var(--color-status-converted)]" },
  revision_requested: { label: "Revision requested", cls: "border-primary/40 text-primary" },
  rejected: { label: "Rejected", cls: "border-destructive/40 text-destructive" },
  completed: { label: "Completed", cls: "border-[var(--color-status-converted)]/40 bg-[var(--color-status-converted)]/10 text-[var(--color-status-converted)]" },
};

export function SubmissionsPanel({ taskId, canSubmit, canReview, onChanged }: { taskId: string; canSubmit: boolean; canReview: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listSubmissions);
  const q = useQuery({ queryKey: ["task-submissions", taskId], queryFn: () => list({ data: { taskId } }) });
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<{ s: WorkSubmission; action: "approved" | "revision_requested" | "rejected" | "completed" } | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["task-submissions", taskId] });
    qc.invalidateQueries({ queryKey: ["task-updates", taskId] });
    onChanged();
  };
  const rows = q.data ?? [];
  return (
    <div className="grid gap-3">
      {canSubmit && (
        <button onClick={() => setOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground active:scale-[0.99]">
          <Send className="size-4" /> Submit Work
        </button>
      )}
      {q.isLoading ? <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /> : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">No submissions yet.</div>
      ) : rows.map((s) => (
        <div key={s.id} className="rounded-md border border-border p-3.5 animate-fade-in">
          <div className="flex items-start gap-2.5">
            <Avatar name={s.submitter_name} url={s.submitter_avatar} size={34} />
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold text-foreground">Submission #{s.no} <span className="font-medium text-muted-foreground">· {s.submitter_name || "Member"}</span></div>
              <div className="text-[12px] text-muted-foreground">{fmtTs(s.created_at)}{s.items_completed != null && <> · <span className="font-mono font-bold text-foreground">{s.items_completed} items</span></>}</div>
            </div>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold", SUB_STATUS[s.status].cls)}>{SUB_STATUS[s.status].label}</span>
          </div>
          {s.links.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {s.links.map((l, i) => {
                const K = LINK_KINDS.find((k) => k.key === l.kind) ?? LINK_KINDS[2];
                return (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[12.5px] font-semibold text-foreground hover:border-primary/50">
                    <K.icon className="size-3.5 shrink-0" /><span className="truncate">{K.label}</span><ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                  </a>
                );
              })}
            </div>
          )}
          {s.notes && <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/60 px-3 py-2 text-[13.5px] text-foreground">{s.notes}</p>}
          {s.reviewed_at && (
            <div className="mt-2 text-[12.5px] text-muted-foreground"><span className="font-semibold text-foreground">{s.reviewer_name || "Manager"}</span> · {fmtTs(s.reviewed_at)}{s.review_note && <> — {s.review_note}</>}</div>
          )}
          {canReview && s.status !== "completed" && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {s.status !== "approved" && <ReviewBtn icon={Check} label="Approve" onClick={() => setReviewing({ s, action: "approved" })} />}
              <ReviewBtn icon={RotateCcw} label="Request Revision" onClick={() => setReviewing({ s, action: "revision_requested" })} />
              {s.status !== "rejected" && <ReviewBtn icon={XCircle} label="Reject" danger onClick={() => setReviewing({ s, action: "rejected" })} />}
              <ReviewBtn icon={BadgeCheck} label="Mark Completed" primary onClick={() => setReviewing({ s, action: "completed" })} />
            </div>
          )}
        </div>
      ))}
      {open && <SubmitSheet taskId={taskId} onClose={() => setOpen(false)} onSaved={refresh} />}
      {reviewing && <ReviewSheet {...reviewing} onClose={() => setReviewing(null)} onSaved={refresh} />}
    </div>
  );
}
function ReviewBtn({ icon: I, label, onClick, danger, primary }: { icon: typeof Check; label: string; onClick: () => void; danger?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-semibold transition active:scale-95",
      primary ? "border-primary bg-primary text-primary-foreground" : danger ? "border-destructive/40 text-destructive hover:bg-destructive/5" : "border-border text-foreground hover:bg-muted")}>
      <I className="size-4" />{label}
    </button>
  );
}

function SubmitSheet({ taskId, onClose, onSaved }: { taskId: string; onClose: () => void; onSaved: () => void }) {
  const submit = useServerFn(submitWork);
  const [links, setLinks] = useState<SubmissionLink[]>([{ kind: "drive", url: "" }]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState("");
  const m = useMutation({
    mutationFn: () => {
      const clean = links.filter((l) => l.url.trim()).map((l) => ({ ...l, url: l.url.trim() }));
      const bad = clean.find((l) => !/^https?:\/\/\S+\.\S+/i.test(l.url));
      if (bad) throw new Error("Please enter valid links starting with https://");
      return submit({ data: { taskId, links: clean, notes: notes.trim() || null, items_completed: items === "" ? null : Number(items) } });
    },
    onSuccess: () => { toast.success("Work submitted for review"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <MiniSheet title="Submit Work" onClose={onClose} footer={<PrimaryBtn pending={m.isPending} onClick={() => m.mutate()}><Send className="size-4" />Submit</PrimaryBtn>}>
      <div className="grid gap-3">
        <div className="text-[12.5px] font-semibold text-muted-foreground">Links</div>
        {links.map((l, i) => (
          <div key={i} className="grid grid-cols-[120px_1fr_auto] gap-2 animate-fade-in">
            <select className={input} value={l.kind} onChange={(e) => setLinks((x) => x.map((y, j) => j === i ? { ...y, kind: e.target.value as SubmissionLink["kind"] } : y))}>
              {LINK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <input className={input} type="url" inputMode="url" placeholder="https://drive.google.com/…" value={l.url} onChange={(e) => setLinks((x) => x.map((y, j) => j === i ? { ...y, url: e.target.value } : y))} />
            <button aria-label="Remove link" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
          </div>
        ))}
        {links.length < 20 && (
          <button onClick={() => setLinks((x) => [...x, { kind: "file", url: "" }])} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-[13px] font-semibold text-muted-foreground hover:bg-muted"><Plus className="size-4" />Add another link</button>
        )}
        <label className="grid gap-1"><span className="text-[12.5px] font-semibold text-muted-foreground">Number of completed items</span>
          <input type="number" min="0" inputMode="numeric" className={cn(input, "font-mono text-[16px] font-bold")} value={items} onChange={(e) => setItems(e.target.value)} placeholder="e.g. 24" /></label>
        <label className="grid gap-1"><span className="text-[12.5px] font-semibold text-muted-foreground">Notes</span>
          <textarea rows={4} maxLength={4000} className={cn(input, "h-auto py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What's included, anything the manager should check…" /></label>
        <div className="text-[12px] text-muted-foreground">Submission time is saved automatically and the task moves to “Submitted for Review”.</div>
      </div>
    </MiniSheet>
  );
}

const ACTION_TITLE = { approved: "Approve submission", revision_requested: "Request revision", rejected: "Reject submission", completed: "Mark completed" } as const;
function ReviewSheet({ s, action, onClose, onSaved }: { s: WorkSubmission; action: keyof typeof ACTION_TITLE; onClose: () => void; onSaved: () => void }) {
  const review = useServerFn(reviewSubmission);
  const needNote = action === "revision_requested" || action === "rejected";
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => {
      if (needNote && note.trim().length < 3) throw new Error("Please write a note (at least 3 characters)");
      return review({ data: { id: s.id, action, note: note.trim() || null } });
    },
    onSuccess: () => { toast.success(ACTION_TITLE[action]); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <MiniSheet title={`${ACTION_TITLE[action]} · #${s.no}`} onClose={onClose} footer={
      <PrimaryBtn pending={m.isPending} onClick={() => m.mutate()} className={action === "rejected" ? "bg-destructive text-destructive-foreground" : undefined}>Confirm</PrimaryBtn>}>
      <label className="grid gap-1"><span className="text-[12.5px] font-semibold text-muted-foreground">{needNote ? "Note (required)" : "Note (optional)"}</span>
        <textarea rows={4} autoFocus className={cn(input, "h-auto py-2")} value={note} onChange={(e) => setNote(e.target.value)} placeholder={needNote ? "e.g. Product 06 side image requires revision" : ""} /></label>
      <div className="mt-2 text-[12px] text-muted-foreground">The task tracking updates automatically and the submitter is notified.</div>
    </MiniSheet>
  );
}

// ---------------- Finance (management/accounts only) ----------------
const money = (n: number, c: string) => `${c === "BDT" ? "৳" : c + " "}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export function FinancePanel({ projectId, taskId, defaultValue }: { projectId?: string; taskId?: string; defaultValue?: number | null }) {
  const qc = useQueryClient();
  const get = useServerFn(getFinance);
  const save = useServerFn(saveFinance);
  const key = ["finance", projectId ?? taskId];
  const q = useQuery({ queryKey: key, queryFn: () => get({ data: projectId ? { projectId } : { taskId } }) });
  const [f, setF] = useState<{ value: string; paid: string; status: PaymentStatus; date: string; currency: string } | null>(null);
  useEffect(() => {
    if (!q.data?.allowed || f) return;
    const r = q.data.row;
    setF({ value: String(r?.project_value ?? defaultValue ?? ""), paid: String(r?.paid_amount ?? "0"), status: r?.payment_status ?? "not_invoiced", date: r?.payment_date ?? "", currency: r?.currency ?? "BDT" });
  }, [q.data, f, defaultValue]);
  const m = useMutation({
    mutationFn: () => save({ data: { projectId, taskId, project_value: Number(f!.value || 0), paid_amount: Number(f!.paid || 0), payment_status: f!.status, payment_date: f!.date || null, currency: f!.currency } }),
    onSuccess: () => { toast.success("Finance saved"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return null;
  if (!q.data?.allowed || !f) return null; // hidden completely for non-finance users
  const value = Number(f.value || 0), paid = Number(f.paid || 0), due = Math.max(value - paid, 0);
  const setNum = (k: "value" | "paid") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...f, [k]: e.target.value };
    next.status = suggestPaymentStatus(Number(next.value || 0), Number(next.paid || 0), f.status);
    setF(next);
  };
  return (
    <div className="rounded-md border border-border bg-card p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-[14.5px] font-bold text-foreground">Payment / Project Value</div>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><Lock className="size-3" />Management & Accounts only</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[["Value", value, "text-foreground"], ["Paid", paid, "text-[var(--color-status-converted)]"], ["Due", due, due > 0 ? "text-destructive" : "text-foreground"]].map(([k, v, c]) => (
          <div key={k as string} className="rounded-md bg-muted/60 px-2.5 py-2">
            <div className="text-[11.5px] font-semibold text-muted-foreground">{k as string}</div>
            <div className={cn("truncate font-mono text-[15px] font-bold", c as string)}>{money(v as number, f.currency)}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="grid gap-1"><span className="text-[12px] font-semibold text-muted-foreground">Project value</span><input type="number" min="0" className={cn(input, "font-mono")} value={f.value} onChange={setNum("value")} /></label>
        <label className="grid gap-1"><span className="text-[12px] font-semibold text-muted-foreground">Paid amount</span><input type="number" min="0" className={cn(input, "font-mono")} value={f.paid} onChange={setNum("paid")} /></label>
        <label className="grid gap-1"><span className="text-[12px] font-semibold text-muted-foreground">Payment status</span>
          <select className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as PaymentStatus })}>{PAYMENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        <label className="grid gap-1"><span className="text-[12px] font-semibold text-muted-foreground">Payment date</span><input type="date" className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="grid gap-1"><span className="text-[12px] font-semibold text-muted-foreground">Currency</span>
          <select className={input} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{["BDT", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <div className="flex items-end"><PrimaryBtn pending={m.isPending} onClick={() => m.mutate()}>Save</PrimaryBtn></div>
      </div>
    </div>
  );
}
