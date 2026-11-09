// Project Details sections: Work Updates (versioned, per-update feedback chat),
// Invoices & Payments, Activity timeline and the company project-roles editor.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, MessageSquare, Plus, Send, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addUpdateComment, addWorkUpdate, getProjectMoney, listCompanyProjectRoles, listWorkUpdates, removeCompanyProjectRole, saveCompanyProjectRole } from "@/lib/project-details.functions";
import { PersonAvatar, SoftPill } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";

export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka" });
const money = (n: number, cur: string) => `${cur === "BDT" ? "৳" : cur === "USD" ? "$" : `${cur} `}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function Card({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function WorkUpdates({ projectId }: { projectId: string }) {
  const list = useServerFn(listWorkUpdates);
  const add = useServerFn(addWorkUpdate);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["work-updates", projectId], queryFn: () => list({ data: { projectId } }) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", link: "", note: "" });
  const m = useMutation({
    mutationFn: () => add({ data: { projectId, title: f.title, link: f.link, note: f.note || null } }),
    onSuccess: (r) => { toast.success(`Update shared · version ${r.version}`); setF({ title: "", link: "", note: "" }); setOpen(false); qc.invalidateQueries({ queryKey: ["work-updates", projectId] }); qc.invalidateQueries({ queryKey: ["hub-project", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const titles = [...new Set((q.data ?? []).map((u) => u.title))];
  return (
    <Card title="Work updates" action={<Button size="sm" variant={open ? "outline" : "dark"} onClick={() => setOpen(!open)} className="gap-1">{open ? <X className="size-3.5" /> : <Plus className="size-3.5" />}{open ? "Close" : "New update"}</Button>}>
      {open && (
        <div className="mb-4 grid gap-2 rounded-xl bg-muted p-3">
          <Input list={`wu-titles-${projectId}`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Video name, e.g. Eid Commercial 30s" maxLength={200} />
          <datalist id={`wu-titles-${projectId}`}>{titles.map((t) => <option key={t} value={t} />)}</datalist>
          <Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="Google Drive link" />
          <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="What changed / notes for the client" rows={3} />
          <p className="text-[11.5px] text-muted-foreground">Using the same video name again saves it as the next version.</p>
          <div className="flex justify-end"><Button size="sm" disabled={m.isPending || f.title.trim().length < 2} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="size-3.5 animate-spin" />}Share update</Button></div>
        </div>
      )}
      {q.isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : !q.data?.length ? <p className="text-[13px] text-muted-foreground">No updates shared yet.</p> : (
        <div className="space-y-3">{q.data.map((u) => <UpdateItem key={u.id} u={u} projectId={projectId} />)}</div>
      )}
    </Card>
  );
}

function UpdateItem({ u, projectId }: { u: Awaited<ReturnType<typeof listWorkUpdates>>[number]; projectId: string }) {
  const send = useServerFn(addUpdateComment);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const m = useMutation({
    mutationFn: () => send({ data: { updateId: u.id, body: msg } }),
    onSuccess: () => { setMsg(""); qc.invalidateQueries({ queryKey: ["work-updates", projectId] }); qc.invalidateQueries({ queryKey: ["hub-project", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-start gap-3 p-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Video className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[13.5px] font-semibold">{u.title}</span><SoftPill tone="blue">v{u.version}</SoftPill></div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground"><PersonAvatar name={u.author.name} src={u.author.avatar} size={16} />{u.author.name} · {when(u.created_at)}</div>
          {u.note && <p className="mt-2 whitespace-pre-wrap text-[13px] text-foreground/80">{u.note}</p>}
        </div>
        {u.link && <a href={u.link} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium hover:bg-muted">Watch<ExternalLink className="size-3" /></a>}
      </div>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 border-t border-border px-3.5 py-2 text-[12.5px] text-muted-foreground hover:text-foreground">
        <MessageSquare className="size-3.5" />Feedback ({u.comments.length})
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border bg-muted/40 p-3.5">
          {u.comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <PersonAvatar name={c.author.name} src={c.author.avatar} size={24} />
              <div className="min-w-0 rounded-xl bg-card px-3 py-2"><div className="text-[12px] font-semibold">{c.author.name} <span className="font-normal text-muted-foreground">· {when(c.created_at)}</span></div><p className="whitespace-pre-wrap text-[13px]">{c.body}</p></div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Reply about version ${u.version}…`} onKeyDown={(e) => { if (e.key === "Enter" && msg.trim() && !m.isPending) m.mutate(); }} />
            <Button size="icon" aria-label="Send" disabled={!msg.trim() || m.isPending} onClick={() => m.mutate()}><Send className="size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

