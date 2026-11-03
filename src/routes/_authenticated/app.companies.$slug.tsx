import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, Check, Globe, Loader2, Lock, Mail, MapPin, Pencil, Phone, Plug, Settings2,
  ShieldCheck, Sparkles, Users, X, Plus, Trash2, LayoutGrid, type LucideIcon,
} from "lucide-react";
import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import { CompanyAvatar, PersonChip } from "@/components/company/company-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCompany, updateCompanyInfo } from "@/lib/companies.functions";
import { companyAccent, setActiveCompanySlug } from "@/lib/active-company";
import {
  BdAddressBlock, BdFlag, BdPhoneInput, addrValid, fmtAddr, isEnglishAddr, pickAddr, type AddrFields,
} from "@/components/profile/bd-fields";
import { cn } from "@/lib/utils";
import { DiscardCancelButton } from "@/components/company/danger-confirm";
import { EmailIntegrations } from "@/components/company/email-integrations";
import { CompanySettings } from "@/components/company/company-settings";
import { companyIdentity } from "@/lib/company-identity";

export const Route = createFileRoute("/_authenticated/app/companies/$slug")({
  head: () => ({
    meta: [
      { title: "Company profile · Branta Tech Group" },
      { name: "description", content: "Company profile, identity, contact, address and leadership." },
      { property: "og:title", content: "Company profile · Branta Tech Group" },
      { property: "og:description", content: "Company profile, identity, contact, address and leadership." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireSuperAdmin>
      <CompanyProfile />
    </RequireSuperAdmin>
  ),
});

type Company = NonNullable<Awaited<ReturnType<typeof getCompany>>>;
type Patch = Record<string, unknown>;

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "info", label: "Company Info", icon: Building2 },
  { id: "people", label: "People & Access", icon: Users },
  { id: "workspace", label: "Workspace", icon: LayoutGrid },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "settings", label: "Settings", icon: Settings2 },
];
const COMPANY_TYPES = ["Holding", "Sister concern", "Subsidiary", "Product", "Division"];

