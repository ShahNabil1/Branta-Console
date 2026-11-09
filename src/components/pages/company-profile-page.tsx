import { useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Check,
  Globe,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plug,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Plus,
  Trash2,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { CompanyAvatar, PersonChip } from "@/components/company/company-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCompany, updateCompanyInfo } from "@/lib/companies.functions";
import { companyAccent, setActiveCompanySlug } from "@/lib/active-company";
import {
  BdAddressBlock,
  BdFlag,
  BdPhoneInput,
  addrValid,
  fmtAddr,
  isEnglishAddr,
  pickAddr,
  type AddrFields,
} from "@/components/profile/bd-fields";
import { cn } from "@/lib/utils";
import { DiscardCancelButton } from "@/components/company/danger-confirm";
import { EmailIntegrations } from "@/components/company/email-integrations";
import { CompanySettings } from "@/components/company/company-settings";
import { companyIdentity } from "@/lib/company-identity";
import { CatalogEditor, catalogValid } from "@/components/company/company-services-section";
import { catalogOf, flattenCatalog, type ServiceCategory } from "@/lib/service-catalog";
import { useMutation } from "@tanstack/react-query";
import { fetchBrandingImage, requestR2Upload } from "@/lib/r2.functions";
import { Briefcase, Eye, ImageUp, RotateCcw } from "lucide-react";
import { processFooterLogo, processIcon, processLogo, putWithProgress, type LogoStage, type PaletteColor } from "@/lib/logo-engine";
import { Scissors } from "lucide-react";
import { ReceiptPreview } from "@/components/finance/receipt-media";

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

export function CompanyProfile({ slug, mine = false }: { slug: string; mine?: boolean }) {
  const navigate = useNavigate();
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
  if (q.isLoading)
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  const c = q.data;
  if (!c)
    return (
      <div className="p-8 text-[13px] font-semibold text-muted-foreground">Company not found.</div>
    );
  const accent = companyAccent(c.slug, (c.brand_kit as { primary?: string } | null)?.primary);
  const soft = HEX.test(savedKit(c).secondary ?? "") ? savedKit(c).secondary! : accent;
  const identity = companyIdentity(c.slug, c);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      {!mine && <Link
        to="/app/companies"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All companies
      </Link>}

      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <span
          className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full blur-3xl"
          style={{ background: `color-mix(in oklab, ${soft} 18%, transparent)` }}
        />
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${accent} 70%, ${soft})` }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <CompanyAvatar
            name={c.name}
            slug={c.slug}
            iconUrl={identity.icon}
            className="size-16 rounded-md text-[20px]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-[24px] font-bold">
                {identity.logo ? (
                  <span className="block w-fit max-w-full rounded-sm bg-[var(--company-artwork-paper)] px-2 py-1">
                    <img
                      src={identity.logo}
                      alt={c.name}
                      className="h-11 w-auto max-w-[280px] object-contain"
                    />
                  </span>
                ) : (
                  c.name
                )}
              </h1>
              {c.is_holding && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                  Holding
                </span>
              )}
              {c.company_type && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: `color-mix(in oklab, ${accent} 14%, transparent)`,
                    color: accent,
                  }}
                >
                  {c.company_type}
                </span>
              )}
            </div>
            {c.tagline && (
              <p className="mt-0.5 truncate text-[13px] font-semibold text-muted-foreground">
                {c.tagline}
              </p>
            )}
            <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-status-converted">
              <span className="size-1.5 animate-pulse rounded-full bg-status-converted" />{" "}
              {c.status === "active" ? "Active" : c.status}
              {c.industry && <span className="text-muted-foreground">· {c.industry}</span>}
            </div>
          </div>
          <Button
            onClick={() => {
              setActiveCompanySlug(c.slug);
              navigate({ href: c.is_holding ? "/app" : `/app/org/${c.slug}` });
            }}
            className="shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 active:scale-95"
          >
            Open workspace
          </Button>
        </div>

        <UnderlineTabs
          className="-mb-6 mt-6 border-t border-border pt-2"
          items={TABS}
          value={tab}
          onChange={setTab}
          accent={accent}
          ariaLabel="Company sections"
        />
      </section>

      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
        {tab === "info" ? (
          <InfoTab c={c} accent={accent} />
        ) : tab === "integrations" ? (
          <EmailIntegrations slug={c.slug} accent={accent} />
        ) : tab === "settings" ? (
          <CompanySettings c={c} accent={accent} />
        ) : (
          <ComingSoon tab={TABS.find((t) => t.id === tab) ?? TABS[0]} accent={accent} />
        )}
      </div>
    </div>
  );
}

function ComingSoon({ tab, accent }: { tab: (typeof TABS)[number]; accent: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <span
        className="grid size-12 place-items-center rounded-xl"
        style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
      >
        <tab.icon className="size-5" />
      </span>
      <div className="mt-3 text-[14px] font-bold">{tab.label}</div>
      <div className="mt-1 text-[12px] font-semibold text-muted-foreground">
        Coming in the next step.
      </div>
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

function Section({
  title,
  icon: Icon,
  accent,
  canEdit,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  dirty,
  children,
}: {
  title: string;
  icon: LucideIcon;
  accent: string;
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  dirty: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "group rounded-xl border bg-card p-5 shadow-sm transition-all",
        editing
          ? "border-brand/50 shadow-md ring-2 ring-brand/10"
          : "border-border hover:shadow-md",
      )}
    >
      <header className="mb-4 flex items-center gap-2.5">
        <span
          className="grid size-8 place-items-center rounded-lg transition-transform group-hover:scale-110"
          style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
        >
          <Icon className="size-4" />
        </span>
        <h2 className="flex-1 text-[13px] font-bold tracking-tight">{title}</h2>
        {!canEdit ? (
          <Lock className="size-3.5 text-muted-foreground" />
        ) : editing ? (
          <div className="flex gap-1.5">
            <DiscardCancelButton dirty={dirty} onCancel={onCancel} disabled={saving} />
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving || !dirty}
              className="h-7 gap-1 text-[12px] font-bold shadow-sm shadow-brand/30 active:scale-95"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}{" "}
              Save
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            className="h-7 gap-1 text-[12px] font-bold transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:text-brand active:scale-95"
          >
            <Pencil className="size-3" /> Edit
          </Button>
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
    editing,
    saving,
    form,
    dirty,
    setSaving,
    set: <K extends keyof T>(k: K, v: T[K]) => setForm((f) => ({ ...f, [k]: v })),
    edit: () => {
      setForm(initial);
      setEditing(true);
    },
    cancel: () => {
      setForm(initial);
      setEditing(false);
    },
    done: () => setEditing(false),
  };
}

function View({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:border-brand/30">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      {empty ? (
        <div className="mt-0.5 text-[13px] font-semibold text-muted-foreground">N/A</div>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "mt-0.5 block break-words text-[13px] font-bold hover:text-brand",
            mono && "font-mono",
          )}
        >
          {value}
        </a>
      ) : (
        <div className={cn("mt-0.5 break-words text-[13px] font-bold", mono && "font-mono")}>
          {value}
        </div>
      )}
    </div>
  );
}

function FieldL({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  // div, not <label>: a wrapping <label> forwards clicks anywhere on it (including empty space)
  // to the first labelable control inside — e.g. the "Add email"/"Add phone" buttons.
  return (
    <div className={cn("block space-y-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
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
        <ServicesSection c={c} accent={accent} />
        <AddressSection c={c} accent={accent} />
      </div>
      <section className="h-fit rounded-xl border border-border bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center gap-2.5">
          <span
            className="grid size-8 place-items-center rounded-lg"
            style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
          >
            <ShieldCheck className="size-4" />
          </span>
          <h2 className="text-[13px] font-bold">Leadership</h2>
        </header>
        <div className="space-y-2">
          {(
            [
              ["CEO", c.ceo],
              ["COO", c.coo],
            ] as const
          ).map(([role, p]) => (
            <div
              key={role}
              className="flex items-center justify-between rounded-lg border border-border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <PersonChip
                name={p?.full_name ?? "Not assigned"}
                avatar={p?.avatar_url}
                role={role}
              />
              {p && (
                <span className="inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[10px] font-bold text-status-converted">
                  <ShieldCheck className="size-3" /> Super admin
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 text-[11.5px] font-semibold text-muted-foreground">
          {c.members.length} member{c.members.length === 1 ? "" : "s"} with access
        </div>
      </section>
    </div>
  );
}

type BrandKitForm = { primary?: string; secondary?: string; palette?: string[] };
const HEX = /^#[0-9A-F]{6}$/i;
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function savedKit(c: Company): BrandKitForm {
  return (c.brand_kit as BrandKitForm | null) ?? {};
}

function Swatch({ hex, tag }: { hex: string; tag: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-1.5 py-1 font-mono text-[11.5px] font-bold">
      <span className="size-4 rounded-sm ring-1 ring-border" style={{ background: hex }} />{hex}
      <span className="rounded-sm bg-muted px-1 text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">{tag}</span>
    </span>
  );
}

/** Primary / Secondary editors plus every other colour found in the logo (click to use it). */
function BrandPaletteEditor({ kit, onChange }: { kit: BrandKitForm; onChange: (k: BrandKitForm) => void }) {
  const field = (role: "primary" | "secondary", label: string, hint: string) => {
    const v = kit[role] ?? "";
    const ok = !v || HEX.test(v);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 rounded-sm bg-muted px-1.5 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        <input type="color" aria-label={`Pick ${label} colour`} value={ok && v ? v : "#E56A17"}
          onChange={(x) => onChange({ [role]: x.target.value.toUpperCase() })}
          className="h-9 w-12 cursor-pointer rounded-sm border border-input bg-background p-0.5" />
        <Input value={v} maxLength={7} placeholder={role === "primary" ? "#E56A17" : "optional"} className={cn("w-32 font-mono uppercase", !ok && "border-destructive")}
          onChange={(x) => { let t = x.target.value.trim().toUpperCase(); if (t && !t.startsWith("#")) t = `#${t}`; onChange({ [role]: t }); }} />
        <span className="text-[11.5px] font-semibold text-muted-foreground">{ok ? hint : "Enter a 6-digit hex like #E56A17"}</span>
      </div>
    );
  };
  const all = Array.from(new Set([kit.primary, kit.secondary, ...(kit.palette ?? [])].filter((h): h is string => !!h && HEX.test(h))));
  const p = kit.primary && HEX.test(kit.primary) ? kit.primary : "#E56A17";
  const s = kit.secondary && HEX.test(kit.secondary) ? kit.secondary : p;
  const grad = `linear-gradient(135deg, ${p} 0%, ${s} 100%)`;
  return (
    <div className="space-y-3">
      {field("primary", "Primary", "Main accent: top bar, buttons, icons, invoice headers.")}
      {field("secondary", "Secondary", "Soft highlights: glows, badges, rings.")}
      {all.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-muted-foreground">Colours found in logo — pick a role:</span>
            {kit.secondary && (
              <button type="button" onClick={() => onChange({ primary: kit.secondary, secondary: kit.primary })} className="rounded-sm border border-border px-1.5 py-0.5 text-[10.5px] font-bold text-muted-foreground transition-colors hover:text-foreground">⇄ Swap</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {all.map((h) => {
              const role = h === kit.primary ? "primary" : h === kit.secondary ? "secondary" : null;
              return (
                <div key={h} className={cn("flex items-center gap-1.5 rounded-sm border bg-card p-1 pr-1.5 transition-all", role ? "border-foreground/40 shadow-sm" : "border-border")}>
                  <span className="size-7 rounded-sm ring-1 ring-border" style={{ background: h }} />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[11px] font-bold">{h}</span>
                    <div className="flex gap-1">
                      {(["primary", "secondary"] as const).map((r) => (
                        <button key={r} type="button" disabled={role === r} onClick={() => onChange(r === "primary" ? { primary: h, secondary: kit.secondary === h ? kit.primary : kit.secondary } : { secondary: h, primary: kit.primary === h ? kit.secondary : kit.primary })}
                          className={cn("rounded-sm px-1 text-[9.5px] font-bold uppercase tracking-wide transition-transform active:scale-95", role === r ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
                          {r === "primary" ? "Pri" : "Sec"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-1.5 rounded-sm border border-border bg-muted/40 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Live preview</div>
        <div className="flex items-center gap-2">
          <div className="h-6 flex-1 rounded-sm ring-1 ring-border" style={{ background: grad }} />
          <span className="font-mono text-[10.5px] text-muted-foreground">135° {p} → {s}</span>
        </div>
        <div className="overflow-hidden rounded-sm border border-border bg-card">
          <div className="h-1" style={{ background: grad }} />
          <div className="flex flex-wrap items-center gap-2 p-3">
            <span className="size-7 rounded-sm" style={{ background: grad, boxShadow: `0 0 12px ${s}66` }} />
            <span className="text-[12.5px] font-bold">Invoice INV-0001</span>
            <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${s}22`, color: p, boxShadow: `inset 0 0 0 1px ${s}55` }}>Paid</span>
            <span className="ml-auto rounded-sm px-2.5 py-1 text-[11.5px] font-bold" style={{ background: p, color: lum(p) > 0.6 ? "#111827" : "#FFFFFF" }}>Primary button</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function savedPrimary(c: Company) {
  return String((c.brand_kit as { primary?: string } | null)?.primary ?? "");
}

function IdentitySection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const ident = companyIdentity(c.slug, c);
  const e = useEditable({
    name: c.name,
    tagline: c.tagline ?? "",
    company_type: c.company_type ?? "",
    industry: c.industry ?? "",
    founded_year: c.founded_year ?? null,
    logo_url: ident.logo ?? "",
    brand_kit: { mark: ident.icon ?? null, logo_inverse: ident.inverse ?? null, primary: savedPrimary(c), secondary: savedKit(c).secondary ?? "", palette: savedKit(c).palette ?? [] },
  } as Patch);
  const kitF = (e.form.brand_kit ?? {}) as BrandKitForm;
  const primaryOk = [kitF.primary, kitF.secondary].every((x) => !x || HEX.test(x));
  const f = e.form as Record<string, string | number | null>;
  const valid = String(f.name ?? "").trim().length >= 2;
  return (
    <Section
      title="Identity"
      icon={Sparkles}
      accent={accent}
      canEdit={c.canManage}
      editing={e.editing}
      saving={e.saving}
      dirty={e.dirty && valid && primaryOk}
      onEdit={e.edit}
      onCancel={e.cancel}
      onSave={async () => {
        e.setSaving(true);
        if (await save(e.form, "Identity saved")) e.done();
        e.setSaving(false);
      }}
    >
      {e.editing ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldL label="Company logo" className="sm:col-span-2">
            <LogoUploader value={String(f.logo_url ?? "")} name={c.name} onChange={(v, pal) => { e.set("logo_url", v); if (pal?.length) e.set("brand_kit", { ...(e.form.brand_kit ?? {}), primary: pal[0].hex, secondary: pal[1]?.hex ?? "", palette: pal.map((x) => x.hex) }); }} />
          </FieldL>
          <FieldL label="Company icon (square)" className="sm:col-span-2">
            <IconUploader value={String((e.form.brand_kit as { mark?: string | null } | undefined)?.mark ?? "")} logo={String(f.logo_url ?? "")} name={c.name}
              onChange={(v) => e.set("brand_kit", { ...(e.form.brand_kit ?? {}), mark: v || null })} />
          </FieldL>
          <FieldL label="Invoice footer logo (solid white)" className="sm:col-span-2">
            <IconUploader kind="footer" value={String((e.form.brand_kit as { logo_inverse?: string | null } | undefined)?.logo_inverse ?? "")} logo={String(f.logo_url ?? "")} name={c.name}
              onChange={(v) => e.set("brand_kit", { ...(e.form.brand_kit ?? {}), logo_inverse: v || null })} />
          </FieldL>
          <FieldL label="Brand colours (extracted from logo)" className="sm:col-span-2">
            <BrandPaletteEditor kit={(e.form.brand_kit ?? {}) as BrandKitForm} onChange={(k) => e.set("brand_kit", { ...(e.form.brand_kit ?? {}), ...k })} />
          </FieldL>
          <FieldL label="Company name *">
            <Input
              value={String(f.name ?? "")}
              maxLength={120}
              onChange={(v) => e.set("name", v.target.value)}
            />
          </FieldL>
          <FieldL label="Tagline">
            <Input
              value={String(f.tagline ?? "")}
              maxLength={160}
              placeholder="e.g. AI-first creative marketing"
              onChange={(v) => e.set("tagline", v.target.value)}
            />
          </FieldL>
          <FieldL label="Company type">
            <select
              value={String(f.company_type ?? "")}
              onChange={(v) => e.set("company_type", v.target.value)}
              className="h-9 w-full rounded-sm border border-input bg-background px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="">Select type</option>
              {COMPANY_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </FieldL>
          <FieldL label="Industry / What it does">
            <Input
              value={String(f.industry ?? "")}
              maxLength={80}
              placeholder="e.g. Software development"
              onChange={(v) => e.set("industry", v.target.value)}
            />
          </FieldL>
          <FieldL label="Founded year">
            <Input
              inputMode="numeric"
              maxLength={4}
              className="font-mono"
              value={f.founded_year ?? ""}
              onChange={(v) => {
                const d = v.target.value.replace(/\D/g, "").slice(0, 4);
                e.set("founded_year", d ? Number(d) : null);
              }}
            />
          </FieldL>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <View label="Company logo" value={ident.logo ? <span className="inline-block rounded-sm bg-[var(--company-artwork-paper)] px-2 py-1"><img src={ident.logo} alt={c.name} className="h-10 w-auto max-w-full object-contain" /></span> : null} />
          <View label="Company icon" value={ident.icon ? <img src={ident.icon} alt={`${c.name} icon`} className="size-10 rounded-md bg-[var(--company-artwork-paper)] object-contain ring-1 ring-border" /> : null} />
          <View label="Brand colours" value={savedPrimary(c) ? <span className="flex flex-wrap gap-1.5"><Swatch hex={savedPrimary(c)} tag="primary" />{savedKit(c).secondary && <Swatch hex={savedKit(c).secondary!} tag="secondary" />}{(savedKit(c).palette ?? []).filter((h) => h !== savedPrimary(c) && h !== savedKit(c).secondary).map((h) => <Swatch key={h} hex={h} tag="accent" />)}</span> : null} />
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
const OFFICE_LABELS = [
  "Head Office",
  "Corporate Office",
  "Branch Office",
  "Dhaka Office",
  "Bogura Office",
  "Factory",
  "Warehouse",
  "Other",
];
type Item = { label: string; value: string };
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const phoneValid = (v: string) => /^01[3-9]\d{8}$/.test(v);
const cleanDomain = (v: string) =>
  v
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "www.")
    .replace(/\/$/, "");
const domainOk = (v: string) => !v || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v);

function LabelPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex w-40 shrink-0 gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-sm border border-input bg-background px-2 text-[12.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <option value="" disabled>
          Label
        </option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function LabeledList({
  items,
  onChange,
  options,
  kind,
  addText,
}: {
  items: Item[];
  onChange: (v: Item[]) => void;
  options: string[];
  kind: "email" | "phone";
  addText: string;
}) {
  const upd = (i: number, p: Partial<Item>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const bad = it.value && (kind === "email" ? !emailOk(it.value) : !phoneValid(it.value));
        return (
          <div key={i} className="flex animate-in fade-in slide-in-from-top-1 items-start gap-2">
            <LabelPicker
              value={it.label}
              options={options}
              onChange={(v) => upd(i, { label: v })}
            />
            <div className="min-w-0 flex-1">
              {kind === "email" ? (
                <Input
                  type="email"
                  value={it.value}
                  placeholder="name@company.com"
                  onChange={(e) => upd(i, { value: e.target.value.trim() })}
                  className={cn(bad && "border-destructive")}
                />
              ) : (
                <BdPhoneInput
                  value={it.value}
                  onChange={(v) => upd(i, { value: v })}
                  invalid={!!bad}
                />
              )}
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange([...items, { label: "", value: "" }])}
        className="h-8 gap-1 border-dashed text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-95"
      >
        <Plus className="size-3.5" /> {addText}
      </Button>
    </div>
  );
}

const itemsOk = (xs: Item[], kind: "email" | "phone") =>
  xs.every((x) => x.label.trim() && (kind === "email" ? emailOk(x.value) : phoneValid(x.value)));

function PhoneView({ label, phone }: { label: string; phone: string }) {
  return (
    <View
      label={label}
      value={
        <span className="flex items-center gap-2">
          <BdFlag />
          <span className="font-mono">+88 {phone}</span>
          <a
            href={`tel:+88${phone}`}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[10.5px] font-bold text-status-converted transition-transform hover:scale-105"
          >
            <Phone className="size-3" /> Call
          </a>
        </span>
      }
    />
  );
}

function ContactSection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const cx = c as unknown as { extra_emails?: Item[]; extra_phones?: Item[] };
  const e = useEditable({
    email: c.email,
    support_email: c.support_email ?? "",
    phone: c.phone ?? "",
    website_url: cleanDomain(c.website_url ?? ""),
    extra_emails: cx.extra_emails ?? [],
    extra_phones: cx.extra_phones ?? [],
  } as Patch);
  const f = e.form as {
    email: string;
    support_email: string;
    phone: string;
    website_url: string;
    extra_emails: Item[];
    extra_phones: Item[];
  };
  const phoneOk = !f.phone || phoneValid(f.phone);
  const webOk = domainOk(f.website_url);
  const valid =
    emailOk(f.email ?? "") &&
    (!f.support_email || emailOk(f.support_email)) &&
    phoneOk &&
    webOk &&
    itemsOk(f.extra_emails, "email") &&
    itemsOk(f.extra_phones, "phone");
  const site = cleanDomain(c.website_url ?? "");
  return (
    <Section
      title="Contact"
      icon={Mail}
      accent={accent}
      canEdit={c.canManage}
      editing={e.editing}
      saving={e.saving}
      dirty={e.dirty && valid}
      onEdit={e.edit}
      onCancel={e.cancel}
      onSave={async () => {
        e.setSaving(true);
        if (await save({ ...f, website_url: f.website_url || null }, "Contact saved")) e.done();
        e.setSaving(false);
      }}
    >
      {e.editing ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldL label="Company email *">
              <Input
                type="email"
                value={f.email}
                onChange={(v) => e.set("email", v.target.value.trim())}
                className={cn(!emailOk(f.email ?? "") && "border-destructive")}
              />
            </FieldL>
            <FieldL label="Support email">
              <Input
                type="email"
                value={f.support_email}
                onChange={(v) => e.set("support_email", v.target.value.trim())}
                className={cn(f.support_email && !emailOk(f.support_email) && "border-destructive")}
              />
            </FieldL>
            <FieldL label="Primary phone">
              <BdPhoneInput
                value={f.phone ?? ""}
                onChange={(v) => e.set("phone", v)}
                invalid={!phoneOk}
              />
              {!phoneOk && (
                <p className="text-[11px] text-destructive">
                  Enter a valid 11-digit number (01XXXXXXXXX).
                </p>
              )}
            </FieldL>
            <FieldL label="Website">
              <div
                className={cn(
                  "flex h-9 items-center overflow-hidden rounded-sm border border-input bg-background focus-within:ring-2 focus-within:ring-brand",
                  !webOk && "border-destructive",
                )}
              >
                <span className="flex h-full items-center gap-1 border-r border-input bg-muted/40 px-2.5 text-muted-foreground">
                  <SiteFavicon domain={f.website_url ?? ""} />
                </span>
                <input
                  value={f.website_url}
                  placeholder="example.com"
                  onChange={(v) => e.set("website_url", cleanDomain(v.target.value).toLowerCase())}
                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[13px] outline-none"
                />
              </div>
              {!webOk && (
                <p className="text-[11px] text-destructive">Enter a domain like example.com</p>
              )}
            </FieldL>
          </div>
          <FieldL label="More emails">
            <LabeledList
              kind="email"
              items={f.extra_emails}
              options={EMAIL_LABELS}
              addText="Add email"
              onChange={(v) => e.set("extra_emails", v)}
            />
          </FieldL>
          <FieldL label="More phone numbers">
            <LabeledList
              kind="phone"
              items={f.extra_phones}
              options={PHONE_LABELS}
              addText="Add phone"
              onChange={(v) => e.set("extra_phones", v)}
            />
          </FieldL>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <View label="Company email" value={c.email} href={`mailto:${c.email}`} />
          <View
            label="Support email"
            value={c.support_email}
            href={c.support_email ? `mailto:${c.support_email}` : undefined}
          />
          {(cx.extra_emails ?? []).map((x, i) => (
            <View
              key={`e${i}`}
              label={`${x.label} email`}
              value={x.value}
              href={`mailto:${x.value}`}
            />
          ))}
          {c.phone ? (
            <PhoneView label="Primary phone" phone={c.phone} />
          ) : (
            <View label="Primary phone" value={null} />
          )}
          {(cx.extra_phones ?? []).map((x, i) => (
            <PhoneView key={`p${i}`} label={x.label} phone={x.value} />
          ))}
          <View
            label="Website"
            value={
              site && (
                <span className="inline-flex items-center gap-1.5">
                  <SiteFavicon domain={site} />
                  {site}
                </span>
              )
            }
            href={site ? `https://${site}` : undefined}
          />
        </div>
      )}
    </Section>
  );
}

function SiteFavicon({ domain }: { domain: string }) {
  const d = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain) ? domain : "";
  const [debounced, setDebounced] = useState(d);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(d);
      setFailed(false);
    }, 400);
    return () => clearTimeout(t);
  }, [d]);
  if (!debounced || failed) return <Globe className="size-3.5" />;
  return (
    <img
      key={debounced}
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(debounced)}&sz=64`}
      alt=""
      className="size-4 rounded-[3px] object-contain animate-in fade-in zoom-in-75 duration-300"
      onError={() => setFailed(true)}
    />
  );
}

type Office = AddrFields & { label: string };
const EMPTY_ADDR: AddrFields = {
  address_line1: "",
  division: null,
  district: null,
  upazila: null,
  post_office: null,
  postcode: null,
};

function AddressSection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const cx = c as unknown as { offices?: Office[]; address_label?: string | null };
  const primary = {
    ...pickAddr(c as unknown as AddrFields),
    label: cx.address_label || "Head Office",
  } as Office;
  const initial = [primary, ...(cx.offices ?? [])];
  const e = useEditable({ list: initial } as Patch);
  const list = (e.form as { list: Office[] }).list;
  const setList = (v: Office[]) => e.set("list", v);
  const upd = (i: number, k: string, v: unknown) =>
    setList(list.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  const valid = list.every(
    (o) => o.label.trim() && addrValid(o) && isEnglishAddr(o.address_line1 ?? ""),
  );
  const shown = initial.filter((o) => o.address_line1);
  return (
    <Section
      title="Addresses"
      icon={MapPin}
      accent={accent}
      canEdit={c.canManage}
      editing={e.editing}
      saving={e.saving}
      dirty={e.dirty && valid}
      onEdit={e.edit}
      onCancel={e.cancel}
      onSave={async () => {
        e.setSaving(true);
        const [p, ...rest] = list;
        const { label, ...pa } = p;
        if (
          await save(
            { ...pa, address_label: label, address: fmtAddr(pa), offices: rest },
            "Addresses saved",
          )
        )
          e.done();
        e.setSaving(false);
      }}
    >
      {e.editing ? (
        <div className="space-y-4">
          {list.map((o, i) => (
            <div
              key={i}
              className="animate-in fade-in slide-in-from-top-1 space-y-3 rounded-lg border border-border/80 bg-muted/10 p-4"
            >
              <div className="flex items-center gap-2">
                <LabelPicker
                  value={o.label}
                  options={OFFICE_LABELS}
                  onChange={(v) => upd(i, "label", v)}
                />
                {i === 0 && (
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
                    Primary
                  </span>
                )}
                {i > 0 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setList(list.filter((_, j) => j !== i))}
                    className="ml-auto size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              <BdAddressBlock form={o} set={(k, v) => upd(i, k as string, v)} />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setList([...list, { ...EMPTY_ADDR, label: "" }])}
            className="h-8 gap-1 border-dashed text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-95"
          >
            <Plus className="size-3.5" /> Add office address
          </Button>
        </div>
      ) : shown.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((o, i) => (
            <View key={i} label={o.label} value={fmtAddr(o)} />
          ))}
        </div>
      ) : (
        <View label="Address" value={c.address} />
      )}
    </Section>
  );
}

/** Image formats the logo uploader accepts — video, PDF, ZIP/APK and other non-images stay out. */
const IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/pjpeg", "image/webp", "image/gif", "image/apng",
  "image/svg+xml", "image/avif", "image/bmp", "image/x-ms-bmp", "image/heic", "image/heif",
  "image/tiff", "image/x-icon", "image/vnd.microsoft.icon",
]);
const IMAGE_EXTS = /\.(png|jpe?g|jfif|pjpe?g|webp|gif|svg|avif|bmp|dib|heic|heif|hif|tiff?|ico|apng)$/i;
const IMAGE_ACCEPT = "image/*,.heic,.heif,.hif,.jfif,.tif,.tiff,.svg,.avif,.bmp,.ico,.gif";
const isImageFile = (f: File) => IMAGE_TYPES.has(f.type) || (!f.type && IMAGE_EXTS.test(f.name));

/** Extension label for previews the browser cannot render (HEIC, TIFF…). */
const previewExt = (u: string) => {
  const clean = u.split(/[?#]/)[0];
  const ext = clean.slice(clean.lastIndexOf(".") + 1).toUpperCase();
  return ext || "IMAGE";
};

const LOGO_STEPS: { stage: LogoStage; from: number; to: number; label: string }[] = [
  { stage: "read", from: 0, to: 15, label: "Reading image" },
  { stage: "background", from: 15, to: 40, label: "Making background transparent" },
  { stage: "crop", from: 40, to: 60, label: "Cropping & fitting 1200×300 (4:1)" },
  { stage: "color", from: 60, to: 75, label: "Detecting brand colour · PNG" },
  { stage: "upload", from: 75, to: 100, label: "Uploading to Cloudflare R2" },
];

/** Processes any image into the standard 1200×300 transparent PNG logo, then uploads it to R2 with live progress. */
function LogoUploader({ value, name, onChange }: { value: string; name: string; onChange: (v: string, palette?: PaletteColor[]) => void }) {
  const presign = useServerFn(requestR2Upload);
  const [broken, setBroken] = useState(false);
  const [run, setRun] = useState<{ pct: number; label: string; error?: string; done?: boolean; color?: string | null } | null>(null);
  const [preview, setPreview] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const lastFile = useRef<File | null>(null);
  useEffect(() => setBroken(false), [value]);
  const busy = !!run && !run.error && !run.done;

  const start = async (file: File) => {
    lastFile.current = file;
    if (!isImageFile(file)) { setRun({ pct: 0, label: "", error: "Use an image file (JPG, PNG, WEBP, SVG, GIF). Video, PDF, ZIP and APK are not logos." }); return; }
    if (file.size > 5 * 1024 * 1024) { setRun({ pct: 0, label: "", error: "Logo must be 5 MB or smaller." }); return; }
    const ctrl = new AbortController(); abort.current = ctrl;
    const report = (stage: LogoStage, p: number) => {
      const s = LOGO_STEPS.find((x) => x.stage === stage)!;
      setRun({ pct: Math.round(s.from + (s.to - s.from) * p), label: s.label });
    };
    try {
      const out = await processLogo(file, report, ctrl.signal);
      report("upload", 0);
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
      const { url, publicUrl } = await presign({ data: { filename: `${base}-logo.png`, contentType: "image/png", scope: "branding" } });
      if (!publicUrl) throw new Error("Storage public address is not configured.");
      await putWithProgress(url, out.blob, (p) => report("upload", p), ctrl.signal);
      setRun({ pct: 100, label: out.restacked ? "Done — icon moved left of the name" : out.inverted ? "Done — white logo converted to dark for light pages" : out.removedBackground ? "Done — background removed" : "Done", done: true, color: out.color });
      onChange(publicUrl, out.palette);
      toast.success("Logo ready — press Save to keep it");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setRun(null); return; }
      setRun((r) => ({ pct: r?.pct ?? 0, label: r?.label ?? "", error: err instanceof Error ? err.message : "Upload failed" }));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
      <div className="group/logo relative grid h-14 w-32 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--company-artwork-paper)] ring-1 ring-border">
        {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
          : value ? (broken
            ? <span className="max-w-[7rem] truncate rounded bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{previewExt(value)}</span>
            : <img src={value} alt={name} className="max-h-12 w-auto max-w-[7.5rem] object-contain" onError={() => setBroken(true)} />)
          : <ImageUp className="size-5 text-muted-foreground" />}
        {value && !busy && !broken && (
          <button type="button" aria-label="Preview logo" onClick={() => setPreview(true)}
            className="absolute inset-0 grid place-items-center bg-foreground/45 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/logo:opacity-100">
            <Eye className="size-5 text-background" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[12px] font-bold transition-all hover:border-brand/50 hover:text-brand active:scale-95", busy && "pointer-events-none opacity-60")}>
          <ImageUp className="size-3.5" /> {busy ? "Processing…" : value ? "Replace logo" : "Upload logo"}
          <input type="file" accept={IMAGE_ACCEPT} className="sr-only" disabled={busy}
            onChange={(ev) => { const file = ev.target.files?.[0]; ev.target.value = ""; if (file) void start(file); }} />
        </label>
        {value && !busy && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(""); setRun(null); }} className="h-8 gap-1 text-[12px] font-bold text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" /> Remove
          </Button>
        )}
      </div>
      {run && (
        <div className="basis-full space-y-1.5" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-[11.5px] font-semibold">
            <span className={cn("min-w-0 truncate", run.error ? "text-destructive" : run.done ? "text-status-converted" : "text-foreground")}>
              {run.error ? run.error : run.label}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{run.pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-[width] duration-200", run.error ? "bg-destructive" : run.done ? "bg-status-converted" : "bg-brand")} style={{ width: `${run.pct}%` }} />
          </div>
          {run.done && run.color && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-3 rounded-sm ring-1 ring-border" style={{ background: run.color }} /> Brand colour <span className="font-mono font-bold text-foreground">{run.color}</span>
            </div>
          )}
          {busy && <Button type="button" size="sm" variant="ghost" className="h-7 text-[11.5px] font-bold" onClick={() => abort.current?.abort()}>Cancel</Button>}
          {run.error && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11.5px] font-bold" disabled={!lastFile.current} onClick={() => lastFile.current && void start(lastFile.current)}><RotateCcw className="size-3.5" /> Retry</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-[11.5px] font-bold" onClick={() => setRun(null)}>Cancel</Button>
            </div>
          )}
        </div>
      )}
      <p className="basis-full text-[11px] text-muted-foreground">Any image format · up to 5 MB · auto-cropped, background made transparent, saved as 1200×300 PNG.</p>
      <ReceiptPreview label="Logo" receipts={value ? [{ path: null, url: value, name: `${name} logo.png`, caption: "1200×300 PNG · transparent", isPdf: false }] : []}
        index={preview && value ? 0 : null} onIndexChange={() => {}} onClose={() => setPreview(false)} />
    </div>
  );
}

const ICON_STEPS: { stage: LogoStage; from: number; to: number; label: string }[] = [
  { stage: "read", from: 0, to: 15, label: "Reading image" },
  { stage: "background", from: 15, to: 40, label: "Making background transparent" },
  { stage: "crop", from: 40, to: 60, label: "Fitting 512×512 (1:1) with safe padding" },
  { stage: "color", from: 60, to: 75, label: "Detecting brand colour · PNG" },
  { stage: "upload", from: 75, to: 100, label: "Uploading to Cloudflare R2" },
];

/** Square 512×512 icon: upload a fresh file, or cut the symbol out of the current logo. */
function IconUploader({ value, logo, name, onChange, kind = "icon" }: { value: string; logo: string; name: string; onChange: (v: string) => void; kind?: "icon" | "footer" }) {
  const footer = kind === "footer";
  const presign = useServerFn(requestR2Upload);
  const readLogo = useServerFn(fetchBrandingImage);
  const [run, setRun] = useState<{ pct: number; label: string; error?: string; done?: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const last = useRef<{ file?: File; extract: boolean } | null>(null);
  const busy = !!run && !run.error && !run.done;

  const start = async (src: { file?: File; extract: boolean }) => {
    last.current = src;
    const f = src.file;
    if (f && !isImageFile(f)) { setRun({ pct: 0, label: "", error: "Use an image file (JPG, PNG, WEBP, SVG, GIF)." }); return; }
    if (f && f.size > 5 * 1024 * 1024) { setRun({ pct: 0, label: "", error: "File must be 5 MB or smaller." }); return; }
    const ctrl = new AbortController(); abort.current = ctrl;
    const report = (stage: LogoStage, p: number) => {
      const s = ICON_STEPS.find((x) => x.stage === stage)!;
      setRun({ pct: Math.round(s.from + (s.to - s.from) * p), label: stage === "crop" && footer ? "Cropping 800×200 · converting to solid white #FFFFFF" : stage === "crop" && src.extract ? "Removing wordmark · keeping the symbol" : s.label });
    };
    try {
      let blob: Blob;
      if (f) blob = f;
      else {
        setRun({ pct: 2, label: "Copying the current logo" });
        const r = await readLogo({ data: { url: logo } });
        const bin = atob(r.base64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        blob = new Blob([u], { type: r.type });
      }
      const out = footer ? { ...(await processFooterLogo(blob, report, ctrl.signal)), extracted: false } : await processIcon(blob, src.extract, report, ctrl.signal);
      report("upload", 0);
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
      const { url, publicUrl } = await presign({ data: { filename: `${base}-${footer ? "footer-white" : "icon"}.png`, contentType: "image/png", scope: "branding" } });
      if (!publicUrl) throw new Error("Storage public address is not configured.");
      await putWithProgress(url, out.blob, (p) => report("upload", p), ctrl.signal);
      setRun({ pct: 100, label: footer ? (src.extract ? "Done — white footer logo made from the logo" : "Done — solid white footer logo") : out.extracted ? "Done — symbol cut from the logo" : out.inverted ? "Done — white icon converted to dark" : "Done", done: true });
      onChange(publicUrl);
      toast.success(`${footer ? "Footer logo" : "Icon"} ready — press Save to keep it`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setRun(null); return; }
      setRun((r) => ({ pct: r?.pct ?? 0, label: r?.label ?? "", error: err instanceof Error ? err.message : "Upload failed" }));
    }
  };

  const canExtract = /^https:\/\//.test(logo);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
      <div className={cn("group/icon relative grid h-14 shrink-0 place-items-center overflow-hidden rounded-md ring-1 ring-border", footer ? "w-40 bg-foreground" : "w-14 bg-[var(--company-artwork-paper)]")}>
        {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
          : value ? <img src={value} alt={`${name} ${footer ? "footer logo" : "icon"}`} className={footer ? "h-10 w-36 object-contain" : "size-12 object-contain"} />
          : <ImageUp className="size-5 text-muted-foreground" />}
        {value && !busy && (
          <button type="button" aria-label={footer ? "Preview footer logo" : "Preview icon"} onClick={() => setPreview(true)}
            className="absolute inset-0 grid place-items-center bg-foreground/45 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/icon:opacity-100">
            <Eye className="size-5 text-background" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[12px] font-bold transition-all hover:border-brand/50 hover:text-brand active:scale-95", busy && "pointer-events-none opacity-60")}>
          <ImageUp className="size-3.5" /> {footer ? (value ? "Upload new white logo" : "Upload white logo") : value ? "Upload new icon" : "Upload icon"}
          <input type="file" accept={IMAGE_ACCEPT} className="sr-only" disabled={busy}
            onChange={(ev) => { const file = ev.target.files?.[0]; ev.target.value = ""; if (file) void start({ file, extract: false }); }} />
        </label>
        <Button type="button" size="sm" variant="outline" disabled={busy || !canExtract} title={canExtract ? undefined : "Upload and save a logo first"}
          onClick={() => void start({ extract: true })} className="h-8 gap-1.5 text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-95">
          <Scissors className="size-3.5" /> Make from logo
        </Button>
        {value && !busy && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(""); setRun(null); }} className="h-8 gap-1 text-[12px] font-bold text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" /> Remove
          </Button>
        )}
      </div>
      {run && (
        <div className="basis-full space-y-1.5" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-[11.5px] font-semibold">
            <span className={cn("min-w-0 truncate", run.error ? "text-destructive" : run.done ? "text-status-converted" : "text-foreground")}>{run.error ? run.error : run.label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{run.pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-[width] duration-200", run.error ? "bg-destructive" : run.done ? "bg-status-converted" : "bg-brand")} style={{ width: `${run.pct}%` }} />
          </div>
          {busy && <Button type="button" size="sm" variant="ghost" className="h-7 text-[11.5px] font-bold" onClick={() => abort.current?.abort()}>Cancel</Button>}
          {run.error && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11.5px] font-bold" onClick={() => last.current && void start(last.current)}><RotateCcw className="size-3.5" /> Retry</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-[11.5px] font-bold" onClick={() => setRun(null)}>Cancel</Button>
            </div>
          )}
        </div>
      )}
      <p className="basis-full text-[11px] text-muted-foreground">{footer ? "Invoice footer · saved as 800×200 transparent PNG, every pixel solid white #FFFFFF. “Make from logo” uses the saved logo above." : "Symbol only, no text · saved as 512×512 transparent PNG with 16% safe padding. “Make from logo” uses the saved logo above."}</p>
      <ReceiptPreview label={footer ? "Footer logo" : "Icon"} receipts={value ? [{ path: null, url: value, name: `${name} ${footer ? "footer logo" : "icon"}.png`, caption: footer ? "800×200 PNG · solid white" : "512×512 PNG · transparent", isPdf: false }] : []}
        index={preview && value ? 0 : null} onIndexChange={() => {}} onClose={() => setPreview(false)} />
    </div>
  );
}

function ServicesSection({ c, accent }: { c: Company; accent: string }) {
  const save = useSave(c.id);
  const saved = catalogOf(c as never);
  const [cat, setCat] = useState<ServiceCategory[]>(saved);
  const e = useEditable({ services: flattenCatalog(saved) } as Patch);
  const clean = cat.map((g) => ({ category: g.category.trim(), services: g.services.map((s) => s.trim()).filter(Boolean) }));
  const valid = catalogValid(clean);
  const dirty = JSON.stringify(clean) !== JSON.stringify(saved);
  return (
    <Section
      title="Services"
      icon={Briefcase}
      accent={accent}
      canEdit={c.canManage}
      editing={e.editing}
      saving={e.saving}
      dirty={dirty && valid}
      onEdit={() => { setCat(saved); e.edit(); }}
      onCancel={() => { setCat(saved); e.cancel(); }}
      onSave={async () => {
        e.setSaving(true);
        if (await save({ service_catalog: clean, services: flattenCatalog(clean) } as Patch, "Services saved")) e.done();
        e.setSaving(false);
      }}
    >
      {e.editing ? (
        <div className="space-y-2">
          <p className="text-[11.5px] text-muted-foreground">Group services by category. These appear in the lead and customer service dropdowns for {c.name} only.</p>
          <CatalogEditor value={cat} onChange={setCat} />
        </div>
      ) : saved.length ? (
        <div className="space-y-3">
          {saved.map((g) => (
            <div key={g.category}>
              <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
                {g.category} <span className="font-mono">{g.services.length}</span>
              </div>
              <ol className="grid gap-2 sm:grid-cols-2">
                {g.services.map((s, i) => (
                  <li key={s} className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-[13px] font-bold transition-colors hover:border-brand/30">
                    <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span> {s}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[13px] font-semibold text-muted-foreground">N/A — no services added yet.</div>
      )}
    </Section>
  );
}
