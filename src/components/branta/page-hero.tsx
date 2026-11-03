import type { ComponentType, ReactNode } from "react";
import { Check } from "lucide-react";
import { SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string }>;

/** Shared page header used by Companies, Employees and other directory pages. */
export function PageHero({ icon: I, eyebrow, title, subtitle, actions }: { icon: Icon; eyebrow: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300 md:p-8">
      <span className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-brand/10 blur-3xl" />
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-inset ring-brand/20">
            <I className="size-6" />
          </span>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</div>
            <h1 className="mt-0.5 text-[26px] font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Shared drawer header with optional step pills (Create company / Create employee). */
export function DrawerHero({ title, subtitle, aside, children }: { title: string; subtitle?: string; aside?: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative shrink-0 overflow-hidden border-b border-border px-6 pb-5 pt-6 pr-12">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SheetTitle className="text-[18px] font-bold tracking-tight">{title}</SheetTitle>
          {subtitle && <p className="mt-1 text-[12.5px] text-muted-foreground">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function StepPills({ steps, step, isDone, canGo, onGo }: {
  steps: { label: string; icon: Icon }[];
  step: number;
  isDone?: (i: number) => boolean;
  canGo?: (i: number) => boolean;
  onGo: (i: number) => void;
}) {
  return (
    <ol className="relative mt-5 flex items-center gap-2">
      {steps.map((s, i) => {
        const cur = i === step;
        const done = !cur && (isDone ? isDone(i) : i < step);
        const ok = canGo ? canGo(i) : i <= step;
        return (
          <li key={s.label} className="flex flex-1 items-center gap-2 last:flex-none">
            <button
              type="button"
              disabled={!ok}
              onClick={() => onGo(i)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-all duration-300 disabled:cursor-not-allowed",
                cur && "scale-105 border-brand bg-brand text-primary-foreground shadow-md shadow-brand/30",
                done && "border-status-converted/40 bg-status-converted/10 text-status-converted hover:scale-105",
                !cur && !done && "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                <span className={cn("block h-full bg-status-converted transition-all duration-500", done ? "w-full" : "w-0")} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Cloudflare's official mark (Simple Icons, brand orange #F38020). */
export function CloudflareMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Cloudflare" role="img">
      <path fill="#F38020" d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727" />
    </svg>
  );
}
