import { forwardRef, useCallback, useRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { SheetContent, SheetHeader } from "@/components/ui/sheet";
import { attachDrawerFields, drawerFields, focusNextField } from "@/components/finance/drawer-fields";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One expense drawer surface; outside interactions never discard it.
 * Opening never pops the mobile keyboard (desktop focuses [data-drawer-autofocus]),
 * fields never show browser autofill and the keyboard's Next key moves field to field.
 */
export const ExpenseDrawerContent = forwardRef<ElementRef<typeof SheetContent>, ComponentPropsWithoutRef<typeof SheetContent>>(
  ({ className, onOpenAutoFocus, onKeyDown, ...props }, ref) => {
    const cleanup = useRef<(() => void) | null>(null);
    const setRef = useCallback((node: HTMLDivElement | null) => {
      cleanup.current?.();
      cleanup.current = node ? attachDrawerFields(node) : null;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }, [ref]);
    return <SheetContent {...props} ref={setRef} side="right"
      className={cn("flex w-full min-w-0 flex-col gap-0 p-0 sm:max-w-2xl", className)}
      onInteractOutside={(event) => event.preventDefault()}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        const root = event.currentTarget as HTMLElement;
        const coarse = window.matchMedia("(any-pointer: coarse)").matches;
        const target = !coarse ? root.querySelector<HTMLElement>("[data-drawer-autofocus]") : null;
        (target ?? root).focus({ preventScroll: true });
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        const t = e.target;
        if (e.defaultPrevented || e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey) return;
        if (!(t instanceof HTMLInputElement)) return;
        if (!drawerFields(e.currentTarget).includes(t)) return;
        e.preventDefault();
        focusNextField(e.currentTarget, t);
      }} />;
  },
);
ExpenseDrawerContent.displayName = "ExpenseDrawerContent";

/** Step strip shared by every step-by-step drawer (Add Expense, New Task). */
export function DrawerStepper({ steps, step, onStep }: { steps: readonly { label: string }[]; step: number; onStep: (i: number) => void }) {
  return (
    <ol className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((st, i) => {
        const done = i < step, on = i === step;
        return (
          <li key={st.label}>
            <button type="button" onClick={() => onStep(i)} className="group w-full text-left">
              <span className="relative block h-1 overflow-hidden rounded-full bg-muted">
                <span className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: done || on ? "100%" : "0%" }} />
              </span>
              <span className={cn("mt-2 flex items-center gap-1.5 text-[12px] font-bold transition-colors", on ? "text-foreground" : done ? "text-brand" : "text-muted-foreground group-hover:text-foreground")}>
                <span className={cn("grid size-5 place-items-center rounded-full text-[10.5px] transition-all duration-300", done ? "bg-brand text-white" : on ? "bg-foreground text-background scale-110" : "bg-muted text-muted-foreground")}>
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {st.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function ExpenseDrawerHeader({ className, ...props }: ComponentPropsWithoutRef<typeof SheetHeader>) {
  return <SheetHeader {...props} className={cn("expense-drawer-header border-b border-border px-5 pb-4 pt-5 pr-14 text-left sm:px-6 sm:pr-14", className)} />;
}
