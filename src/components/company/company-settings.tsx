import { useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, Hash, ImageUp, Loader2, Palette, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { InvoiceStudio } from "./invoice-studio";
import { updateCompanyBrand, updateCompanyPrefixes } from "@/lib/companies.functions";
import {
  brandChecks, DEFAULT_PREFIX, HEX, MAX_ASSET_CHARS, PREFIX_KINDS, PREFIX_RE,
  type BrandKit, type PrefixKind, type Prefixes,
} from "@/lib/brand-kit";

type Co = { id: string; name: string; slug: string; is_holding: boolean; tagline?: string | null; brand_kit?: unknown; code_prefixes?: unknown };

const SECTIONS: { id: string; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "brand", label: "Brand Kit", icon: Palette, hint: "Logos, icon, colours" },
  { id: "codes", label: "Code Prefixes", icon: Hash, hint: "Lead, customer, invoice, expense" },
  { id: "invoice", label: "Invoice Studio", icon: FileText, hint: "Template, payment, signature" },
];

export function CompanySettings({ c, accent }: { c: Co; accent: string }) {
  const [sec, setSec] = useState("brand");
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
      <aside className="space-y-1 rounded-xl border border-border bg-card p-2 md:self-start">
        {SECTIONS.map((s) => {
          const on = sec === s.id;
          return (
            <Button variant="ghost" key={s.id} onClick={() => setSec(s.id)}
              className={cn("flex h-auto w-full justify-start items-start gap-2.5 rounded px-3 py-2.5 text-left transition-all active:scale-[.98]", on ? "bg-muted" : "hover:bg-muted/60")}>
              <s.icon className={cn("mt-0.5 size-4", on && "text-brand")} />
              <span><span className="block text-[12.5px] font-bold">{s.label}</span><span className="block text-[11px] font-semibold text-muted-foreground">{s.hint}</span></span>
            </Button>
          );
        })}
        <div className="px-3 pb-2 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Coming next</div>
        {["Project Flow", "Finance & Alerts"].map((l) => (
          <div key={l} className="px-3 py-1.5 text-[12px] font-semibold text-muted-foreground/70">{l}</div>
        ))}
      </aside>
      <div key={sec} className="min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300">
        {sec === "brand" ? <BrandKitPanel c={c} accent={accent} /> : sec === "invoice" ? <InvoiceStudio companyId={c.id} /> : <PrefixPanel c={c} accent={accent} />}
      </div>
    </div>
  );
}

