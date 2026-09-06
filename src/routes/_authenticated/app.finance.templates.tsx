import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, FileText, Mail, Palette, Eye, RefreshCw, Upload } from "lucide-react";
import { requestR2Upload } from "@/lib/r2.functions";
import {
  getInvoiceTemplates,
  updateInvoicePdfSettings,
  updateInvoiceEmailSettings,
} from "@/lib/invoice-email.functions";
import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/finance/templates")({
  head: () => ({ meta: [{ title: "Invoice Templates · Finance · Branta" }] }),
  component: () => (
    <RequireSuperAdmin>
      <TemplatesPage />
    </RequireSuperAdmin>
  ),
});

// ---------- Types ----------
type PdfSettings = {
  company_name: string;
  company_tagline: string | null;
  company_address: string | null;
  company_email: string | null;
  company_website: string | null;
  logo_url: string | null;
  brand_color: string;
  header_bg_color: string;
  page_bg_color: string;
  panel_bg_color: string;
  text_color: string;
  muted_color: string;
  hairline_color: string;
  header_text: string;
  footer_text: string;
  signature_name: string | null;
  signature_title: string | null;
  sections: {
    description?: boolean;
    installments?: boolean;
    stakeholders?: boolean;
    notes?: boolean;
    footer?: boolean;
  };
};

type EmailSettings = {
  from_name: string;
  from_email: string;
  reply_to: string | null;
  subject_template: string;
  brand_color: string;
  background_color: string;
  card_background: string;
  header_html: string;
  body_html: string;
  cta_label: string;
  footer_html: string;
  auto_send_on_create: boolean;
  auto_send_on_installment_paid: boolean;
  auto_send_on_fully_paid: boolean;
  reminders_enabled: boolean;
  reminder_days_upcoming: string;
  reminder_days_overdue: string;
  reminder_subject_template: string;
  reminder_body_html: string;
};

const SAMPLE_VARS: Record<string, string> = {
  recipient_name: "Rahim Uddin",
  invoice_slug: "BT-01",
  invoice_title: "Website Redesign — Phase 1",
  currency: "BDT",
  total_amount: "45,000.00",
  paid_amount: "15,000.00",
  outstanding_amount: "30,000.00",
  customer_name: "Rahim Uddin",
  status: "partially_paid",
  view_url: "https://console.brantatech.com/…/BT-01.pdf",
};

function renderVars(tpl: string): string {
  return (tpl ?? "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k: string) =>
    SAMPLE_VARS[k] ?? `{{${k}}}`,
  );
}

