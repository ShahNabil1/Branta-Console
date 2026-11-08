import { useState } from "react";
import { ClipboardList, FolderPlus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { mergeCatalog, parseBulk, type ServiceCategory } from "@/lib/service-catalog";

const norm = (s: string) => s.trim().toLowerCase();
export const catalogValid = (c: ServiceCategory[]) =>
  c.every((g) => g.category.trim()) && new Set(c.map((g) => norm(g.category))).size === c.length;

/** Category → services editor with bulk paste. */
export function CatalogEditor({ value, onChange }: { value: ServiceCategory[]; onChange: (c: ServiceCategory[]) => void }) {
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(value.length === 0);
  const parsed = parseBulk(bulk);
  const count = parsed.reduce((n, g) => n + g.services.length, 0);
  const upd = (i: number, g: ServiceCategory) => onChange(value.map((x, j) => (j === i ? g : x)));

  return (
    <div className="space-y-3">
      {value.map((g, i) => (
        <CategoryCard key={i} g={g} dup={value.some((x, j) => j !== i && norm(x.category) === norm(g.category))}
          onChange={(n) => upd(i, n)} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { category: "", services: [] }])}
          className="h-9 gap-1.5 border-dashed text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-95">
          <FolderPlus className="size-3.5" /> Add category
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowBulk((v) => !v)}
          className={cn("h-9 gap-1.5 text-[12px] font-bold active:scale-95", showBulk && "border-brand/50 text-brand")}>
          <ClipboardList className="size-3.5" /> Bulk add
        </Button>
      </div>

      {showBulk && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-[11.5px] text-muted-foreground">
            Write a category ending with <b>:</b>, then one service per line. Numbers or dashes are removed automatically.
          </p>
          <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={8} spellCheck={false}
            placeholder={"Video ads:\n1. Commercial, 30s\n2. AI Commercial, 60s\n3. AI UGC Ads\n\nWeb:\nLanding page"}
            className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-[12.5px] leading-relaxed shadow-sm outline-none transition-all focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              {count ? `${parsed.length} ${parsed.length === 1 ? "category" : "categories"} · ${count} services` : "Nothing to add yet"}
            </span>
            <Button type="button" size="sm" disabled={!count} onClick={() => { onChange(mergeCatalog(value, parsed)); setBulk(""); setShowBulk(false); }}
              className="h-8 gap-1 text-[12px] font-bold active:scale-95">
              <Plus className="size-3.5" /> Add all
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryCard({ g, dup, onChange, onRemove }: { g: ServiceCategory; dup: boolean; onChange: (g: ServiceCategory) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState("");
  const exists = (v: string) => g.services.some((s) => norm(s) === norm(v));
  const add = () => {
    const items = draft.split(/\r?\n/).map((s) => s.replace(/^(\d+[.)]\s*|[-•*]\s*)/, "").trim()).filter(Boolean);
    const next = [...g.services];
    for (const s of items) if (!next.some((x) => norm(x) === norm(s))) next.push(s);
    onChange({ ...g, services: next });
    setDraft("");
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Input value={g.category} maxLength={80} placeholder="Category name, e.g. Video ads" onChange={(e) => onChange({ ...g, category: e.target.value })}
          className={cn("h-9 min-w-0 flex-1 font-bold", (!g.category.trim() || dup) && "border-destructive")} />
        <span className="shrink-0 font-mono text-[11px] font-bold text-muted-foreground">{g.services.length}</span>
        <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${g.category || "category"}`} onClick={onRemove}
          className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {dup && <p className="mt-1 text-[11.5px] text-destructive">This category already exists.</p>}
      {g.services.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {g.services.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 py-0.5 pl-2 pr-1 text-[12px] font-semibold">
              {s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange({ ...g, services: g.services.filter((x) => x !== s) })}
                className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-start gap-2">
        <textarea value={draft} rows={1} placeholder="Add services — paste several, one per line"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !draft.includes("\n")) { e.preventDefault(); add(); } }}
          className={cn("min-h-9 min-w-0 flex-1 resize-y rounded-md border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-brand", draft && !draft.includes("\n") && exists(draft.trim()) && "border-destructive")} />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!draft.trim()}
          className="h-9 gap-1 border-dashed text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-95">
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}
