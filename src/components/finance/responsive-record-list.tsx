import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type RecordField = {
  label: string;
  value: ReactNode;
  /** Show in the collapsed card header area instead of behind "More". */
  primary?: boolean;
};

/**
 * Mobile/tablet card for one table row. Shows a compact summary and folds the
 * remaining fields behind a "More" toggle so nothing is ever cut off.
 */
/** Small mono identifier shown above the card title; tap to copy with feedback. */
export function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    toast.success("Copied", { description: value, duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      title="Tap to copy"
      className={`group inline-flex max-w-full items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[11px] font-semibold transition-all active:scale-95 ${
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-border bg-muted/50 text-muted-foreground hover:border-brand hover:text-brand"
      }`}
    >
      <span className="truncate">{value}</span>
      <span className="relative inline-flex size-3 shrink-0 items-center justify-center">
        <Copy className={`absolute size-3 transition-all duration-200 ${copied ? "scale-50 opacity-0" : "scale-100 opacity-100"}`} />
        <Check className={`absolute size-3 text-emerald-600 transition-all duration-200 ${copied ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} />
      </span>
    </button>
  );
}

export function RecordCard({
  title,
  subtitle,
  amount,
  amountTone,
  badge,
  code,
  fields,
  actions,
}: {
  title: ReactNode;
  /** Identifier (e.g. voucher no) shown above the title; tap to copy. */
  code?: string | null;
  subtitle?: ReactNode;
  amount?: ReactNode;
  amountTone?: "income" | "expense" | "neutral";
  badge?: ReactNode;
  fields?: RecordField[];
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rest = (fields ?? []).filter((f) => !f.primary);
  const primary = (fields ?? []).filter((f) => f.primary);

  return (
    <div className="border-b border-border p-3.5 last:border-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          {code ? (
            <div className="mb-1">
              <CopyableCode value={code} />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-foreground">{title}</span>
            {badge}
          </div>
          {subtitle ? (
            <div className="mt-1 truncate text-[13px] font-medium text-muted-foreground">{subtitle}</div>
          ) : null}
          {primary.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium text-muted-foreground">
              {primary.map((f) => (
                <span key={f.label} className="min-w-0 truncate">
                  {f.label}: <span className="font-semibold text-foreground">{f.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {amount != null && (
            <span
              className={`font-mono text-[15px] font-bold ${
                amountTone === "income"
                  ? "text-emerald-700"
                  : amountTone === "expense"
                    ? "text-rose-700"
                    : "text-foreground"
              }`}
            >
              {amount}
            </span>
          )}
          {actions}
        </div>
      </div>

      {rest.length > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand"
          >
            {open ? "Less" : "More"}
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-sm bg-muted/40 p-3 text-[13px]">
              {rest.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="font-medium text-muted-foreground">{f.label}</dt>
                  <dd className="min-w-0 break-words font-semibold text-foreground">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

/** Overflow menu so row actions are always reachable on narrow screens. */
export function RowActionsMenu({ children, label = "Actions" }: { children: ReactNode; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 rounded-sm p-0" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <div className="flex flex-col gap-1 [&_button]:justify-start [&_label]:justify-start">{children}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
