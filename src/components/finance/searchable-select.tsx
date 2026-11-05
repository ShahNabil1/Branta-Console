import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SearchableItem = {
  value: string;
  label: string;
  hint?: string | null;
  /** Shown but not selectable. */
  disabled?: boolean;
  /** Secondary line, e.g. job role. */
  sub?: string | null;
  /** Avatar URL; "" shows initials. Undefined = no avatar column. */
  avatar?: string | null;
  /** Extra strings included when matching search input. */
  keywords?: (string | null | undefined)[];
};

interface Props {
  items: SearchableItem[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  emptyText?: string;
  addLabel?: string;
  onAdd?: () => void;
  className?: string;
  disabled?: boolean;
  /** Hide the search box (short fixed lists). */
  searchable?: boolean;
  /** Show a "clear selection" row when a value is chosen. */
  clearable?: boolean;
}

/**
 * Lightweight searchable select. Uses a native input + filtered list so it
 * works without depending on cmdk edge cases and stays keyboard-friendly.
 */
function Avatar({ src, name, size = 22 }: { src?: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return src && !err ? (
    <img src={src} alt="" onError={() => setErr(true)} style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover ring-2 ring-card shadow-sm" />
  ) : (
    <span style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-brand/10 text-[9.5px] font-extrabold text-brand ring-2 ring-card">{ini}</span>
  );
}

export function SearchableSelect({
  items,
  value,
  onChange,
  placeholder = "— Choose —",
  emptyText = "No results",
  addLabel,
  onAdd,
  className,
  disabled,
  searchable = true,
  clearable = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = items.find((i) => i.value === value) ?? null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const bag = [it.label, it.hint, ...(it.keywords ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return bag.includes(s);
    });
  }, [items, q]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between rounded-lg border-border bg-card px-3 text-[13px] font-semibold shadow-sm transition-all hover:border-foreground/25 hover:bg-card data-[state=open]:border-brand data-[state=open]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate text-left">
            {selected?.avatar !== undefined && selected && <Avatar src={selected.avatar} name={selected.label} />}
            {selected ? (
              <>
                {selected.label}
                {selected.hint && (
                  <span className="ml-1.5 text-[11.5px] text-muted-foreground">{selected.hint}</span>
                )}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg p-0 shadow-xl">
        {searchable && <div className="flex items-center border-b border-border px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            data-dropdown-search
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              const first = filtered.find((it) => !it.disabled);
              if (first) { onChange(first.value); setOpen(false); setQ(""); } else e.currentTarget.blur();
            }}
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            aria-label="Search options"
            placeholder="Type to search…"
            className="h-9 w-full bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>}
        <div className="max-h-64 overflow-y-auto py-1">
          {clearable && value && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); setQ(""); }}
              className="flex w-full items-center gap-2 border-b border-border px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-rose-600 transition-colors hover:bg-rose-50">
              <X className="size-3.5" /> Clear selection
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">{emptyText}</div>
          ) : (
            filtered.map((it) => {
              const active = it.value === value;
              return (
                <button
                  key={it.value}
                  type="button"
                  disabled={it.disabled}
                  onClick={() => {
                    if (it.disabled) return;
                    onChange(it.value);
                    setOpen(false);
                    setQ("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-[13px] font-semibold transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
                    active && "bg-brand/5",
                  )}
                >
                  <Check className={cn("size-3.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                  {it.avatar !== undefined && <Avatar src={it.avatar} name={it.label} size={28} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {it.label}
                      {it.hint && <span className="ml-1.5 font-mono text-[11px] font-medium text-muted-foreground">{it.hint}</span>}
                    </span>
                    {it.sub && <span className="block truncate text-[11px] font-medium text-muted-foreground">{it.sub}</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {onAdd && (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => { setOpen(false); setQ(""); onAdd(); }}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[12.5px] text-primary hover:bg-primary/5"
            >
              <Plus className="size-3.5" /> {addLabel ?? "Add new"}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
