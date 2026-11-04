// Shared Console tab strip (company-profile style): bold dark labels, a sliding
// accent underline that springs between tabs, and instant switching.
// Every tab/filter strip should use this so one change updates all of them.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type UnderlineTabItem<T extends string> = {
  id: T;
  label: ReactNode;
  icon?: LucideIcon;
  /** Small leading element, e.g. a status dot. */
  lead?: ReactNode;
  count?: number;
  /** Render as a router link instead of a button. */
  to?: string;
};

export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  accent,
  className,
  size = "md",
  stretch = false,
  ariaLabel,
}: {
  items: readonly UnderlineTabItem<T>[];
  value: T;
  onChange?: (id: T) => void;
  /** CSS colour for the underline/active icon. Defaults to brand. */
  accent?: string;
  className?: string;
  size?: "sm" | "md";
  stretch?: boolean;
  ariaLabel?: string;
}) {
  const navRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(value)}"]`);
      if (!el) return;
      setBar((b) => ({
        left: el.offsetLeft + 8,
        width: Math.max(0, el.offsetWidth - 16),
        ready: b.width > 0,
      }));
      // Scroll only the strip horizontally — never the page.
      const l = el.offsetLeft, r = l + el.offsetWidth;
      if (l < nav.scrollLeft) nav.scrollTo({ left: l - 8, behavior: "smooth" });
      else if (r > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: r - nav.clientWidth + 8, behavior: "smooth" });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [value, items.length]);

  const color = accent ?? "var(--color-brand)";
  return (
    <div
      ref={navRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((t) => {
        const on = t.id === value;
        const Icon = t.icon;
        const cls = cn(
          "group relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 rounded-t-md font-bold outline-none transition-[color,background-color,transform] duration-150 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-brand/40",
          size === "sm" ? "px-2.5 py-2 text-[12px]" : "px-3 py-2.5 text-[12.5px]",
          stretch && "flex-1",
          on ? "text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        );
        const inner = (
          <>
            {Icon && (
              <Icon
                className="size-3.5 transition-transform duration-200 group-hover:scale-110"
                style={on ? { color } : undefined}
              />
            )}
            {t.lead}
            <span className="whitespace-nowrap">{t.label}</span>
            {t.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-[10.5px] tabular-nums transition-colors",
                  on ? "bg-foreground/90 text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            )}
          </>
        );
        return t.to ? (
          <Link
            key={t.id}
            to={t.to}
            data-tab-id={t.id}
            role="tab"
            aria-selected={on}
            className={cls}
            onClick={() => onChange?.(t.id)}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={t.id}
            type="button"
            data-tab-id={t.id}
            role="tab"
            aria-selected={on}
            className={cls}
            onClick={() => onChange?.(t.id)}
          >
            {inner}
          </button>
        );
      })}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-0 h-0.5 rounded-full",
          bar.ready && "transition-[left,width] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        )}
        style={{ left: bar.left, width: bar.width, background: color }}
      />
    </div>
  );
}
