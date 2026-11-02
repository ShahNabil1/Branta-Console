import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, Check, Globe, Loader2, Lock, Mail, MapPin, Pencil, Phone, Plug, Settings2,
  ShieldCheck, Sparkles, Users, X, LayoutGrid, type LucideIcon,
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
type Patch = Record<string, string | number | null>;

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
  if (q.isLoading) return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  const c = q.data;
  if (!c) return <div className="p-8 text-[13px] font-semibold text-muted-foreground">Company not found.</div>;
  const accent = companyAccent(c.slug);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <Link to="/app/companies" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All companies
      </Link>

      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <span className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)` }} />
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        <div className="relative flex flex-wrap items-center gap-4">
          {c.logo_url ? <img src={c.logo_url} alt="" className="size-16 rounded-xl object-contain ring-1 ring-border" />
            : <CompanyAvatar name={c.name} slug={c.slug} className="size-16 rounded-xl text-[20px]" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-bold tracking-tight">{c.name}</h1>
              {c.is_holding && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">Holding</span>}
              {c.company_type && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}>{c.company_type}</span>}
            </div>
            {c.tagline && <p className="mt-0.5 truncate text-[13px] font-semibold text-muted-foreground">{c.tagline}</p>}
            <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-status-converted">
              <span className="size-1.5 animate-pulse rounded-full bg-status-converted" /> {c.status === "active" ? "Active" : c.status}
              {c.industry && <span className="text-muted-foreground">· {c.industry}</span>}
            </div>
          </div>
          <Button onClick={() => setActiveCompanySlug(c.slug)} className="shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 active:scale-95">
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
        {tab === "info" ? <InfoTab c={c} accent={accent} /> : <ComingSoon tab={TABS.find((t) => t.id === tab)!} accent={accent} />}
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
      await fn({ data: { id, patch } });
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
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} className="h-7 gap-1 text-[12px] font-bold"><X className="size-3.5" /> Cancel</Button>
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
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      {children}
    </label>
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
    founded_year: c.founded_year ?? null, description: c.description ?? "",
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
          <FieldL label="About the company" className="sm:col-span-2">
            <textarea rows={4} maxLength={2000} value={String(f.description ?? "")} onChange={(v) => e.set("description", v.target.value)}
              className="w-full resize-y rounded-sm border border-input bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand" />
          </FieldL>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <View label="Company name" value={c.name} />
          <View label="Tagline" value={c.tagline} />
          <View label="Company type" value={c.company_type} />
          <View label="Industry" value={c.industry} />
          <View label="Founded" value={c.founded_year} mono />
          <View label="Workspace slug" value={c.slug} mono />
          <div className="sm:col-span-2"><View label="About" value={c.description && <span className="whitespace-pre-line font-semibold">{c.description}</span>} /></div>
        </div>
      )}
    </Section>
  );
}

function ContactSection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const e = useEditable({ email: c.email, support_email: c.support_email ?? "", phone: c.phone ?? "", website_url: c.website_url ?? "" } as Patch);
  const f = e.form as Record<string, string>;
  const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const phoneOk = !f.phone || /^01[3-9]\d{8}$/.test(f.phone);
  const webOk = !f.website_url || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(f.website_url);
  const valid = emailOk(f.email ?? "") && (!f.support_email || emailOk(f.support_email)) && phoneOk && webOk;
  return (
    <Section title="Contact" icon={Mail} accent={accent} canEdit={c.canManage} editing={e.editing} saving={e.saving} dirty={e.dirty && valid}
      onEdit={e.edit} onCancel={e.cancel}
      onSave={async () => { e.setSaving(true); if (await save(e.form, "Contact saved")) e.done(); e.setSaving(false); }}>
      {e.editing ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldL label="Company email *"><Input type="email" value={f.email} onChange={(v) => e.set("email", v.target.value.trim())} className={cn(!emailOk(f.email ?? "") && "border-destructive")} /></FieldL>
          <FieldL label="Support email"><Input type="email" value={f.support_email} onChange={(v) => e.set("support_email", v.target.value.trim())} className={cn(f.support_email && !emailOk(f.support_email) && "border-destructive")} /></FieldL>
          <FieldL label="Phone">
            <BdPhoneInput value={f.phone ?? ""} onChange={(v) => e.set("phone", v)} invalid={!phoneOk} />
            {!phoneOk && <p className="text-[11px] text-destructive">Enter a valid 11-digit number (01XXXXXXXXX).</p>}
          </FieldL>
          <FieldL label="Website">
            <Input value={f.website_url} placeholder="https://" onChange={(v) => e.set("website_url", v.target.value.trim())} className={cn(!webOk && "border-destructive")} />
            {!webOk && <p className="text-[11px] text-destructive">Must start with http:// or https://</p>}
          </FieldL>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <View label="Company email" value={c.email} href={`mailto:${c.email}`} />
          <View label="Support email" value={c.support_email} href={c.support_email ? `mailto:${c.support_email}` : undefined} />
          <View label="Phone" value={c.phone && (
            <span className="flex items-center gap-2"><BdFlag /><span className="font-mono">+88 {c.phone}</span>
              <a href={`tel:+88${c.phone}`} className="ml-auto inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[10.5px] font-bold text-status-converted transition-transform hover:scale-105"><Phone className="size-3" /> Call</a>
            </span>)} />
          <View label="Website" value={c.website_url && <span className="inline-flex items-center gap-1.5"><Globe className="size-3.5" />{c.website_url.replace(/^https?:\/\//, "")}</span>} href={c.website_url ?? undefined} />
        </div>
      )}
    </Section>
  );
}

function AddressSection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const initial = pickAddr(c as unknown as AddrFields);
  const e = useEditable(initial as unknown as Patch);
  const f = e.form as unknown as AddrFields;
  const valid = addrValid(f) && isEnglishAddr(f.address_line1 ?? "");
  const hasAddr = !!initial.address_line1;
  return (
    <Section title="Address" icon={MapPin} accent={accent} canEdit={c.canManage} editing={e.editing} saving={e.saving} dirty={e.dirty && valid}
      onEdit={e.edit} onCancel={e.cancel}
      onSave={async () => { e.setSaving(true); if (await save({ ...(f as unknown as Patch), address: fmtAddr(f) }, "Address saved")) e.done(); e.setSaving(false); }}>
      {e.editing ? (
        <BdAddressBlock form={f} set={(k, v) => e.set(k as never, v as never)} />
      ) : (
        <View label="Registered address" value={hasAddr ? fmtAddr(initial) : c.address} />
      )}
    </Section>
  );
}