// ---------- Page ----------
function TemplatesPage() {
  const [tab, setTab] = useState<"pdf" | "email">("pdf");
  const getFn = useServerFn(getInvoiceTemplates);
  const q = useQuery({
    queryKey: ["finance", "invoice-templates"],
    queryFn: () => getFn(),
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">Invoice Templates</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Brand, sender, and dynamic content for every invoice PDF and outgoing email.
          </p>
        </div>
        <div className="inline-flex items-center rounded-sm border border-border bg-card p-0.5">
          {(
            [
              { id: "pdf", label: "PDF template", icon: FileText },
              { id: "email", label: "Email template", icon: Mail },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1 text-[11.5px] font-semibold",
                tab === t.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </header>

      {q.isLoading ? (
        <div className="grid place-items-center rounded-md border border-border bg-card p-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : q.data == null ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-[13px] text-muted-foreground">
          Failed to load templates.
        </div>
      ) : tab === "pdf" ? (
        <PdfEditor initial={q.data.pdf as PdfSettings | null} />
      ) : (
        <EmailEditor initial={q.data.email as EmailSettings | null} />
      )}
    </div>
  );
}

// ---------- PDF Editor ----------
const PDF_DEFAULTS: PdfSettings = {
  company_name: "Branta Tech",
  company_tagline: null,
  company_address: null,
  company_email: "finance@brantatech.com",
  company_website: "brantatech.com",
  logo_url: null,
  brand_color: "#E56A17",
  header_bg_color: "#FFFFFF",
  page_bg_color: "#FFFFFF",
  panel_bg_color: "#F9FAFB",
  text_color: "#111827",
  muted_color: "#6B7280",
  hairline_color: "#E5E7EB",
  header_text: "INVOICE",
  footer_text: "Thank you for your business.",
  signature_name: null,
  signature_title: null,
  sections: { description: true, installments: true, stakeholders: false, notes: true, footer: true },
};

function PdfEditor({ initial }: { initial: PdfSettings | null }) {
  const [form, setForm] = useState<PdfSettings>(() => ({
    ...PDF_DEFAULTS,
    ...(initial ?? {}),
    sections: { ...PDF_DEFAULTS.sections, ...(initial?.sections ?? {}) },
  }));
  const qc = useQueryClient();
  const updateFn = useServerFn(updateInvoicePdfSettings);
  const mut = useMutation({
    mutationFn: () => updateFn({ data: form as unknown as Record<string, unknown> }),
    onSuccess: () => {
      toast.success("PDF template saved");
      qc.invalidateQueries({ queryKey: ["finance", "invoice-templates"] });
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  const set = <K extends keyof PdfSettings>(k: K, v: PdfSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4 rounded-md border border-border bg-card p-5">
        <Section title="Company">
          <Field label="Company name">
            <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
          </Field>
          <Field label="Tagline">
            <Input value={form.company_tagline ?? ""} onChange={(e) => set("company_tagline", e.target.value || null)} />
          </Field>
          <Field label="Address">
            <Textarea rows={2} value={form.company_address ?? ""} onChange={(e) => set("company_address", e.target.value || null)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input value={form.company_email ?? ""} onChange={(e) => set("company_email", e.target.value || null)} />
            </Field>
            <Field label="Website">
              <Input value={form.company_website ?? ""} onChange={(e) => set("company_website", e.target.value || null)} />
            </Field>
          </div>
          <Field label="Logo URL (PNG/JPG, transparent recommended)">
            <div className="flex items-center gap-2">
              <Input value={form.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value || null)} placeholder="https://…" className="flex-1" />
              <LogoUploader onUploaded={(url) => set("logo_url", url)} />
            </div>
            {form.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logo_url} alt="Logo preview" className="mt-2 h-10 w-auto rounded-sm border border-border bg-white p-1" />
            ) : null}
          </Field>

        </Section>

        <Section title="Header & Footer">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Header title">
              <Input value={form.header_text} onChange={(e) => set("header_text", e.target.value)} />
            </Field>
            <Field label="Footer text">
              <Input value={form.footer_text} onChange={(e) => set("footer_text", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signature name">
              <Input value={form.signature_name ?? ""} onChange={(e) => set("signature_name", e.target.value || null)} />
            </Field>
            <Field label="Signature title">
              <Input value={form.signature_title ?? ""} onChange={(e) => set("signature_title", e.target.value || null)} />
            </Field>
          </div>
        </Section>

        <Section title="Colors">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ColorField label="Brand" value={form.brand_color} onChange={(v) => set("brand_color", v)} />
            <ColorField label="Header BG" value={form.header_bg_color} onChange={(v) => set("header_bg_color", v)} />
            <ColorField label="Page BG" value={form.page_bg_color} onChange={(v) => set("page_bg_color", v)} />
            <ColorField label="Panel BG" value={form.panel_bg_color} onChange={(v) => set("panel_bg_color", v)} />
            <ColorField label="Text" value={form.text_color} onChange={(v) => set("text_color", v)} />
            <ColorField label="Muted" value={form.muted_color} onChange={(v) => set("muted_color", v)} />
            <ColorField label="Hairline" value={form.hairline_color} onChange={(v) => set("hairline_color", v)} />
          </div>
        </Section>

        <Section title="Sections">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {(["description", "installments", "stakeholders", "notes", "footer"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 text-[12.5px]">
                <Switch
                  checked={form.sections?.[k] !== false}
                  onCheckedChange={(v) => set("sections", { ...form.sections, [k]: v })}
                />
                <span className="capitalize">{k}</span>
              </label>
            ))}
          </div>
        </Section>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-brand-700"
          >
            {mut.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Save className="mr-1.5 size-3.5" />}
            Save PDF template
          </Button>
        </div>
      </div>

      <PdfPreview settings={form} />
    </div>
  );
}

function PdfPreview({ settings }: { settings: PdfSettings }) {
  return (
    <div className="sticky top-4 h-fit rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Eye className="size-3.5" /> Live preview
      </div>
      <div
        className="overflow-hidden rounded-sm border text-[10.5px]"
        style={{
          background: settings.page_bg_color,
          color: settings.text_color,
          borderColor: settings.hairline_color,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: settings.header_bg_color, borderBottom: `2px solid ${settings.brand_color}` }}
        >
          <div className="flex items-center gap-2">
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="" className="h-6 w-auto" />
            ) : (
              <div className="grid size-6 place-items-center rounded-sm text-[9px] font-bold text-white" style={{ background: settings.brand_color }}>
                B
              </div>
            )}
            <div>
              <div className="font-semibold">{settings.company_name}</div>
              {settings.company_tagline && (
                <div style={{ color: settings.muted_color }}>{settings.company_tagline}</div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold" style={{ color: settings.brand_color }}>{settings.header_text}</div>
            <div style={{ color: settings.muted_color }} className="font-mono">BT-01</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4">
          <div>
            <div style={{ color: settings.muted_color }} className="mb-0.5">Billed to</div>
            <div className="font-semibold">Rahim Uddin</div>
            <div style={{ color: settings.muted_color }}>Acme Corporation</div>
          </div>
          <div className="text-right">
            <div style={{ color: settings.muted_color }} className="mb-0.5">From</div>
            <div className="font-semibold">{settings.company_name}</div>
            <div style={{ color: settings.muted_color }}>{settings.company_email}</div>
          </div>
        </div>

        {settings.sections?.description !== false && (
          <div className="px-4 pb-2">
            <div className="font-semibold">Website Redesign — Phase 1</div>
            <div style={{ color: settings.muted_color }} className="mt-0.5">
              Discovery, wireframes, and homepage design.
            </div>
          </div>
        )}

        {settings.sections?.installments !== false && (
          <div className="px-4 pb-3">
            <div className="rounded-sm" style={{ background: settings.panel_bg_color, border: `1px solid ${settings.hairline_color}` }}>
              <div className="grid grid-cols-4 gap-2 px-2.5 py-1.5 font-semibold" style={{ borderBottom: `1px solid ${settings.hairline_color}`, color: settings.muted_color }}>
                <div>#</div><div>Due</div><div>Status</div><div className="text-right">Amount</div>
              </div>
              {[
                { n: 1, due: "Aug 01", st: "Paid", amt: "15,000.00" },
                { n: 2, due: "Sep 01", st: "Due", amt: "15,000.00" },
                { n: 3, due: "Oct 01", st: "Due", amt: "15,000.00" },
              ].map((r) => (
                <div key={r.n} className="grid grid-cols-4 gap-2 px-2.5 py-1.5" style={{ borderTop: `1px solid ${settings.hairline_color}` }}>
                  <div className="font-mono">{r.n}</div>
                  <div className="font-mono">{r.due}</div>
                  <div>{r.st}</div>
                  <div className="text-right font-mono">৳ {r.amt}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 pb-3 text-right">
          <div style={{ color: settings.muted_color }}>Total</div>
          <div className="font-mono text-[13px] font-bold" style={{ color: settings.brand_color }}>৳ 45,000.00</div>
        </div>

        {(settings.signature_name || settings.signature_title) && (
          <div className="px-4 pb-3">
            <div className="h-px" style={{ background: settings.hairline_color }} />
            <div className="mt-1.5 font-semibold">{settings.signature_name}</div>
            <div style={{ color: settings.muted_color }}>{settings.signature_title}</div>
          </div>
        )}

        {settings.sections?.footer !== false && (
          <div className="px-4 py-2 text-center" style={{ background: settings.panel_bg_color, color: settings.muted_color, borderTop: `1px solid ${settings.hairline_color}` }}>
            {settings.footer_text}
          </div>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-muted-foreground">
        Preview approximates the generated PDF. Save then open any invoice's Download PDF for the real render.
      </p>
    </div>
  );
}

// ---------- Email Editor ----------
const EMAIL_DEFAULTS: EmailSettings = {
  from_name: "Invoice — Branta Tech",
  from_email: "finance@brantatech.com",
  reply_to: "finance@brantatech.com",
  subject_template: "Invoice {{invoice_slug}} — {{invoice_title}} ({{currency}} {{total_amount}})",
  brand_color: "#E56A17",
  background_color: "#F9FAFB",
  card_background: "#FFFFFF",
  header_html: "<h1 style=\"margin:0;font:600 20px/1.3 Inter,Arial,sans-serif;color:#111827\">Invoice {{invoice_slug}}</h1>",
  body_html: "<p style=\"margin:0 0 12px;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827\">Hi {{recipient_name}},</p><p style=\"margin:0;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827\">Please find your invoice attached. Outstanding: <b>{{currency}} {{outstanding_amount}}</b>.</p>",
  cta_label: "View invoice",
  footer_html: "<p style=\"margin:0;font:400 12px/1.5 Inter,Arial,sans-serif;color:#6B7280\">— Branta Tech · Finance</p>",
  auto_send_on_create: true,
  auto_send_on_installment_paid: true,
  auto_send_on_fully_paid: true,
  reminders_enabled: true,
  reminder_days_upcoming: "3,1",
  reminder_days_overdue: "1,3,7,14",
  reminder_subject_template:
    "Reminder · Invoice {{invoice_slug}} — {{currency}} {{outstanding_amount}} due {{due_label}}",
  reminder_body_html:
    "<p style=\"margin:0 0 12px;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827\">Hi {{recipient_name}},</p><p style=\"margin:0 0 12px;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827\">This is a friendly reminder that installment <b>#{{installment_seq}}</b> of invoice <b>{{invoice_slug}}</b> ({{currency}} {{installment_amount}}) is {{due_label}}.</p><p style=\"margin:0;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827\">Outstanding: <b>{{currency}} {{outstanding_amount}}</b>.</p>",
};

function EmailEditor({ initial }: { initial: EmailSettings | null }) {
  const [form, setForm] = useState<EmailSettings>(() => ({ ...EMAIL_DEFAULTS, ...(initial ?? {}) }));
  const qc = useQueryClient();
  const updateFn = useServerFn(updateInvoiceEmailSettings);
  const mut = useMutation({
    mutationFn: () => updateFn({ data: form as unknown as Record<string, unknown> }),
    onSuccess: () => {
      toast.success("Email template saved");
      qc.invalidateQueries({ queryKey: ["finance", "invoice-templates"] });
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const previewHtml = useMemo(() => {
    const header = renderVars(form.header_html);
    const body = renderVars(form.body_html);
    const footer = renderVars(form.footer_html);
    const cta = renderVars(form.cta_label);
    return `<div style="background:${form.background_color};padding:16px;font-family:Inter,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;background:${form.card_background};border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;">
<div style="padding:20px 22px;border-bottom:3px solid ${form.brand_color};">${header}</div>
<div style="padding:18px 22px;">${body}
<div style="margin:16px 0;"><a href="#" style="display:inline-block;padding:9px 16px;background:${form.brand_color};color:#fff;text-decoration:none;border-radius:4px;font:600 13px/1 Inter,Arial,sans-serif;">${cta}</a></div>
</div>
<div style="padding:0 22px 18px;">${footer}</div>
</div></div>`;
  }, [form]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4 rounded-md border border-border bg-card p-5">
        <Section title="Sender">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From name">
              <Input value={form.from_name} onChange={(e) => set("from_name", e.target.value)} />
            </Field>
            <Field label="From email">
              <Input value={form.from_email} onChange={(e) => set("from_email", e.target.value)} />
            </Field>
          </div>
          <Field label="Reply-to">
            <Input value={form.reply_to ?? ""} onChange={(e) => set("reply_to", e.target.value || null)} />
          </Field>
          <Field label="Subject template">
            <Input value={form.subject_template} onChange={(e) => set("subject_template", e.target.value)} />
          </Field>
        </Section>

        <Section title="Colors">
          <div className="grid grid-cols-3 gap-3">
            <ColorField label="Brand" value={form.brand_color} onChange={(v) => set("brand_color", v)} />
            <ColorField label="Background" value={form.background_color} onChange={(v) => set("background_color", v)} />
            <ColorField label="Card" value={form.card_background} onChange={(v) => set("card_background", v)} />
          </div>
        </Section>

        <Section title="Content (HTML with variables)">
          <Field label="Header HTML">
            <Textarea rows={2} value={form.header_html} onChange={(e) => set("header_html", e.target.value)} className="font-mono text-[12px]" />
          </Field>
          <Field label="Body HTML">
            <Textarea rows={5} value={form.body_html} onChange={(e) => set("body_html", e.target.value)} className="font-mono text-[12px]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CTA label">
              <Input value={form.cta_label} onChange={(e) => set("cta_label", e.target.value)} />
            </Field>
            <Field label="Footer HTML">
              <Input value={form.footer_html} onChange={(e) => set("footer_html", e.target.value)} className="font-mono text-[12px]" />
            </Field>
          </div>
          <p className="text-[10.5px] text-muted-foreground">
            Variables: <code>{"{{recipient_name}}"}</code> <code>{"{{invoice_slug}}"}</code> <code>{"{{invoice_title}}"}</code> <code>{"{{currency}}"}</code> <code>{"{{total_amount}}"}</code> <code>{"{{paid_amount}}"}</code> <code>{"{{outstanding_amount}}"}</code> <code>{"{{customer_name}}"}</code> <code>{"{{status}}"}</code> <code>{"{{view_url}}"}</code>
          </p>
        </Section>

        <Section title="Automation">
          <div className="space-y-2">
            <ToggleRow label="Auto-send when invoice is created" checked={form.auto_send_on_create} onChange={(v) => set("auto_send_on_create", v)} />
            <ToggleRow label="Auto-send when an installment is paid" checked={form.auto_send_on_installment_paid} onChange={(v) => set("auto_send_on_installment_paid", v)} />
            <ToggleRow label="Auto-send when invoice is fully paid" checked={form.auto_send_on_fully_paid} onChange={(v) => set("auto_send_on_fully_paid", v)} />
          </div>
        </Section>

        <Section title="Payment reminders (daily cron)">
          <ToggleRow label="Enable automated payment reminders" checked={form.reminders_enabled} onChange={(v) => set("reminders_enabled", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Upcoming (days before due, comma-separated)">
              <Input value={form.reminder_days_upcoming} onChange={(e) => set("reminder_days_upcoming", e.target.value)} placeholder="3,1" className="font-mono text-[12px]" />
            </Field>
            <Field label="Overdue (days after due, comma-separated)">
              <Input value={form.reminder_days_overdue} onChange={(e) => set("reminder_days_overdue", e.target.value)} placeholder="1,3,7,14" className="font-mono text-[12px]" />
            </Field>
          </div>
          <Field label="Reminder subject template">
            <Input value={form.reminder_subject_template} onChange={(e) => set("reminder_subject_template", e.target.value)} className="font-mono text-[12px]" />
          </Field>
          <Field label="Reminder body HTML">
            <Textarea rows={4} value={form.reminder_body_html} onChange={(e) => set("reminder_body_html", e.target.value)} className="font-mono text-[12px]" />
          </Field>
          <p className="text-[10.5px] text-muted-foreground">
            Extra variables: <code>{"{{installment_seq}}"}</code> <code>{"{{installment_amount}}"}</code> <code>{"{{due_label}}"}</code> <code>{"{{days}}"}</code>. Runs once daily (09:00 UTC); duplicate sends are blocked per installment/day.
          </p>
        </Section>


        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-brand-700"
          >
            {mut.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Save className="mr-1.5 size-3.5" />}
            Save email template
          </Button>
        </div>
      </div>

      <div className="sticky top-4 h-fit rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Eye className="size-3.5" /> Live preview
        </div>
        <div className="rounded-sm border border-border bg-background p-2">
          <div className="mb-2 border-b border-border pb-2 text-[11px]">
            <div><span className="text-muted-foreground">From:</span> {form.from_name} &lt;{form.from_email}&gt;</div>
            <div><span className="text-muted-foreground">Subject:</span> {renderVars(form.subject_template)}</div>
          </div>
          <iframe
            key={previewHtml.length}
            title="Email preview"
            srcDoc={previewHtml}
            className="h-[520px] w-full rounded-sm border border-border bg-white"
            sandbox=""
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Building blocks ----------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Palette className="size-3" /> {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function LogoUploader({ onUploaded }: { onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const requestUpload = useServerFn(requestR2Upload);

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be under 5MB");
      return;
    }
    setBusy(true);
    try {
      const { url, publicUrl } = await requestUpload({
        data: { filename: file.name, contentType: file.type || "application/octet-stream", scope: "branding" },
      });
      const put = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      if (!publicUrl) throw new Error("R2 public base URL is not configured");
      onUploaded(publicUrl);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="h-9 gap-1.5"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {busy ? "Uploading…" : "Upload"}
      </Button>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-sm border border-border bg-background"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 font-mono text-[12px]" />
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-sm border border-border bg-background px-3 py-2 text-[12.5px]">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

// keep imports used to avoid dead-code warnings on tree-shakers
void RefreshCw;