const INV_TONE: Record<string, "green" | "amber" | "red" | "grey" | "blue"> = { paid: "green", partially_paid: "amber", partial: "amber", sent: "blue", overdue: "red", draft: "grey", cancelled: "grey" };

export function MoneySection({ projectId, org }: { projectId: string; org?: string }) {
  const get = useServerFn(getProjectMoney);
  const q = useQuery({ queryKey: ["project-money", projectId], queryFn: () => get({ data: { projectId } }) });
  if (q.isLoading) return <Card title="Invoices & payments"><Loader2 className="size-4 animate-spin text-muted-foreground" /></Card>;
  if (!q.data?.allowed) return <Card title="Invoices & payments"><p className="text-[13px] text-muted-foreground">Only finance admins and this project's Coordinator or Team Lead can see invoices and payments.</p></Card>;
  const d = q.data;
  const invLink = (slug: string) => org
    ? <Link to="/app/org/$org/finance/invoices/$slug" params={{ org, slug }} className="font-mono text-[12.5px] font-medium hover:underline">{slug}</Link>
    : <Link to="/app/finance/invoices/$slug" params={{ slug }} className="font-mono text-[12.5px] font-medium hover:underline">{slug}</Link>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`Invoices (${d.invoices.length})`}>
        {!d.invoices.length ? <p className="text-[13px] text-muted-foreground">No invoices linked to this project.</p> : (
          <div className="divide-y divide-border">{d.invoices.map((i) => (
            <div key={i.slug} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">{invLink(i.slug)}<div className="text-[12px] text-muted-foreground">Paid {money(i.paid, i.currency)} of {money(i.total, i.currency)}</div></div>
              <SoftPill dot tone={INV_TONE[i.status] ?? "grey"}>{i.status.replace(/_/g, " ")}</SoftPill>
              <span className="w-24 text-right font-mono text-[13px]">{money(i.total, i.currency)}</span>
            </div>
          ))}</div>
        )}
      </Card>
      <Card title={`Payments (${d.payments.length})`}>
        {!d.payments.length ? <p className="text-[13px] text-muted-foreground">No payments received yet.</p> : (
          <div className="divide-y divide-border">{d.payments.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1"><div className="text-[13px]">{p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"} · {p.label}</div><div className="text-[12px] text-muted-foreground">Invoice {p.invoice_slug}{p.method ? ` · ${p.method}` : ""}</div></div>
              <span className="font-mono text-[13px] text-[#047857]">+{money(p.amount, p.currency)}</span>
            </div>
          ))}</div>
        )}
      </Card>
    </div>
  );
}

type Act = { id: string; body: string | null; action: string; created_at: string; actor_name: string | null };
/** Project activity plus invoice/payment events (only for people allowed to see money). */
export function ProjectActivity({ projectId, items }: { projectId: string; items: Act[] }) {
  const get = useServerFn(getProjectMoney);
  const q = useQuery({ queryKey: ["project-money", projectId], queryFn: () => get({ data: { projectId } }) });
  const extra: Act[] = q.data?.allowed ? [
    ...q.data.invoices.map((i) => ({ id: `inv-${i.slug}`, body: `Invoice ${i.slug} was added (${money(i.total, i.currency)})`, action: "invoice", created_at: i.created_at, actor_name: "Finance" })),
    ...q.data.payments.filter((p) => p.paid_at).map((p) => ({ id: `pay-${p.id}`, body: `Payment of ${money(p.amount, p.currency)} received for invoice ${p.invoice_slug}`, action: "payment", created_at: p.paid_at!, actor_name: "Finance" })),
  ] : [];
  const all = [...items, ...extra].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return <ActivityFeed items={all} />;
}

