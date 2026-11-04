import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { SheetContent, SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** One expense drawer surface; outside interactions never discard it. */
export const ExpenseDrawerContent = forwardRef<ElementRef<typeof SheetContent>, ComponentPropsWithoutRef<typeof SheetContent>>(
  ({ className, ...props }, ref) => <SheetContent {...props} ref={ref} side="right"
    className={cn("flex w-full min-w-0 flex-col gap-0 p-0 sm:max-w-2xl", className)}
    onInteractOutside={(event) => event.preventDefault()} />,
);
ExpenseDrawerContent.displayName = "ExpenseDrawerContent";

export function ExpenseDrawerHeader({ className, ...props }: ComponentPropsWithoutRef<typeof SheetHeader>) {
  return <SheetHeader {...props} className={cn("expense-drawer-header border-b border-border px-5 pb-4 pt-5 pr-14 text-left sm:px-6 sm:pr-14", className)} />;
}