function CompanyProfile() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getCompany);
  const q = useQuery({ queryKey: ["company", slug], queryFn: () => fn({ data: { slug } }) });
  const [tab, setTab] = useState("info");
  // Return from Google connect: open Integrations, report the result once, clean the URL.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const g = sp.get("google");
    const wanted = sp.get("tab");
    if (wanted && TABS.some((t) => t.id === wanted)) setTab(wanted);
    if (g === "ok") toast.success("Google account connected for Inbox & Calendar.");
    else if (g === "error") toast.error(sp.get("google_msg") || "Google connection failed.");
    if (sp.has("tab") || g) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  if (q.isLoading) return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  const c = q.data;
  if (!c) return <div className="p-8 text-[13px] font-semibold text-muted-foreground">Company not found.</div>;
  const accent = companyAccent(c.slug);
  const identity = companyIdentity(c.slug, c);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <Link to="/app/companies" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All companies
      </Link>

      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <span className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)` }} />
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <CompanyAvatar name={c.name} slug={c.slug} iconUrl={identity.icon} className="size-16 rounded-md text-[20px]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-[24px] font-bold">
                {identity.logo ? <span className="block w-fit max-w-full rounded-sm bg-[var(--company-artwork-paper)] px-2 py-1"><img src={identity.logo} alt={c.name} className="h-8 w-auto max-w-full object-contain" /></span> : c.name}
              </h1>
              {c.is_holding && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">Holding</span>}
              {c.company_type && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}>{c.company_type}</span>}
            </div>
            {c.tagline && <p className="mt-0.5 truncate text-[13px] font-semibold text-muted-foreground">{c.tagline}</p>}
            <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-status-converted">
              <span className="size-1.5 animate-pulse rounded-full bg-status-converted" /> {c.status === "active" ? "Active" : c.status}
              {c.industry && <span className="text-muted-foreground">· {c.industry}</span>}
            </div>
          </div>
          <Button onClick={() => { setActiveCompanySlug(c.slug); navigate({ href: c.is_holding ? "/app" : `/app/org/${c.slug}` }); }} className="shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 active:scale-95">
            Open workspace
          </Button>
        </div>

        <nav className="relative -mb-6 mt-6 flex gap-1 overflow-x-auto border-t border-border pt-2">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn("relative inline-flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2.5 text-[12.5px] font-bold transition-all active:scale-95",
                  on ? "text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                <t.icon className="size-3.5" style={on ? { color: accent } : undefined} /> {t.label}
                <span className={cn("absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-all duration-300", on ? "opacity-100" : "scale-x-0 opacity-0")} style={{ background: accent }} />
              </button>
            );
          })}
        </nav>
      </section>

      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
        {tab === "info" ? <InfoTab c={c} accent={accent} /> : tab === "integrations" ? <EmailIntegrations slug={c.slug} accent={accent} /> : tab === "settings" ? <CompanySettings c={c} accent={accent} /> : <ComingSoon tab={TABS.find((t) => t.id === tab) ?? TABS[0]} accent={accent} />}
      </div>
    </div>
  );
}

function ComingSoon({ tab, accent }: { tab: (typeof TABS)[number]; accent: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <span className="grid size-12 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}><tab.icon className="size-5" /></span>
      <div className="mt-3 text-[14px] font-bold">{tab.label}</div>
      <div className="mt-1 text-[12px] font-semibold text-muted-foreground">Coming in the next step.</div>
    </div>
  );
}

function useSave(id: string) {
  const fn = useServerFn(updateCompanyInfo);
  const qc = useQueryClient();
  return async (patch: Patch, msg: string) => {
    try {
      await fn({ data: { id, patch } as never });
      await qc.invalidateQueries({ queryKey: ["company"] });
      await qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success(msg);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      return false;
    }
  };
}

function Section({ title, icon: Icon, accent, canEdit, editing, onEdit, onCancel, onSave, saving, dirty, children }: {
  title: string; icon: LucideIcon; accent: string; canEdit: boolean; editing: boolean; saving: boolean; dirty: boolean;
  onEdit: () => void; onCancel: () => void; onSave: () => void; children: ReactNode;
}) {
  return (
    <section className={cn("group rounded-xl border bg-card p-5 shadow-sm transition-all", editing ? "border-brand/50 shadow-md ring-2 ring-brand/10" : "border-border hover:shadow-md")}>
      <header className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg transition-transform group-hover:scale-110" style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}><Icon className="size-4" /></span>
        <h2 className="flex-1 text-[13px] font-bold tracking-tight">{title}</h2>
        {!canEdit ? <Lock className="size-3.5 text-muted-foreground" /> : editing ? (
          <div className="flex gap-1.5">
            <DiscardCancelButton dirty={dirty} onCancel={onCancel} disabled={saving} />
            <Button size="sm" onClick={onSave} disabled={saving || !dirty} className="h-7 gap-1 text-[12px] font-bold shadow-sm shadow-brand/30 active:scale-95">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={onEdit} className="h-7 gap-1 text-[12px] font-bold transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:text-brand active:scale-95"><Pencil className="size-3" /> Edit</Button>
        )}
      </header>
      {children}
    </section>
  );
}

function useEditable<T extends Patch>(initial: T) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<T>(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  return {
    editing, saving, form, dirty, setSaving,
    set: <K extends keyof T>(k: K, v: T[K]) => setForm((f) => ({ ...f, [k]: v })),
    edit: () => { setForm(initial); setEditing(true); },
    cancel: () => { setForm(initial); setEditing(false); },
    done: () => setEditing(false),
  };
}

function View({ label, value, href, mono }: { label: string; value: ReactNode; href?: string; mono?: boolean }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:border-brand/30">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      {empty ? <div className="mt-0.5 text-[13px] font-semibold text-muted-foreground">N/A</div>
        : href ? <a href={href} target="_blank" rel="noreferrer" className={cn("mt-0.5 block break-words text-[13px] font-bold hover:text-brand", mono && "font-mono")}>{value}</a>
          : <div className={cn("mt-0.5 break-words text-[13px] font-bold", mono && "font-mono")}>{value}</div>}
    </div>
  );
}

function FieldL({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  // div, not <label>: a wrapping <label> forwards clicks anywhere on it (including empty space)
  // to the first labelable control inside — e.g. the "Add email"/"Add phone" buttons.
  return (
    <div className={cn("block space-y-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function InfoTab({ c, accent }: { c: Company; accent: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <IdentitySection c={c} accent={accent} />
        <ContactSection c={c} accent={accent} />
        <AddressSection c={c} accent={accent} />
      </div>
      <section className="h-fit rounded-xl border border-border bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}><ShieldCheck className="size-4" /></span>
          <h2 className="text-[13px] font-bold">Leadership</h2>
        </header>
        <div className="space-y-2">
          {([["CEO", c.ceo], ["COO", c.coo]] as const).map(([role, p]) => (
            <div key={role} className="flex items-center justify-between rounded-lg border border-border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm">
              <PersonChip name={p?.full_name ?? "Not assigned"} avatar={p?.avatar_url} role={role} />
              {p && <span className="inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[10px] font-bold text-status-converted"><ShieldCheck className="size-3" /> Super admin</span>}
            </div>
          ))}
        </div>
        <div className="mt-4 text-[11.5px] font-semibold text-muted-foreground">{c.members.length} member{c.members.length === 1 ? "" : "s"} with access</div>
      </section>
    </div>
  );
}

function IdentitySection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const e = useEditable({
    name: c.name, tagline: c.tagline ?? "", company_type: c.company_type ?? "", industry: c.industry ?? "",
    founded_year: c.founded_year ?? null,
  } as Patch);
  const f = e.form as Record<string, string | number | null>;
  const valid = String(f.name ?? "").trim().length >= 2;
  return (
    <Section title="Identity" icon={Sparkles} accent={accent} canEdit={c.canManage} editing={e.editing} saving={e.saving} dirty={e.dirty && valid}
      onEdit={e.edit} onCancel={e.cancel}
      onSave={async () => { e.setSaving(true); if (await save(e.form, "Identity saved")) e.done(); e.setSaving(false); }}>
      {e.editing ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldL label="Company name *"><Input value={String(f.name ?? "")} maxLength={120} onChange={(v) => e.set("name", v.target.value)} /></FieldL>
          <FieldL label="Tagline"><Input value={String(f.tagline ?? "")} maxLength={160} placeholder="e.g. AI-first creative marketing" onChange={(v) => e.set("tagline", v.target.value)} /></FieldL>
          <FieldL label="Company type">
            <select value={String(f.company_type ?? "")} onChange={(v) => e.set("company_type", v.target.value)}
              className="h-9 w-full rounded-sm border border-input bg-background px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <option value="">Select type</option>{COMPANY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </FieldL>
          <FieldL label="Industry / What it does"><Input value={String(f.industry ?? "")} maxLength={80} placeholder="e.g. Software development" onChange={(v) => e.set("industry", v.target.value)} /></FieldL>
          <FieldL label="Founded year"><Input inputMode="numeric" maxLength={4} className="font-mono" value={f.founded_year ?? ""} onChange={(v) => { const d = v.target.value.replace(/\D/g, "").slice(0, 4); e.set("founded_year", d ? Number(d) : null); }} /></FieldL>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <View label="Company name" value={c.name} />
          <View label="Tagline" value={c.tagline} />
          <View label="Company type" value={c.company_type} />
          <View label="Industry" value={c.industry} />
          <View label="Founded" value={c.founded_year} mono />
          <View label="Workspace slug" value={c.slug} mono />
        </div>
      )}
    </Section>
  );
}

const EMAIL_LABELS = ["Sales", "Support", "Accounts", "HR", "Billing", "Careers", "Info", "Other"];
const PHONE_LABELS = ["Hotline", "Office", "Sales", "Support", "WhatsApp", "Mobile", "Other"];
const OFFICE_LABELS = ["Head Office", "Corporate Office", "Branch Office", "Dhaka Office", "Bogura Office", "Factory", "Warehouse", "Other"];
type Item = { label: string; value: string };
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const phoneValid = (v: string) => /^01[3-9]\d{8}$/.test(v);
const cleanDomain = (v: string) => v.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "www.").replace(/\/$/, "");
const domainOk = (v: string) => !v || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v);

function LabelPicker({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex w-40 shrink-0 gap-1">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-sm border border-input bg-background px-2 text-[12.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <option value="" disabled>Label</option>{options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function LabeledList({ items, onChange, options, kind, addText }: { items: Item[]; onChange: (v: Item[]) => void; options: string[]; kind: "email" | "phone"; addText: string }) {
  const upd = (i: number, p: Partial<Item>) => onChange(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const bad = it.value && (kind === "email" ? !emailOk(it.value) : !phoneValid(it.value));
        return (
          <div key={i} className="flex animate-in fade-in slide-in-from-top-1 items-start gap-2">
            <LabelPicker value={it.label} options={options} onChange={(v) => upd(i, { label: v })} />
            <div className="min-w-0 flex-1">
              {kind === "email"
                ? <Input type="email" value={it.value} placeholder="name@company.com" onChange={(e) => upd(i, { value: e.target.value.trim() })} className={cn(bad && "border-destructive")} />
                : <BdPhoneInput value={it.value} onChange={(v) => upd(i, { value: v })} invalid={!!bad} />}
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))} className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90"><Trash2 className="size-3.5" /></Button>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, { label: "", value: "" }])}
        className="h-8 gap-1 border-dashed text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-95"><Plus className="size-3.5" /> {addText}</Button>
    </div>
  );
}

const itemsOk = (xs: Item[], kind: "email" | "phone") => xs.every((x) => x.label.trim() && (kind === "email" ? emailOk(x.value) : phoneValid(x.value)));

function PhoneView({ label, phone }: { label: string; phone: string }) {
  return <View label={label} value={
    <span className="flex items-center gap-2"><BdFlag /><span className="font-mono">+88 {phone}</span>
      <a href={`tel:+88${phone}`} className="ml-auto inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[10.5px] font-bold text-status-converted transition-transform hover:scale-105"><Phone className="size-3" /> Call</a>
    </span>} />;
}

function ContactSection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const cx = c as unknown as { extra_emails?: Item[]; extra_phones?: Item[] };
  const e = useEditable({
    email: c.email, support_email: c.support_email ?? "", phone: c.phone ?? "", website_url: cleanDomain(c.website_url ?? ""),
    extra_emails: cx.extra_emails ?? [], extra_phones: cx.extra_phones ?? [],
  } as Patch);
  const f = e.form as { email: string; support_email: string; phone: string; website_url: string; extra_emails: Item[]; extra_phones: Item[] };
  const phoneOk = !f.phone || phoneValid(f.phone);
  const webOk = domainOk(f.website_url);
  const valid = emailOk(f.email ?? "") && (!f.support_email || emailOk(f.support_email)) && phoneOk && webOk
    && itemsOk(f.extra_emails, "email") && itemsOk(f.extra_phones, "phone");
  const site = cleanDomain(c.website_url ?? "");
  return (
    <Section title="Contact" icon={Mail} accent={accent} canEdit={c.canManage} editing={e.editing} saving={e.saving} dirty={e.dirty && valid}
      onEdit={e.edit} onCancel={e.cancel}
      onSave={async () => { e.setSaving(true); if (await save({ ...f, website_url: f.website_url || null }, "Contact saved")) e.done(); e.setSaving(false); }}>
      {e.editing ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldL label="Company email *"><Input type="email" value={f.email} onChange={(v) => e.set("email", v.target.value.trim())} className={cn(!emailOk(f.email ?? "") && "border-destructive")} /></FieldL>
            <FieldL label="Support email"><Input type="email" value={f.support_email} onChange={(v) => e.set("support_email", v.target.value.trim())} className={cn(f.support_email && !emailOk(f.support_email) && "border-destructive")} /></FieldL>
            <FieldL label="Primary phone">
              <BdPhoneInput value={f.phone ?? ""} onChange={(v) => e.set("phone", v)} invalid={!phoneOk} />
              {!phoneOk && <p className="text-[11px] text-destructive">Enter a valid 11-digit number (01XXXXXXXXX).</p>}
            </FieldL>
            <FieldL label="Website">
              <div className={cn("flex h-9 items-center overflow-hidden rounded-sm border border-input bg-background focus-within:ring-2 focus-within:ring-brand", !webOk && "border-destructive")}>
                <span className="flex h-full items-center gap-1 border-r border-input bg-muted/40 px-2.5 text-muted-foreground"><SiteFavicon domain={f.website_url ?? ""} /></span>
                <input value={f.website_url} placeholder="example.com" onChange={(v) => e.set("website_url", cleanDomain(v.target.value).toLowerCase())}
                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[13px] outline-none" />
              </div>
              {!webOk && <p className="text-[11px] text-destructive">Enter a domain like example.com</p>}
            </FieldL>
          </div>
          <FieldL label="More emails"><LabeledList kind="email" items={f.extra_emails} options={EMAIL_LABELS} addText="Add email" onChange={(v) => e.set("extra_emails", v)} /></FieldL>
          <FieldL label="More phone numbers"><LabeledList kind="phone" items={f.extra_phones} options={PHONE_LABELS} addText="Add phone" onChange={(v) => e.set("extra_phones", v)} /></FieldL>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <View label="Company email" value={c.email} href={`mailto:${c.email}`} />
          <View label="Support email" value={c.support_email} href={c.support_email ? `mailto:${c.support_email}` : undefined} />
          {(cx.extra_emails ?? []).map((x, i) => <View key={`e${i}`} label={`${x.label} email`} value={x.value} href={`mailto:${x.value}`} />)}
          {c.phone ? <PhoneView label="Primary phone" phone={c.phone} /> : <View label="Primary phone" value={null} />}
          {(cx.extra_phones ?? []).map((x, i) => <PhoneView key={`p${i}`} label={x.label} phone={x.value} />)}
          <View label="Website" value={site && <span className="inline-flex items-center gap-1.5"><SiteFavicon domain={site} />{site}</span>} href={site ? `https://${site}` : undefined} />
        </div>
      )}
    </Section>
  );
}