export function ActivityFeed({ items }: { items: Act[] }) {
  if (!items.length) return <p className="text-[13px] text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[11px] before:top-1 before:w-px before:bg-border">
      {items.map((a) => (
        <li key={a.id} className="relative flex gap-3">
          <span className="relative z-10"><PersonAvatar name={a.actor_name ?? "System"} size={23} /></span>
          <div className="min-w-0"><div className="text-[13px]"><span className="font-semibold">{a.actor_name ?? "System"}</span> <span className="text-foreground/80">{a.body}</span></div><div className="text-[11.5px] text-muted-foreground">{when(a.created_at)}</div></div>
        </li>
      ))}
    </ol>
  );
}

/** Company settings: project roles. Built-in roles are fixed; group admins add/rename/remove the rest. */
export function ProjectRolesEditor({ companyId }: { companyId: string }) {
  const list = useServerFn(listCompanyProjectRoles), save = useServerFn(saveCompanyProjectRole), rm = useServerFn(removeCompanyProjectRole);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["company-project-roles", companyId], queryFn: () => list({ data: { companyId } }) });
  const [label, setLabel] = useState("");
  const [edit, setEdit] = useState<{ key: string; label: string } | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: ["company-project-roles", companyId] });
  const add = useMutation({ mutationFn: () => save({ data: { companyId, label } }), onSuccess: () => { setLabel(""); done(); toast.success("Role added"); }, onError: (e: Error) => toast.error(e.message) });
  const ren = useMutation({ mutationFn: (v: { key: string; label: string }) => save({ data: { companyId, ...v } }), onSuccess: () => { setEdit(null); done(); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: (key: string) => rm({ data: { companyId, key } }), onSuccess: () => { done(); toast.success("Role removed"); }, onError: (e: Error) => toast.error(e.message) });
  const can = !!q.data?.canEdit;
  return (
    <Card title="Project roles">
      <p className="-mt-1 mb-3 text-[12.5px] text-muted-foreground">Roles shown in Add Member on this company's projects. Built-in roles control who can manage a project and can't be changed.</p>
      {q.isLoading ? <Loader2 className="size-4 animate-spin" /> : (
        <div className="flex flex-wrap gap-2">
          {q.data?.roles.map((r) => edit?.key === r.key ? (
            <span key={r.key} className="inline-flex items-center gap-1"><Input autoFocus value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") ren.mutate(edit); if (e.key === "Escape") setEdit(null); }} className="h-8 w-48" /></span>
          ) : (
            <span key={r.key} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12.5px]", r.system ? "bg-muted" : "bg-card")}>
              <button type="button" disabled={r.system || !can} onClick={() => setEdit({ key: r.key, label: r.label })} className="disabled:cursor-default">{r.label}</button>
              {r.system ? <span className="text-[10.5px] text-muted-foreground">built-in</span> : can && <button type="button" aria-label={`Remove ${r.label}`} onClick={() => del.mutate(r.key)}><Trash2 className="size-3 text-muted-foreground hover:text-destructive" /></button>}
            </span>
          ))}
        </div>
      )}
      {can && (
        <div className="mt-3 flex max-w-sm gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New role, e.g. Colorist" maxLength={60} onKeyDown={(e) => { if (e.key === "Enter" && label.trim().length > 1) add.mutate(); }} />
          <Button variant="outline" disabled={label.trim().length < 2 || add.isPending} onClick={() => add.mutate()}><Plus className="size-4" />Add</Button>
        </div>
      )}
    </Card>
  );
}
