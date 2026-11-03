import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileText, ImageUp, Loader2, Minus, Plus, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CompanyInvoiceTemplateSchema, completeInvoiceTemplate, INVOICE_LABELS, type CompanyInvoiceTemplate, type InvoiceLabel } from "@/lib/company-invoice-template";
import { getCompanyInvoiceStudio, previewCompanyInvoice, saveCompanyInvoiceTemplate } from "@/lib/company-invoice-template.functions";
import { InvoicePdfPreview } from "./invoice-pdf-preview";

export function InvoiceStudio({ companyId }: { companyId: string }) {
  const get = useServerFn(getCompanyInvoiceStudio);
  const q = useQuery({ queryKey: ["company-invoice-studio", companyId], queryFn: () => get({ data: { companyId } }) });
  if (q.isPending) return <div className="grid min-h-96 place-items-center"><Loader2 className="size-5 animate-spin text-brand" /></div>;
  if (q.isError) return <div className="space-y-3 border-l-2 border-destructive p-4"><p role="alert">{q.error.message}</p><Button variant="outline" onClick={() => q.refetch()}>Retry</Button></div>;
  return <StudioEditor key={companyId} companyId={companyId} initial={q.data} />;
}

const TABS = ["Identity", "Layout", "Colours", "Payment", "Signature", "Sections", "Labels", "History"] as const;
type StudioData = Awaited<ReturnType<typeof getCompanyInvoiceStudio>>;
function StudioEditor({ companyId, initial }: { companyId: string; initial: StudioData }) {
  const [saved, setSaved] = useState(initial.settings);
  const [form, setForm] = useState(initial.settings);
  const [revision, setRevision] = useState(initial.revision);
  const [tab, setTab] = useState<typeof TABS[number]>("Identity");
  const [mode, setMode] = useState<"digital" | "print">("digital");
  const [zoom, setZoom] = useState(90);
  const [invoiceId, setInvoiceId] = useState(initial.invoices[0]?.id ?? initial.reference?.id ?? "");
  const [pdf, setPdf] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const preview = useServerFn(previewCompanyInvoice);
  const saveFn = useServerFn(saveCompanyInvoiceTemplate);
  const qc = useQueryClient();
  const request = useRef(0);
  const validation = CompanyInvoiceTemplateSchema.safeParse(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof CompanyInvoiceTemplate>(k: K, value: CompanyInvoiceTemplate[K]) => setForm(f => ({ ...f, [k]: value }));
  useEffect(() => {
    const id = ++request.current;
    setPdfError("");
    if (!invoiceId || !CompanyInvoiceTemplateSchema.safeParse(form).success) { setGenerating(false); return; }
    setGenerating(true);
    const timer = setTimeout(() => {
      preview({ data: { companyId, settings: form, invoiceId, mode } }).then(result => {
        if (request.current === id) setPdf(result.pdf);
      }).catch(e => { if (request.current === id) setPdfError(e instanceof Error ? e.message : "Preview failed"); })
        .finally(() => { if (request.current === id) setGenerating(false); });
    }, 450);
    return () => { clearTimeout(timer); request.current++; };
  }, [form, invoiceId, mode, companyId, preview]);
  const save = async () => {
    if (!validation.success) return;
    setSaving(true);
    try {
      const result = await saveFn({ data: { companyId, settings: form, expectedRevision: revision } });
      setRevision(result.revision); setSaved(result.settings); setForm(result.settings);
      await qc.invalidateQueries({ queryKey: ["company-invoice-studio", companyId] });
      toast.success("Invoice template saved.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };
  const download = () => {
    const blob = new Blob([Uint8Array.from(atob(pdf), c => c.charCodeAt(0))], { type: "application/pdf" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `Invoice-template-${mode}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const invoices = [...initial.invoices];
  if (initial.reference && !invoices.some(i => i.id === initial.reference?.id)) invoices.push(initial.reference);
  const field = (label: string, key: keyof CompanyInvoiceTemplate, multiline = false) => <label key={key} className="block space-y-1.5">
    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    {multiline ? <Textarea rows={4} value={String(form[key] ?? "")} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /> :
      <Input value={String(form[key] ?? "")} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />}
  </label>;
  return <section className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div className="flex items-center gap-3"><FileText className="size-5 text-brand" /><div><h2 className="text-base font-semibold">Invoice Studio</h2><span className="text-xs text-muted-foreground">{revision ? `Version ${revision}` : "Current invoice layout"} · {dirty ? "Unsaved changes" : "Saved"}</span></div></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setForm(saved)}><RotateCcw className="size-3.5" />Cancel</Button>
        <Button size="sm" disabled={!dirty || !validation.success || saving} onClick={save}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}Save template</Button></div>
    </header>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <nav className="flex flex-wrap gap-1 border-b border-border pb-3">{TABS.map(t => <Button key={t} size="sm" variant={tab === t ? "secondary" : "ghost"} className={cn("h-7 text-xs", tab === t && "text-brand")} onClick={() => setTab(t)}>{t}</Button>)}</nav>
        <div className="max-h-[760px] space-y-4 overflow-y-auto pr-1">
          {tab === "Identity" && <>{field("Company name", "company_name")}{field("Tagline", "company_tagline")}{field("Address", "company_address", true)}{field("Email", "company_email")}{field("Phone", "company_phone")}{field("Website", "company_website")}
            <StudioLogo label="Header logo" value={form.logo_url} onChange={v => set("logo_url", v)} /><StudioLogo label="Footer logo" value={form.logo_inverse_url} onChange={v => set("logo_inverse_url", v)} />
          </>}
          {tab === "Layout" && <>{field("Document title", "header_text")}{field("Footer text", "footer_text")}
            <StudioSelect label="Typeface" value={form.font_family} values={["Helvetica", "TimesRoman", "Courier"]} onChange={v => set("font_family", v as CompanyInvoiceTemplate["font_family"])} />
            <StudioSelect label="Logo alignment" value={form.logo_align} values={["left", "center", "right"]} onChange={v => set("logo_align", v as CompanyInvoiceTemplate["logo_align"])} />
            <label className="block space-y-2 text-xs font-semibold">Logo height · {form.logo_height} pt<input className="w-full accent-primary" type="range" min={16} max={60} value={form.logo_height} onChange={e => set("logo_height", Number(e.target.value))} /></label>
          </>}
          {tab === "Colours" && ([ ["Brand accent", "brand_color"], ["Header", "header_bg_color"], ["Paper", "page_bg_color"], ["Panels", "panel_bg_color"], ["Text", "text_color"], ["Muted text", "muted_color"], ["Borders", "hairline_color"] ] as const).map(([label, k]) => <label key={k} className="flex items-center justify-between gap-3 text-xs font-semibold">{label}<input aria-label={label} type="color" value={form[k]} onChange={e => set(k, e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded border border-border" /></label>)}
          {tab === "Payment" && <>{field("Payment introduction", "payment_intro", true)}{field("Bank / payment details", "payment_info", true)}{field("Payment note", "payment_note", true)}{field("Default terms", "default_terms", true)}{field("Default notes", "default_notes", true)}</>}
          {tab === "Signature" && <>{field("Signatory name", "signature_name")}{field("Signatory title", "signature_title")}<StudioSelect label="Signature alignment" value={form.signature_align} values={["left", "right"]} onChange={v => set("signature_align", v as "left" | "right")} /></>}
          {tab === "Sections" && (Object.keys(form.sections) as (keyof typeof form.sections)[]).map(k => <label key={k} className="flex items-center justify-between border-b border-border py-2 text-xs font-semibold"><span className="capitalize">{k.replace(/_/g, " ")}</span><Switch checked={form.sections[k]} onCheckedChange={v => set("sections", { ...form.sections, [k]: v })} /></label>)}
          {tab === "Labels" && (Object.keys(INVOICE_LABELS) as InvoiceLabel[]).map(k => <label key={k} className="block space-y-1.5 text-xs font-semibold"><span>{INVOICE_LABELS[k]}</span><Input maxLength={40} value={form.labels[k]} onChange={e => set("labels", { ...form.labels, [k]: e.target.value })} /></label>)}
          {tab === "History" && <>{initial.versions.length === 0 ? <p className="text-xs text-muted-foreground">No saved versions.</p> : initial.versions.map(v => <div key={v.revision} className="flex items-center justify-between gap-2 border-b border-border py-3"><div className="text-xs"><strong>Version {v.revision}</strong><p className="mt-1 text-muted-foreground">{new Date(v.created_at).toLocaleString()}</p></div><Button variant="outline" size="sm" onClick={() => setForm(completeInvoiceTemplate(v.settings as Record<string, unknown>))}>Load</Button></div>)}</>}
          {!validation.success && <p role="alert" className="text-xs text-destructive">{validation.error.issues[0]?.path.join(".")}: {validation.error.issues[0]?.message}</p>}
        </div>
      </div>
      <div className="min-w-0 overflow-hidden rounded border border-border">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card p-3">
          <Select value={invoiceId} onValueChange={setInvoiceId}><SelectTrigger className="min-w-0 flex-1 text-xs"><SelectValue placeholder="No invoice available" /></SelectTrigger><SelectContent>{invoices.map(i => <SelectItem key={i.id} value={i.id}>{i.slug} · {i.title}{i.id === initial.reference?.id && !initial.invoices.some(x => x.id === i.id) ? " · Branta reference" : ""}</SelectItem>)}</SelectContent></Select>
          <div className="flex">{(["digital", "print"] as const).map(m => <Button key={m} size="sm" variant={mode === m ? "secondary" : "ghost"} onClick={() => setMode(m)} className="capitalize">{m}</Button>)}</div>
          <Button size="icon" variant="ghost" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom(z => z - 10)}><Minus className="size-4" /></Button><span className="w-10 text-center font-mono text-xs">{zoom}%</span><Button size="icon" variant="ghost" aria-label="Zoom in" disabled={zoom >= 150} onClick={() => setZoom(z => z + 10)}><Plus className="size-4" /></Button>
          <Button size="icon" variant="outline" aria-label="Download preview PDF" disabled={!pdf || generating || Boolean(pdfError) || !validation.success} onClick={download}><Download className="size-4" /></Button>
        </div>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">{generating ? <Loader2 className="size-3 animate-spin text-brand" /> : <Check className="size-3 text-status-converted" />}{generating ? "Updating PDF…" : pdfError ? "Preview unavailable" : "A4 · PDF"}</div>
        {pdfError && <p role="alert" className="p-3 text-xs text-destructive">{pdfError}</p>}
        {!invoiceId ? <div className="grid min-h-96 place-items-center p-6 text-sm text-muted-foreground">No existing invoice is available for preview.</div> : pdf ? <InvoicePdfPreview pdf={pdf} zoom={zoom} /> : <div className="grid min-h-96 place-items-center"><Loader2 className="size-5 animate-spin text-brand" /></div>}
      </div>
    </div>
  </section>;
}

function StudioSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (v: string) => void }) {
  return <label className="block space-y-1.5 text-xs font-semibold"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{values.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></label>;
}
function StudioLogo({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) || file.size > 5_000_000) throw new Error("Use an image under 5 MB.");
      const url = URL.createObjectURL(file);
      try {
        const img = new Image(); img.src = url; await img.decode();
        const scale = Math.min(1, 1200 / img.width, 600 / img.height);
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image conversion unavailable.");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/png"); if (data.length > 600_000) throw new Error("Logo is too large; use a simpler image.");
        onChange(data);
      } finally { URL.revokeObjectURL(url); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
  };
  return <div className="space-y-2"><span className="text-xs font-semibold">{label}</span>{value && <div className="grid h-16 place-items-center rounded border border-border bg-muted p-2"><img src={value} alt={label} className="max-h-12 max-w-full object-contain" /></div>}<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => ref.current?.click()}><ImageUp className="size-3.5" />Upload</Button>{value && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Remove</Button>}</div><input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></div>;
}