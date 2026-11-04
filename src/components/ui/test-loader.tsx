import { cn } from "@/lib/utils";

/** Four-dot rotating loader (css-loaders.com l12), scaled to icon size. */
export function TestLoader({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("test-loader inline-grid size-3.5 shrink-0", className)} />;
}
