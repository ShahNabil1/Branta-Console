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

/** Cloudflare's official cloud mark. */
export function CloudflareMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 30" className={className} aria-label="Cloudflare" role="img">
      <path fill="#F38020" d="M43.6 28.6l.6-2c.7-2.4.4-4.6-.8-6.2-1.1-1.5-2.9-2.3-5.1-2.4l-21.6-.3c-.1 0-.3-.1-.3-.2-.1-.1-.1-.2 0-.4.1-.2.2-.3.4-.3l21.8-.3c2.6-.1 5.4-2.2 6.4-4.8l1.2-3.3c.1-.1.1-.3 0-.4C44.8 3.5 39.9 0 34.2 0 28.9 0 24.4 3.4 22.8 8.2c-1-.8-2.4-1.2-3.8-1.1-2.6.3-4.7 2.4-4.9 5-.1.7 0 1.3.1 2C10.1 14.2 6.8 17.6 6.8 21.8c0 .4 0 .8.1 1.2 0 .2.2.3.4.3h35.6c.2 0 .4-.1.4-.3z" />
      <path fill="#FAAD3F" d="M50.1 14.4h-.5c-.1 0-.2.1-.3.2l-.8 2.6c-.7 2.4-.4 4.6.8 6.2 1.1 1.5 2.9 2.3 5.1 2.4l4.6.3c.1 0 .3.1.3.2.1.1.1.2 0 .4-.1.2-.2.3-.4.3l-4.8.3c-2.6.1-5.4 2.2-6.4 4.8l-.3.9c-.1.2.1.4.3.4h16.5c.2 0 .4-.1.4-.3.3-1 .4-2.1.4-3.2 0-6.5-5.3-11.8-11.8-11.8" transform="translate(-6 -3)" />
    </svg>
  );
}
