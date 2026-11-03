import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check, GripVertical, Hash, History, Loader2, Lock, Pencil, PieChart, Plus, Receipt, RotateCcw, Trash2, X, type LucideIcon,
} from "lucide-react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updateCompanyPrefixes } from "@/lib/companies.functions";
import {
  BUCKET_KINDS, getCompanyDeductionConfig, getCompanyFundConfig, saveCompanyDeductionConfig, saveCompanyFundConfig,
} from "@/lib/company-wallet.functions";
import { DEFAULT_PREFIX, PREFIX_KINDS, PREFIX_RE, type PrefixKind, type Prefixes } from "@/lib/brand-kit";
import { DangerConfirm } from "./danger-confirm";

type Co = { id: string; name: string; slug: string; is_holding: boolean; tagline?: string | null; code_prefixes?: unknown };
type Kind = (typeof BUCKET_KINDS)[number];

const SUBTABS: { id: "fund" | "deductions" | "prefixes"; label: string; icon: LucideIcon }[] = [
  { id: "fund", label: "Fund Allocation", icon: PieChart },
  { id: "deductions", label: "Direct Deductions", icon: Receipt },
  { id: "prefixes", label: "Code Prefixes", icon: Hash },
];

export function CompanySettings({ c, accent }: { c: Co; accent: string }) {
  const [sub, setSub] = useState<(typeof SUBTABS)[number]["id"]>("fund");
  return (
    <div className="min-w-0 space-y-4">
      <nav className="inline-flex gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {SUBTABS.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-all active:scale-95",
              sub === t.id ? "bg-brand/10 text-brand shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </nav>
      <div key={sub} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
        {sub === "prefixes" ? <PrefixPanel c={c} accent={accent} />
          : c.is_holding ? <HoldingNote />
          : sub === "fund" ? <FundPanel c={c} accent={accent} /> : <DeductionPanel c={c} accent={accent} />}
      </div>
    </div>
  );
}

function HoldingNote() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-[12.5px] font-semibold text-muted-foreground">
      Branta Tech keeps using the group Fund Settings. These rules are only for sister companies.
    </div>
  );
}

/* ---------- shared editable shell (same flow as Company Info) ---------- */

function useEditable<T>(saved: T) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<T>(saved);
  return {
    editing, saving, setSaving, form, setForm,
    value: editing ? form : saved,
    dirty: editing && JSON.stringify(form) !== JSON.stringify(saved),
    edit: () => { setForm(saved); setEditing(true); },
    cancel: () => { setForm(saved); setEditing(false); },
    done: () => setEditing(false),
  };
}

function Panel({ title, sub, icon: Icon, accent, canEdit = true, editing, saving, dirty, invalid, onEdit, onCancel, onSave, children, footer }: {
  title: string; sub: string; icon: LucideIcon; accent: string; canEdit?: boolean; editing: boolean; saving: boolean; dirty: boolean; invalid?: boolean;
  onEdit: () => void; onCancel: () => void; onSave: () => void; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <section className={cn("group rounded-xl border bg-card p-5 shadow-sm transition-all", editing ? "border-brand/50 shadow-md ring-2 ring-brand/10" : "border-border hover:shadow-md")}>
      <header className="mb-4 flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-110" style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">{sub}</p>
        </div>
        {!canEdit ? <Lock className="size-3.5 text-muted-foreground" /> : editing ? (
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} className="h-7 gap-1 text-[12px] font-bold"><X className="size-3.5" /> Cancel</Button>
            <Button size="sm" onClick={onSave} disabled={saving || !dirty || invalid} className="h-7 gap-1 text-[12px] font-bold shadow-sm shadow-brand/30 active:scale-95">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={onEdit} className="h-7 gap-1 text-[12px] font-bold transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:text-brand active:scale-95"><Pencil className="size-3" /> Edit</Button>
        )}
      </header>
      {children}
      {footer}
    </section>
  );
}

const fieldCls = "h-9 rounded-lg border-border bg-background text-[13px] font-semibold shadow-none transition-all focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/15";

