import { forwardRef, useCallback, useRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { SheetContent, SheetHeader } from "@/components/ui/sheet";
import { attachDrawerFields, drawerFields, focusNextField } from "@/components/finance/drawer-fields";
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

export function ExpenseDrawerHeader({ className, ...props }: ComponentPropsWithoutRef<typeof SheetHeader>) {
  return <SheetHeader {...props} className={cn("expense-drawer-header border-b border-border px-5 pb-4 pt-5 pr-14 text-left sm:px-6 sm:pr-14", className)} />;
}
