import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  delta?: string | null;
  positive?: boolean | null;
};

export function KpiTile({ label, value, delta, positive }: Props) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-[var(--shadow-hairline)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[22px] font-medium tracking-tight text-foreground">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "font-mono text-[11px] font-medium",
              positive === true && "text-emerald-600",
              positive === false && "text-rose-600",
              positive == null && "text-brand",
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