function SortRow({ id, editing, children }: { id: string; editing: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-lg border bg-background p-2.5 transition-shadow",
        isDragging ? "z-10 border-brand/50 shadow-lg ring-2 ring-brand/15" : "border-border/70 hover:border-brand/30 hover:shadow-sm")}>
      {editing && (
        <button type="button" {...attributes} {...listeners} aria-label="Drag to reorder"
          className="grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing">
          <GripVertical className="size-4" />
        </button>
      )}
      {children}
    </li>
  );
}

function SortList<T extends { uid: string }>({ items, editing, onReorder, render }: {
  items: T[]; editing: boolean; onReorder: (next: T[]) => void; render: (item: T, i: number) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((x) => x.uid === e.active.id), to = items.findIndex((x) => x.uid === e.over!.id);
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
      <SortableContext items={items.map((x) => x.uid)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">{items.map((it, i) => <SortRow key={it.uid} id={it.uid} editing={editing}>{render(it, i)}</SortRow>)}</ul>
      </SortableContext>
    </DndContext>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="destructive" onClick={onClick} className="h-8 shrink-0 gap-1 text-[12px] font-bold active:scale-95">
      <Trash2 className="size-3.5" /> Remove
    </Button>
  );
}

type Ver = { id: string; version: number; is_active: boolean; note: string | null; created_at: string; count: number; summary: string };

function VersionHistory({ versions, canRestore, onRestore }: { versions: Ver[]; canRestore: boolean; onRestore: (id: string) => void }) {
  if (!versions.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold"><History className="size-4 text-muted-foreground" /> Version history</h3>
      <ol className="relative space-y-2 border-l border-border pl-4">
        {versions.map((v, i) => (
          <li key={v.id} style={{ animationDelay: `${i * 40}ms` }} className="relative animate-in fade-in slide-in-from-left-1 fill-mode-both">
            <span className={cn("absolute -left-[21px] top-3 size-2.5 rounded-full border-2 border-card", v.is_active ? "bg-brand" : "bg-muted-foreground/40")} />
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 p-2.5 transition-colors hover:border-brand/30">
              <span className="font-mono text-[12px] font-bold">v{v.version}</span>
              {v.is_active && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10.5px] font-bold text-brand">Active</span>}
              <span className="text-[12px] font-semibold text-muted-foreground">{new Date(v.created_at).toLocaleString()} · {v.summary}</span>
              {v.note && <span className="w-full text-[12px] font-semibold">{v.note}</span>}
              {!v.is_active && canRestore && (
                <Button size="sm" variant="outline" onClick={() => onRestore(v.id)} className="ml-auto h-7 gap-1 text-[11.5px] font-bold"><RotateCcw className="size-3" /> Use this version</Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const uid = () => Math.random().toString(36).slice(2, 10);
const slugKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "bucket";

/* ---------- Fund Allocation ---------- */

const KIND_LABEL: Record<Kind, string> = {
  free: "Free balance", team_payable: "Team payable", officer_payable: "Officer payable", vat_reserve: "VAT reserve",
  operation: "Operation fund", reserve: "Reserve", growth: "Growth", other: "Other",
};
type Bucket = { uid: string; key: string; label: string; kind: Kind; percent: number };

function FundPanel({ c, accent }: { c: Co; accent: string }) {
  const getFn = useServerFn(getCompanyFundConfig);
  const saveFn = useServerFn(saveCompanyFundConfig);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["company-fund", c.id], queryFn: () => getFn({ data: { companyId: c.id } }) });
  const toBuckets = (cfg: any): Bucket[] =>
    [...(cfg?.company_fund_buckets ?? [])].sort((a: any, b: any) => a.sort - b.sort)
      .map((b: any) => ({ uid: b.id, key: b.key, label: b.label, kind: b.kind, percent: Number(b.percent) }));
  const saved = useMemo(() => toBuckets(q.data?.active), [q.data]);
  const ed = useEditable<{ buckets: Bucket[]; note: string }>({ buckets: saved, note: "" });
  const [removing, setRemoving] = useState<Bucket | null>(null);
  const list = ed.value.buckets;
  const total = Math.round(list.reduce((s, b) => s + (Number(b.percent) || 0), 0) * 1000) / 1000;
  const frees = list.filter((b) => b.kind === "free").length;
  const invalid = total !== 100 || frees !== 1 || list.some((b) => !b.label.trim());
  const set = (u: string, patch: Partial<Bucket>) => ed.setForm((f) => ({ ...f, buckets: f.buckets.map((b) => (b.uid === u ? { ...b, ...patch } : b)) }));

  const persist = async (buckets: Bucket[], note: string, msg: string) => {
    ed.setSaving(true);
    try {
      const used = new Set<string>();
      const payload = buckets.map((b) => {
        let k = b.key || slugKey(b.label); while (used.has(k)) k = `${k}_${used.size}`; used.add(k);
        return { key: k, label: b.label.trim(), kind: b.kind, percent: Number(b.percent) };
      });
      await saveFn({ data: { companyId: c.id, buckets: payload, note: note.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: ["company-fund", c.id] });
      ed.done(); toast.success(msg);
    } catch (e) { toast.error((e as Error).message); } finally { ed.setSaving(false); }
  };

  if (q.isLoading) return <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />;
  const versions: Ver[] = (q.data?.history ?? []).map((h: any) => ({
    id: h.id, version: h.version, is_active: h.is_active, note: h.note, created_at: h.created_at,
    count: h.company_fund_buckets?.length ?? 0, summary: `${h.company_fund_buckets?.length ?? 0} buckets`,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Panel title="Fund allocation" sub="How each paid installment is split into this company's wallet. Each save becomes a new version." icon={PieChart} accent={accent}
          editing={ed.editing} saving={ed.saving} dirty={ed.dirty} invalid={invalid}
          onEdit={ed.edit} onCancel={ed.cancel} onSave={() => persist(ed.form.buckets, ed.form.note, "Fund allocation saved as a new version.")}>
          <TotalBar total={total} accent={accent} />
          {!list.length && !ed.editing ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-[12.5px] font-semibold text-muted-foreground">No allocation yet. Click Edit to add buckets.</p>
          ) : (
            <SortList items={list} editing={ed.editing} onReorder={(b) => ed.setForm((f) => ({ ...f, buckets: b }))} render={(b) => ed.editing ? (
              <>
                <Input value={b.label} onChange={(e) => set(b.uid, { label: e.target.value })} placeholder="Bucket name" className={cn(fieldCls, "min-w-0 flex-1")} />
                <select value={b.kind} onChange={(e) => set(b.uid, { kind: e.target.value as Kind })} className={cn(fieldCls, "w-36 border px-2")}>
                  {BUCKET_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <div className="relative w-24">
                  <Input type="number" min={0} max={100} step="0.5" value={b.percent} onChange={(e) => set(b.uid, { percent: Number(e.target.value) })} className={cn(fieldCls, "pr-6 text-right font-mono")} />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted-foreground">%</span>
                </div>
                <RemoveButton onClick={() => setRemoving(b)} />
              </>
            ) : (
              <>
                <span className="size-2 shrink-0 rounded-full" style={{ background: b.kind === "free" ? accent : "var(--muted-foreground)" }} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{b.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">{KIND_LABEL[b.kind]}</span>
                <span className="w-16 text-right font-mono text-[13px] font-bold">{b.percent}%</span>
              </>
            )} />
          )}
          {ed.editing && (
            <div className="mt-3 space-y-3">
              <Button size="sm" variant="outline" className="gap-1 text-[12px] font-bold" onClick={() => ed.setForm((f) => ({ ...f, buckets: [...f.buckets, { uid: uid(), key: "", label: "", kind: f.buckets.some((x) => x.kind === "free") ? "other" : "free", percent: 0 }] }))}>
                <Plus className="size-3.5" /> Add bucket
              </Button>
              {frees !== 1 && <p className="text-[12px] font-semibold text-destructive">Exactly one bucket must be a Free balance.</p>}
              <Input value={ed.form.note} onChange={(e) => ed.setForm((f) => ({ ...f, note: e.target.value }))} placeholder="What changed? (optional, shown in history)" className={fieldCls} maxLength={300} />
            </div>
          )}
        </Panel>
        <VersionHistory versions={versions} canRestore={!ed.editing} onRestore={(id) => {
          const h = (q.data?.history ?? []).find((x: any) => x.id === id);
          persist(toBuckets(h), `Restored from v${h?.version}`, `Version ${h?.version} is active again (as a new version).`);
        }} />
      </div>
      <Preview buckets={list} accent={accent} />
      <DangerConfirm open={!!removing} icon={Trash2} title="Remove this bucket?" subject={removing?.label || "Unnamed bucket"} confirmLabel="Remove"
        points={[
          `${removing?.percent ?? 0}% will no longer go to this bucket.`,
          "You must re-balance to exactly 100% before saving.",
          "Nothing changes until you press Save.",
          "Past wallet entries and older versions stay unchanged.",
        ]}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { ed.setForm((f) => ({ ...f, buckets: f.buckets.filter((x) => x.uid !== removing!.uid) })); setRemoving(null); }} />
    </div>
  );
}

function TotalBar({ total, accent }: { total: number; accent: string }) {
  const ok = total === 100;
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between text-[12px] font-bold">
        <span className="text-muted-foreground">Total</span>
        <span className={cn("font-mono", ok ? "text-status-converted" : "text-destructive")}>{total}% {ok ? "✓" : `· ${total > 100 ? "over" : "needs"} ${Math.abs(100 - total)}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(total, 100)}%`, background: ok ? accent : "var(--destructive)" }} />
      </div>
    </div>
  );
}

function Preview({ buckets, accent }: { buckets: Bucket[]; accent: string }) {
  const [amt, setAmt] = useState(100000);
  return (
    <aside className="h-fit rounded-xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-4">
      <h3 className="text-[13px] font-bold">Allocation preview</h3>
      <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">Try an installment amount.</p>
      <div className="relative mt-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-muted-foreground">৳</span>
        <Input type="number" min={0} value={amt} onChange={(e) => setAmt(Number(e.target.value) || 0)} className={cn(fieldCls, "pl-7 font-mono")} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {buckets.map((b) => (
          <li key={b.uid} className="flex items-center justify-between gap-2 text-[12.5px] font-semibold">
            <span className="flex min-w-0 items-center gap-2"><span className="size-1.5 rounded-full" style={{ background: b.kind === "free" ? accent : "var(--muted-foreground)" }} /><span className="truncate">{b.label || "Unnamed"}</span></span>
            <span className="font-mono font-bold">৳{Math.round((amt * (Number(b.percent) || 0)) / 100).toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/* ---------- Direct deductions ---------- */

type Rule = { uid: string; label: string; mode: "percent" | "fixed"; value: number };

function DeductionPanel({ c, accent }: { c: Co; accent: string }) {
  const getFn = useServerFn(getCompanyDeductionConfig);
  const saveFn = useServerFn(saveCompanyDeductionConfig);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["company-deductions", c.id], queryFn: () => getFn({ data: { companyId: c.id } }) });
  const toRules = (cfg: any): Rule[] =>
    [...(cfg?.company_deduction_rules ?? [])].sort((a: any, b: any) => a.sort - b.sort)
      .map((r: any) => ({ uid: r.id, label: r.label, mode: r.mode, value: Number(r.value) }));
  const saved = useMemo(() => toRules(q.data?.active), [q.data]);
  const ed = useEditable<{ rules: Rule[]; note: string }>({ rules: saved, note: "" });
  const [removing, setRemoving] = useState<Rule | null>(null);
  const list = ed.value.rules;
  const pct = list.filter((r) => r.mode === "percent").reduce((s, r) => s + (Number(r.value) || 0), 0);
  const invalid = pct > 100 || list.some((r) => !r.label.trim());
  const set = (u: string, patch: Partial<Rule>) => ed.setForm((f) => ({ ...f, rules: f.rules.map((r) => (r.uid === u ? { ...r, ...patch } : r)) }));

  const persist = async (rules: Rule[], note: string, msg: string) => {
    ed.setSaving(true);
    try {
      await saveFn({ data: { companyId: c.id, rules: rules.map((r) => ({ label: r.label.trim(), mode: r.mode, value: Number(r.value) })), note: note.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: ["company-deductions", c.id] });
      ed.done(); toast.success(msg);
    } catch (e) { toast.error((e as Error).message); } finally { ed.setSaving(false); }
  };

  if (q.isLoading) return <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />;
  const versions: Ver[] = (q.data?.history ?? []).map((h: any) => ({
    id: h.id, version: h.version, is_active: h.is_active, note: h.note, created_at: h.created_at,
    count: h.company_deduction_rules?.length ?? 0, summary: `${h.company_deduction_rules?.length ?? 0} rules`,
  }));

  return (
    <div className="max-w-3xl space-y-4">
      <Panel title="Default direct deduction rules" sub="Taken off the received amount before fund allocation (e.g. gateway fee, commission, tax). Each save becomes a new version." icon={Receipt} accent={accent}
        editing={ed.editing} saving={ed.saving} dirty={ed.dirty} invalid={invalid}
        onEdit={ed.edit} onCancel={ed.cancel} onSave={() => persist(ed.form.rules, ed.form.note, "Deduction rules saved as a new version.")}>
        {!list.length && !ed.editing ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-[12.5px] font-semibold text-muted-foreground">No direct deductions. Click Edit to add a rule.</p>
        ) : (
          <SortList items={list} editing={ed.editing} onReorder={(r) => ed.setForm((f) => ({ ...f, rules: r }))} render={(r) => ed.editing ? (
            <>
              <Input value={r.label} onChange={(e) => set(r.uid, { label: e.target.value })} placeholder="e.g. Gateway fee" className={cn(fieldCls, "min-w-0 flex-1")} />
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {(["percent", "fixed"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => set(r.uid, { mode: m })}
                    className={cn("rounded-md px-2.5 py-1 text-[11.5px] font-bold transition-colors", r.mode === m ? "bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground")}>
                    {m === "percent" ? "%" : "৳ Fixed"}
                  </button>
                ))}
              </div>
              <Input type="number" min={0} step="0.5" value={r.value} onChange={(e) => set(r.uid, { value: Number(e.target.value) })} className={cn(fieldCls, "w-24 text-right font-mono")} />
              <RemoveButton onClick={() => setRemoving(r)} />
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{r.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">{r.mode === "percent" ? "Percent" : "Fixed"}</span>
              <span className="w-24 text-right font-mono text-[13px] font-bold">{r.mode === "percent" ? `${r.value}%` : `৳${r.value.toLocaleString("en-IN")}`}</span>
            </>
          )} />
        )}
        {ed.editing && (
          <div className="mt-3 space-y-3">
            <Button size="sm" variant="outline" className="gap-1 text-[12px] font-bold" onClick={() => ed.setForm((f) => ({ ...f, rules: [...f.rules, { uid: uid(), label: "", mode: "percent", value: 0 }] }))}>
              <Plus className="size-3.5" /> Add rule
            </Button>
            {pct > 100 && <p className="text-[12px] font-semibold text-destructive">Percentage rules cannot add up to more than 100%.</p>}
            <Input value={ed.form.note} onChange={(e) => ed.setForm((f) => ({ ...f, note: e.target.value }))} placeholder="What changed? (optional, shown in history)" className={fieldCls} maxLength={300} />
          </div>
        )}
      </Panel>
      <VersionHistory versions={versions} canRestore={!ed.editing} onRestore={(id) => {
        const h = (q.data?.history ?? []).find((x: any) => x.id === id);
        persist(toRules(h), `Restored from v${h?.version}`, `Version ${h?.version} is active again (as a new version).`);
      }} />
      <DangerConfirm open={!!removing} icon={Trash2} title="Remove this deduction?" subject={removing?.label || "Unnamed rule"} confirmLabel="Remove"
        points={[
          "It will no longer be taken off new payments.",
          "More of each payment goes into fund allocation.",
          "Nothing changes until you press Save.",
          "Past payments and older versions stay unchanged.",
        ]}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { ed.setForm((f) => ({ ...f, rules: f.rules.filter((x) => x.uid !== removing!.uid) })); setRemoving(null); }} />
    </div>
  );
}

/* ---------- Code prefixes ---------- */

const PREFIX_META: Record<PrefixKind, { label: string; sample: (p: string) => string }> = {
  lead: { label: "Lead code", sample: (p) => `${p}101` },
  customer: { label: "Customer code", sample: (p) => `${p}042` },
  invoice: { label: "Invoice number", sample: (p) => `${p}0001` },
  expense: { label: "Expense voucher", sample: (p) => `${p}2611-001` },
};

function PrefixPanel({ c, accent }: { c: Co; accent: string }) {
  const saved = useMemo(() => {
    const s = (c.code_prefixes as Prefixes) ?? {};
    return Object.fromEntries(PREFIX_KINDS.map((k) => [k, s[k] ?? ""])) as Record<PrefixKind, string>;
  }, [c.code_prefixes]);
  const ed = useEditable(saved);
  const fn = useServerFn(updateCompanyPrefixes);
  const qc = useQueryClient();
  const p = ed.value;
  const invalid = Object.values(p).some((v) => v && !PREFIX_RE.test(v));
  const save = async () => {
    ed.setSaving(true);
    try {
      const clean = Object.fromEntries(Object.entries(ed.form).filter(([, v]) => v)) as Prefixes;
      await fn({ data: { id: c.id, prefixes: clean } });
      await qc.invalidateQueries({ queryKey: ["company"] });
      ed.done(); toast.success("Code prefixes saved. New records use them from now on.");
    } catch (e) { toast.error((e as Error).message); } finally { ed.setSaving(false); }
  };
  return (
    <div className="max-w-3xl">
      <Panel title="Code prefixes" sub="Only new records get the new prefix — existing codes never change." icon={Hash} accent={accent}
        editing={ed.editing} saving={ed.saving} dirty={ed.dirty} invalid={invalid} onEdit={ed.edit} onCancel={ed.cancel} onSave={save}>
        <div className="grid gap-3 sm:grid-cols-2">
          {PREFIX_KINDS.map((kind) => {
            const meta = PREFIX_META[kind];
            const v = p[kind];
            const eff = v || (c.is_holding ? DEFAULT_PREFIX[kind] : "");
            const bad = !!v && !PREFIX_RE.test(v);
            return (
              <div key={kind} className="rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:border-brand/30">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{meta.label}</div>
                {ed.editing ? (
                  <Input value={v} placeholder={c.is_holding ? DEFAULT_PREFIX[kind] : "e.g. ADL-"} maxLength={6}
                    onChange={(e) => { const x = e.target.value.toUpperCase().replace(/[^A-Z-]/g, ""); ed.setForm((o) => ({ ...o, [kind]: x })); }}
                    onBlur={() => v && !v.endsWith("-") && ed.setForm((o) => ({ ...o, [kind]: `${v}-` }))}
                    className={cn(fieldCls, "mt-1.5 font-mono", bad && "border-destructive")} />
                ) : (
                  <div className="mt-0.5 font-mono text-[13px] font-bold">{v || <span className="font-sans text-muted-foreground">Group default</span>}</div>
                )}
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold">
                  <span className={bad ? "text-destructive" : "text-muted-foreground"}>{bad ? "2–5 capital letters then -" : eff ? "Next looks like" : "Uses the group default"}</span>
                  {eff && !bad && <span className="font-mono font-bold" style={{ color: accent }}>{meta.sample(eff)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
