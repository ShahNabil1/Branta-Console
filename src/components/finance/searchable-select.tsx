import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SearchableItem = {
  value: string;
  label: string;
  hint?: string | null;
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
}

/**
 * Lightweight searchable select. Uses a native input + filtered list so it
 * works without depending on cmdk edge cases and stays keyboard-friendly.
 */
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
            "h-9 w-full justify-between rounded-sm border-input px-2 text-[13px] font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-left">
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
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] rounded-sm p-0">
        <div className="flex items-center border-b border-border px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone, slug…"
            className="h-9 w-full bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">{emptyText}</div>
          ) : (
            filtered.map((it) => {
              const active = it.value === value;
              return (
                <button
                  key={it.value}
                  type="button"
                  onClick={() => {
                    onChange(it.value);
                    setOpen(false);
                    setQ("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-muted/70",
                    active && "bg-muted",
                  )}
                >
                  <Check className={cn("size-3.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                  <span className="flex-1 truncate">
                    {it.label}
                    {it.hint && <span className="ml-1.5 text-[11.5px] text-muted-foreground">{it.hint}</span>}
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