function SiteFavicon({ domain }: { domain: string }) {
  const d = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain) ? domain : "";
  const [debounced, setDebounced] = useState(d);
  const [failed, setFailed] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setDebounced(d); setFailed(false); }, 400); return () => clearTimeout(t); }, [d]);
  if (!debounced || failed) return <Globe className="size-3.5" />;
  return (
    <img key={debounced} src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(debounced)}&sz=64`} alt=""
      className="size-4 rounded-[3px] object-contain animate-in fade-in zoom-in-75 duration-300" onError={() => setFailed(true)} />
  );
}

type Office = AddrFields & { label: string };
const EMPTY_ADDR: AddrFields = { address_line1: "", division: null, district: null, upazila: null, post_office: null, postcode: null };

function AddressSection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const cx = c as unknown as { offices?: Office[]; address_label?: string | null };
  const primary = { ...pickAddr(c as unknown as AddrFields), label: cx.address_label || "Head Office" } as Office;
  const initial = [primary, ...(cx.offices ?? [])];
  const e = useEditable({ list: initial } as Patch);
  const list = (e.form as { list: Office[] }).list;
  const setList = (v: Office[]) => e.set("list", v);
  const upd = (i: number, k: string, v: unknown) => setList(list.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  const valid = list.every((o) => o.label.trim() && addrValid(o) && isEnglishAddr(o.address_line1 ?? ""));
  const shown = initial.filter((o) => o.address_line1);
  return (
    <Section title="Addresses" icon={MapPin} accent={accent} canEdit={c.canManage} editing={e.editing} saving={e.saving} dirty={e.dirty && valid}
      onEdit={e.edit} onCancel={e.cancel}
      onSave={async () => {
        e.setSaving(true);
        const [p, ...rest] = list;
        const { label, ...pa } = p;
        if (await save({ ...pa, address_label: label, address: fmtAddr(pa), offices: rest }, "Addresses saved")) e.done();
        e.setSaving(false);
      }}>
      {e.editing ? (
        <div className="space-y-4">
          {list.map((o, i) => (
            <div key={i} className="animate-in fade-in slide-in-from-top-1 space-y-3 rounded-lg border border-border/80 bg-muted/10 p-4">
              <div className="flex items-center gap-2">
                <LabelPicker value={o.label} options={OFFICE_LABELS} onChange={(v) => upd(i, "label", v)} />
                {i === 0 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">Primary</span>}
                {i > 0 && <Button type="button" size="icon" variant="ghost" onClick={() => setList(list.filter((_, j) => j !== i))} className="ml-auto size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90"><Trash2 className="size-3.5" /></Button>}
              </div>
              <BdAddressBlock form={o} set={(k, v) => upd(i, k as string, v)} />
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setList([...list, { ...EMPTY_ADDR, label: "" }])}
            className="h-8 gap-1 border-dashed text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-95"><Plus className="size-3.5" /> Add office address</Button>
        </div>
      ) : shown.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((o, i) => <View key={i} label={o.label} value={fmtAddr(o)} />)}
        </div>
      ) : <View label="Address" value={c.address} />}
    </Section>
  );
}
