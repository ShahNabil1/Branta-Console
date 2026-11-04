import { cn } from "@/lib/utils";

/** Four-dot rotating loader (css-loaders.com l12), scaled to icon size. Pass active={false} to show it frozen. */
export function TestLoader({ className, active = true }: { className?: string; active?: boolean }) {
  return <span aria-hidden="true" className={cn("test-loader inline-grid size-4 shrink-0", !active && "test-loader-paused", className)} />;
}