function Card({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h3 className="text-[14px] font-bold">{title}</h3>{sub && <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

async function fileToDataUrl(file: File, maxW: number): Promise<string> {
  if (!/^image\/(png|webp|jpeg|svg\+xml)$/.test(file.type)) throw new Error("Use PNG, WebP, JPG or SVG.");
  const raw = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  if (file.type === "image/svg+xml") { if (raw.length > MAX_ASSET_CHARS) throw new Error("SVG is too large."); return raw; }
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = raw; });
  const scale = Math.min(1, maxW / img.width);
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
  cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
  const out = cv.toDataURL("image/png");
  if (out.length > MAX_ASSET_CHARS) throw new Error("Image is too large after resizing — try a simpler logo.");
  return out;
}

function AssetSlot({ label, hint, ratio, value, dark, onChange, accent }: {
  label: string; hint: string; ratio: string; value?: string | null; dark?: boolean; onChange: (v: string | null) => void; accent: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { onChange(await fileToDataUrl(f, ratio === "1:1" ? 512 : 1200)); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between"><span className="text-[12px] font-bold">{label}</span><span className="font-mono text-[10.5px] text-muted-foreground">{ratio}</span></div>
      <button type="button" onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
        className={cn("group relative grid h-28 w-full place-items-center overflow-hidden rounded-lg border border-dashed transition-all hover:-translate-y-0.5 hover:shadow-md",
          dark ? "border-foreground/20 bg-foreground" : "border-border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:14px_14px]")}
        style={{ outlineColor: accent }}>
        {busy ? <Loader2 className="size-5 animate-spin text-muted-foreground" />
          : value ? <img src={value} alt={label} className={cn("max-h-20 object-contain", ratio === "1:1" ? "size-20" : "max-w-[85%]")} />
            : <span className={cn("flex flex-col items-center gap-1 text-[11.5px] font-semibold", dark ? "text-background/70" : "text-muted-foreground")}><ImageUp className="size-5" />Drop or click to upload</span>}
      </button>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{hint}</span>
        {value && <button type="button" onClick={() => onChange(null)} className="text-muted-foreground transition-colors hover:text-destructive"><Trash2 className="size-3.5" /></button>}
      </div>
      <input ref={ref} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [txt, setTxt] = useState(value);
  return (
    <label className="space-y-1.5">
      <span className="text-[12px] font-bold">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => { onChange(e.target.value.toUpperCase()); setTxt(e.target.value.toUpperCase()); }} className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5" />
        <Input value={txt} onChange={(e) => { const v = e.target.value.toUpperCase(); setTxt(v); if (HEX.test(v)) onChange(v); }} className="font-mono" maxLength={7} />
      </div>
    </label>
  );
}

const BRAND_DEFAULT = (accent: string): BrandKit => ({ primary: /^#[0-9a-f]{6}$/i.test(accent) ? accent.toUpperCase() : "#E56A17", secondary: "#1F2937", gradient: { enabled: false, from: "#E56A17", to: "#F59E0B", angle: 135 } });

function BrandKitPanel({ c, accent }: { c: Co; accent: string }) {
  const saved = useMemo(() => ({ ...BRAND_DEFAULT(accent), ...((c.brand_kit as BrandKit) ?? {}) }), [c.brand_kit, accent]);
  const [k, setK] = useState<BrandKit>(saved);
  const [saving, setSaving] = useState(false);
  const fn = useServerFn(updateCompanyBrand);
  const qc = useQueryClient();
  const dirty = JSON.stringify(k) !== JSON.stringify(saved);
  const set = (p: Partial<BrandKit>) => setK((o) => ({ ...o, ...p }));
  const g = k.gradient!;
  const checks = brandChecks(k);
  const primary = k.primary ?? "#E56A17";
  const save = async () => {
    setSaving(true);
    try {
      await fn({ data: { id: c.id, brand: k } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["company"] }), qc.invalidateQueries({ queryKey: ["companies"] })]);
      toast.success("Brand kit saved.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setK(saved)}>Cancel</Button>
      <Button size="sm" disabled={!dirty || saving} onClick={save}>{saving && <Loader2 className="size-3.5 animate-spin" />}Save</Button>
    </div>
  );
  return (
    <div className="space-y-4">
      <Card title="Logo assets" sub="Three versions so every surface looks right — never stretch one logo everywhere." right={actions}>
        <div className="grid gap-4 sm:grid-cols-3">
          <AssetSlot accent={accent} label="Primary logo" ratio="~4:1" hint="Transparent, for white paper" value={k.logo_primary} onChange={(v) => set({ logo_primary: v })} />
          <AssetSlot accent={accent} label="Inverse logo" ratio="~4:1" dark hint="White version, dark footers" value={k.logo_inverse} onChange={(v) => set({ logo_inverse: v })} />
          <AssetSlot accent={accent} label="Square mark" ratio="1:1" hint="Icon, switcher, favicon" value={k.mark} onChange={(v) => set({ mark: v })} />
        </div>
      </Card>

      <Card title="Colours" sub="Primary drives accents; secondary is the print-safe dark for text and lines.">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Primary accent" value={primary} onChange={(v) => set({ primary: v })} />
          <ColorField label="Secondary / contrast" value={k.secondary ?? "#1F2937"} onChange={(v) => set({ secondary: v })} />
        </div>
        <div className="mt-4 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-[12px] font-bold">
            <input type="checkbox" checked={g.enabled} onChange={(e) => set({ gradient: { ...g, enabled: e.target.checked } })} className="accent-[var(--brand)]" />
            Gradient accent (screen only — print falls back to primary)
          </label>
          {g.enabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
              <ColorField label="From" value={g.from} onChange={(v) => set({ gradient: { ...g, from: v } })} />
              <ColorField label="To" value={g.to} onChange={(v) => set({ gradient: { ...g, to: v } })} />
              <label className="space-y-1.5"><span className="text-[12px] font-bold">Angle <span className="font-mono text-muted-foreground">{g.angle}°</span></span>
                <input type="range" min={0} max={360} value={g.angle} onChange={(e) => set({ gradient: { ...g, angle: Number(e.target.value) } })} className="h-9 w-full accent-[var(--brand)]" /></label>
              <div className="h-10 rounded-md sm:col-span-3" style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }} />
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Live preview" sub="How your kit lands on an invoice and in the app.">
          {/* Preview intentionally uses the company's own colours, not the Console theme. */}
          <div className="overflow-hidden rounded-lg border border-border shadow-inner" style={{ background: "#FFFFFF", color: k.secondary }}>
            <div className="h-1.5" style={{ background: g.enabled ? `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` : primary }} />
            <div className="flex items-start justify-between p-4">
              {k.logo_primary ? <img src={k.logo_primary} alt="" className="h-9 max-w-[55%] object-contain" /> : <span className="text-[16px] font-black">{c.name}</span>}
              <div className="text-right"><div className="text-[15px] font-black tracking-tight" style={{ color: primary }}>INVOICE</div><div className="font-mono text-[10px] opacity-70">#{DEFAULT_PREFIX.invoice}0001</div></div>
            </div>
            <div className="mx-4 grid grid-cols-[1fr_60px] px-2 py-1.5 text-[10px] font-bold" style={{ background: primary, color: "#FFFFFF" }}><span>Description</span><span className="text-right">Amount</span></div>
            <div className="mx-4 grid grid-cols-[1fr_60px] border-b px-2 py-1.5 text-[10px]" style={{ borderColor: `${k.secondary}22` }}><span>Brand campaign</span><span className="text-right font-mono">৳ 45,000</span></div>
            <div className="mt-4 flex items-center justify-between px-4 py-2.5" style={{ background: k.secondary }}>
              {k.logo_inverse ? <img src={k.logo_inverse} alt="" className="h-5 object-contain" /> : <span className="text-[10px] font-bold" style={{ color: "#FFFFFF" }}>{c.name}</span>}
              <span className="text-[9px]" style={{ color: "#FFFFFFAA" }}>{c.tagline ?? "Thank you"}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            {k.mark ? <img src={k.mark} alt="" className="size-6 rounded-md object-contain" /> : <span className="grid size-6 place-items-center rounded-md text-[11px] font-black" style={{ background: primary, color: "#FFFFFF" }}>{c.name[0]}</span>}
            <span className="text-[12px] font-bold">{c.name}</span><span className="ml-auto text-[10.5px] font-semibold text-muted-foreground">Company switcher</span>
          </div>
        </Card>
        <Card title="Print & contrast check" sub="WCAG ratios against white paper.">
          <ul className="space-y-2">
            {checks.map((ch) => {
              const Icon = ch.level === "ok" ? CheckCircle2 : ch.level === "warn" ? AlertTriangle : XCircle;
              return (
                <li key={ch.label} className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", ch.level === "ok" ? "text-status-converted" : ch.level === "warn" ? "text-status-meeting" : "text-destructive")} />
                  <span><span className="block text-[12px] font-bold">{ch.label}</span><span className="block text-[11px] font-semibold text-muted-foreground">{ch.detail}</span></span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<PrefixKind, { label: string; sample: (p: string) => string; live: boolean }> = {
  lead: { label: "Lead code", sample: (p) => `${p}101`, live: true },
  customer: { label: "Customer code", sample: (p) => `${p}042`, live: true },
  invoice: { label: "Invoice number", sample: (p) => `${p}0001`, live: false },
  expense: { label: "Expense voucher", sample: (p) => `${p}2611-001`, live: false },
};

function PrefixPanel({ c, accent }: { c: Co; accent: string }) {
  const saved = useMemo(() => (c.code_prefixes as Prefixes) ?? {}, [c.code_prefixes]);
  const [p, setP] = useState<Prefixes>(saved);
  const [saving, setSaving] = useState(false);
  const fn = useServerFn(updateCompanyPrefixes);
  const qc = useQueryClient();
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as Prefixes;
  const invalid = Object.values(clean).some((v) => !PREFIX_RE.test(v!));
  const dirty = JSON.stringify(clean) !== JSON.stringify(saved);
  const save = async () => {
    setSaving(true);
    try {
      await fn({ data: { id: c.id, prefixes: clean } });
      await qc.invalidateQueries({ queryKey: ["company"] });
      toast.success("Code prefixes saved. New records use them from now on.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Card title="Code prefixes" sub="Only new records get the new prefix — existing codes never change. Numbers stay one group-wide series."
      right={<div className="flex gap-2"><Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setP(saved)}>Cancel</Button>
        <Button size="sm" disabled={!dirty || invalid || saving} onClick={save}>{saving && <Loader2 className="size-3.5 animate-spin" />}Save</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {PREFIX_KINDS.map((kind) => {
          const meta = KIND_LABEL[kind];
          const v = p[kind] ?? "";
          const eff = v || (c.is_holding ? DEFAULT_PREFIX[kind] : "");
          const bad = !!v && !PREFIX_RE.test(v);
          return (
            <div key={kind} className="rounded-lg border border-border p-3 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold">{meta.label}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.live ? "bg-status-converted/10 text-status-converted" : "bg-muted text-muted-foreground")}>
                  {meta.live ? "Active now" : "Applies with Finance phase"}
                </span>
              </div>
              <Input value={v} placeholder={c.is_holding ? DEFAULT_PREFIX[kind] : "e.g. ADL-"} maxLength={6}
                onChange={(e) => { let x = e.target.value.toUpperCase().replace(/[^A-Z-]/g, ""); setP((o) => ({ ...o, [kind]: x })); }}
                onBlur={() => v && !v.endsWith("-") && setP((o) => ({ ...o, [kind]: `${v}-` }))}
                className={cn("mt-2 font-mono", bad && "border-destructive")} />
              <div className="mt-2 flex items-center justify-between text-[11px] font-semibold">
                <span className={bad ? "text-destructive" : "text-muted-foreground"}>{bad ? "2–5 capital letters then -" : eff ? "Next looks like" : "Uses the group default"}</span>
                {eff && !bad && <span className="font-mono font-bold" style={{ color: accent }}>{meta.sample(eff)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
