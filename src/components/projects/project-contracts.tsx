// Project → Contracts tab and Company → Contracts settings.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, FilePlus2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SoftPill } from "@/components/tasks/task-ui";
import { Card, when } from "@/components/projects/project-sections";
import { downloadContractPdf, getContractSettings, getContractWorkspace, publishContract, saveContractDraft, saveContractSettings } from "@/lib/contracts.functions";
import { CONTRACT_STATUS_LABEL, EMPTY_FORM, TEMPLATE_FIELDS, fillTemplate, type ContractForm, type ContractStatus, type ContractWorkspace } from "@/lib/contract-template";
import { useConfirm } from "@/components/ui/confirm-dialog";

const TONE: Record<ContractStatus, "grey" | "amber" | "green" | "red"> = { draft: "grey", awaiting_signature: "amber", signed: "green", expired: "red" };

export function ProjectContracts({ projectId }: { projectId: string }) {
  const get = useServerFn(getContractWorkspace);
  const q = useQuery({ queryKey: ["contracts", projectId], queryFn: () => get({ data: { projectId } }) });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const pdf = useServerFn(downloadContractPdf);
  const dl = async (versionId: string) => {
    try {
      const r = await pdf({ data: { versionId } });
      const a = document.createElement("a"); a.href = `data:application/pdf;base64,${r.base64}`; a.download = r.filename; a.click();
    } catch (e) { toast.error((e as Error).message); }
  };
  if (q.isLoading) return <Card title="Contracts"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></Card>;
  if (q.error || !q.data) return <Card title="Contracts"><p className="text-[13px] text-destructive">{(q.error as Error)?.message ?? "Could not load contracts"}</p></Card>;
  const w = q.data as ContractWorkspace;
  if (!w.settings?.enabled) return <Card title="Contracts"><p className="text-[13px] text-muted-foreground">Contracts are not set up for this company yet. A Group Admin can turn them on in the company's Settings.</p></Card>;
  if (editing) return <ContractEditor w={w} projectId={projectId} contract={editing === "new" ? null : w.contracts.find((c) => c.id === editing) ?? null} onClose={() => setEditing(null)} />;

  return (
    <Card title="Contracts" action={w.canPublish && <Button size="sm" onClick={() => setEditing("new")}><FilePlus2 className="h-3.5 w-3.5" />Create contract</Button>}>
      {w.contracts.length === 0 ? <p className="text-[13px] text-muted-foreground">No contracts yet.</p> : (
        <ul className="divide-y divide-border">
          {w.contracts.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="truncate text-[14px] font-medium">{c.title}</div><div className="text-[12px] text-muted-foreground">{c.currentVersion ? `Version ${c.currentVersion}` : "Not published"} · updated {when(c.updatedAt)}</div></div>
                <div className="flex items-center gap-2">
                  <SoftPill dot tone={TONE[c.status]}>{CONTRACT_STATUS_LABEL[c.status]}</SoftPill>
                  {w.canPublish && c.status !== "signed" && <Button size="sm" variant="outline" onClick={() => setEditing(c.id)}>{c.status === "draft" ? "Edit" : "New version"}</Button>}
                </div>
              </div>
              {c.versions.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-xl bg-muted/50 p-2.5 text-[12.5px]">
                  {c.versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>v{v.version} · published by {v.published_by_name} {when(v.published_at)}
                        {v.signed_at ? <> · <b>signed by {v.signer_name}</b>{v.signer_title ? ` (${v.signer_title})` : ""} {when(v.signed_at)}</> : v.revoked_at ? " · replaced" : ` · link valid until ${when(v.expires_at)}`}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => dl(v.id)}><Download className="h-3.5 w-3.5" />{v.signed_at ? "Signed PDF" : "PDF"}</Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Workspace = ContractWorkspace;
function ContractEditor({ w, projectId, contract, onClose }: { w: Workspace; projectId: string; contract: Workspace["contracts"][number] | null; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveContractDraft);
  const pub = useServerFn(publishContract);
  const confirm = useConfirm();
  const [id, setId] = useState<string | null>(contract?.id ?? null);
  const [title, setTitle] = useState(contract?.title ?? `Service Agreement — ${w.ctx.project_name}`);
  const [invoiceId, setInvoiceId] = useState<string | null>(contract?.invoiceId ?? w.autoInvoiceId);
  const [form, setForm] = useState<ContractForm>({ ...EMPTY_FORM, delivery_date: w.dueOn ?? "", ...(contract?.form ?? {}) });
  const [link, setLink] = useState<string | null>(null);
  const inv = w.invoices.find((i) => i.id === invoiceId) ?? null;
  const body = useMemo(() => fillTemplate(w.settings!.template, { ...w.ctx, invoice_no: inv?.slug ?? "To be issued" }, form), [w, inv, form]);
  const set = (k: keyof ContractForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const doSave = async () => { const r = await save({ data: { projectId, id, title, invoiceId, form } }); setId(r.id); qc.invalidateQueries({ queryKey: ["contracts", projectId] }); return r.id; };
  const saveM = useMutation({ mutationFn: doSave, onSuccess: () => toast.success("Draft saved"), onError: (e: Error) => toast.error(e.message) });
  const pubM = useMutation({
    mutationFn: async () => {
      if (!(await confirm({ title: "Publish contract?", description: `The CEO's signature will be added and a signing link sent to ${w.ctx.client_email || "the client"}. Earlier open links stop working.`, confirmLabel: "Publish" }))) return null;
      const cid = await doSave(); return pub({ data: { id: cid } });
    },
    onSuccess: (r) => { if (!r) return; setLink(r.link); qc.invalidateQueries({ queryKey: ["contracts", projectId] }); qc.invalidateQueries({ queryKey: ["hub-project", projectId] }); r.emailed ? toast.success(`Published v${r.version} · link emailed to ${r.email}`) : toast.warning("Published, but the email could not be sent. Copy the link below."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Card title={contract ? (contract.status === "draft" ? "Edit contract" : "New version") : "Create contract"} action={<Button size="sm" variant="ghost" onClick={onClose}>Back</Button>}>
        <div className="space-y-3 text-[13px]">
          <F label="Contract title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></F>
          <div className="rounded-xl bg-muted/50 p-3 text-[12.5px] text-muted-foreground"><b className="text-foreground">{w.ctx.client_name || "No client name"}</b>{w.ctx.client_company && ` · ${w.ctx.client_company}`}<br />{w.ctx.client_email || "No email on client profile"} {w.ctx.client_phone}<br />{w.ctx.project_name} · {w.ctx.service || "—"}</div>
          <F label="Linked invoice">
            {w.invoices.length === 0 ? <p className="text-muted-foreground">No invoice yet — you can save a draft now.</p> : (
              <select className="h-9 w-full rounded-lg border border-border bg-background px-2" value={invoiceId ?? ""} onChange={(e) => setInvoiceId(e.target.value || null)}>
                <option value="">Choose an invoice</option>
                {w.invoices.map((i) => <option key={i.id} value={i.id}>{i.slug} · {i.currency} {i.total.toLocaleString()} · {i.status}</option>)}
              </select>
            )}
          </F>
          <F label="Scope of work"><Textarea rows={4} value={form.scope} onChange={set("scope")} /></F>
          <div className="grid grid-cols-2 gap-2"><F label="Video length"><Input value={form.video_length} onChange={set("video_length")} placeholder="e.g. 30 seconds" /></F><F label="Revisions"><Input value={form.revisions} onChange={set("revisions")} placeholder="e.g. 2 rounds" /></F></div>
          <div className="grid grid-cols-2 gap-2"><F label="Agreed fee"><Input value={form.fee} onChange={set("fee")} placeholder="e.g. ৳25,000" /></F><F label="Delivery date"><Input value={form.delivery_date} onChange={set("delivery_date")} /></F></div>
          <F label="Special terms"><Textarea rows={3} value={form.special_terms} onChange={set("special_terms")} /></F>
          {!w.settings!.hasSignature && <p className="text-[12px] text-destructive">The CEO signature is not set yet — publishing is blocked until it is added in Company settings.</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" disabled={saveM.isPending} onClick={() => saveM.mutate()}>{saveM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save draft</Button>
            <Button disabled={pubM.isPending || !w.settings!.hasSignature} onClick={() => pubM.mutate()}>{pubM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Publish contract</Button>
          </div>
          {link && <div className="flex items-center gap-2 rounded-xl border border-border p-2"><Input readOnly value={link} className="h-8 text-[12px]" /><Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}><Copy className="h-3.5 w-3.5" /></Button></div>}
        </div>
      </Card>
      <div className="overflow-x-auto rounded-2xl bg-muted/60 p-4">
        <div className="mx-auto aspect-[1/1.414] w-[595px] max-w-none overflow-hidden bg-card p-12 text-[11.5px] leading-6 shadow-sm">
          <div className="border-b border-border pb-2 text-[15px] font-bold">{w.ctx.company_name}</div>
          <div className="mt-4 text-[16px] font-bold">{title.toUpperCase()}</div>
          <div className="mt-3 whitespace-pre-wrap">{body}</div>
          <div className="mt-5 rounded-lg border border-border p-3"><div className="font-bold">PAYMENT DETAILS</div><div className="text-muted-foreground">{inv ? `Invoice ${inv.slug} · ${inv.currency} ${inv.total.toLocaleString()}` : "Invoice to be issued"} · Standard Islami Bank PLC · Branta Tech · 03433001126</div></div>
          <div className="mt-6 grid grid-cols-2 gap-6"><div className="border-t border-foreground pt-1 font-semibold">{w.settings!.ceoName || "CEO"}<div className="font-normal text-muted-foreground">{w.settings!.ceoTitle}</div></div><div className="border-t border-foreground pt-1 font-semibold">{w.ctx.client_name || "Client"}</div></div>
        </div>
      </div>
    </div>
  );
}
const F = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block space-y-1"><span className="text-[12px] font-medium text-muted-foreground">{label}</span>{children}</label>;

export function ContractSettingsEditor({ companyId }: { companyId: string }) {
  const get = useServerFn(getContractSettings);
  const save = useServerFn(saveContractSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["contract-settings", companyId], queryFn: () => get({ data: { companyId } }) });
  const [s, setS] = useState<NonNullable<typeof q.data> | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  const m = useMutation({
    mutationFn: () => save({ data: { companyId, enabled: s!.enabled, template: s!.template, ceoName: s!.ceoName, ceoTitle: s!.ceoTitle, signature: s!.signature, expiryDays: s!.expiryDays } }),
    onSuccess: () => { toast.success("Contract settings saved"); qc.invalidateQueries({ queryKey: ["contract-settings", companyId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!s) return null;
  const ro = !s.canEdit;
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "image/png") return toast.error("Please upload a PNG signature (transparent background works best).");
    if (f.size > 280_000) return toast.error("Signature image must be under 280 KB.");
    const r = new FileReader(); r.onload = () => setS({ ...s, signature: String(r.result) }); r.readAsDataURL(f);
  };
  return (
    <Card title="Contracts" action={<label className="flex items-center gap-2 text-[13px]">Enabled<Switch disabled={ro} checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} /></label>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-1">
          <Textarea disabled={ro} rows={14} value={s.template} onChange={(e) => setS({ ...s, template: e.target.value })} className="font-mono text-[12px]" />
          <p className="text-[11.5px] text-muted-foreground">Fill-in fields: {TEMPLATE_FIELDS.map((f) => `{{${f}}}`).join(" ")}</p>
        </div>
        <div className="space-y-3 text-[13px]">
          <F label="CEO name"><Input disabled={ro} value={s.ceoName} onChange={(e) => setS({ ...s, ceoName: e.target.value })} /></F>
          <F label="CEO title"><Input disabled={ro} value={s.ceoTitle} onChange={(e) => setS({ ...s, ceoTitle: e.target.value })} /></F>
          <F label="CEO signature (PNG)">
            <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border bg-background">{s.signature ? <img src={s.signature} alt="CEO signature" className="max-h-16" /> : <span className="text-muted-foreground">None</span>}</div>
            {!ro && <Input type="file" accept="image/png" onChange={(e) => onFile(e.target.files?.[0])} className="mt-1" />}
          </F>
          <F label="Signing link valid (days)"><Input disabled={ro} type="number" min={1} max={90} value={s.expiryDays} onChange={(e) => setS({ ...s, expiryDays: Math.max(1, Math.min(90, Number(e.target.value) || 14)) })} /></F>
          {!ro && <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>}
        </div>
      </div>
    </Card>
  );
}
