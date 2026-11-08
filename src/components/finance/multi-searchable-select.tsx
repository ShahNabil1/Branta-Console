import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MultiItem = { value: string; label: string; group?: string | null };

/** Multi-select twin of SearchableSelect: same surface, search, grouped rows and chips. */
export function MultiSearchableSelect({
  items, value, onChange, placeholder = "— Choose —", emptyText = "No results", disabled, className,
}: {
  items: MultiItem[]; value: string[]; onChange: (v: string[]) => void;
  placeholder?: string; emptyText?: string; disabled?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = new Set(value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.label} ${i.group ?? ""}`.toLowerCase().includes(s)) : items;
  }, [items, q]);
  const groups = useMemo(() => {
    const m = new Map<string, MultiItem[]>();
    for (const it of filtered) { const g = it.group ?? ""; m.set(g, [...(m.get(g) ?? []), it]); }
    return [...m.entries()];
  }, [filtered]);
  const toggle = (v: string) => onChange(sel.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const labelOf = (v: string) => items.find((i) => i.value === v)?.label ?? v;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" disabled={disabled}
            className={cn(
              "h-10 w-full justify-between rounded-lg border-border bg-card px-3 text-[13px] font-semibold shadow-sm transition-all hover:border-foreground/25 hover:bg-card data-[state=open]:border-brand data-[state=open]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]",
              !value.length && "text-muted-foreground",
            )}>
            <span className="truncate text-left">{value.length ? `${value.length} selected` : placeholder}</span>
            <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg p-0 shadow-xl">
          <div className="flex items-center border-b border-border px-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input data-dropdown-search value={q} onChange={(e) => setQ(e.target.value)} type="text" enterKeyHint="search"
              autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other"
              aria-label="Search options" placeholder="Type to search…"
              className="h-9 w-full bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {value.length > 0 && (
              <button type="button" onClick={() => onChange([])}
                className="flex w-full items-center gap-2 border-b border-border px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-destructive transition-colors hover:bg-destructive/5">
                <X className="size-3.5" /> Clear all
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">{emptyText}</div>
            ) : groups.map(([g, rows]) => (
              <div key={g || "_"}>
                {g && <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">{g}</div>}
                {rows.map((it) => {
                  const on = sel.has(it.value);
                  return (
                    <button key={it.value} type="button" onClick={() => toggle(it.value)}
                      className={cn("flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-[13px] font-semibold transition-colors hover:bg-muted/70", on && "bg-brand/5")}>
                      <span className={cn("grid size-4 shrink-0 place-items-center rounded border transition-colors", on ? "border-brand bg-brand text-primary-foreground" : "border-border")}>
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-md border border-brand/25 bg-brand/5 py-0.5 pl-2 pr-1 text-[12px] font-semibold text-foreground animate-in fade-in zoom-in-95 duration-150">
              {labelOf(v)}
              <button type="button" aria-label={`Remove ${labelOf(v)}`} onClick={() => toggle(v)} className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
