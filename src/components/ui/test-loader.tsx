import { cn } from "@/lib/utils";

export type LoaderTone = "test" | "refresh" | "verify" | "export" | "white";

/** Four-dot rotating loader (css-loaders.com l12), scaled to icon size. Pass active={false} to show it frozen. */
export function TestLoader({ className, active = true, tone = "test" }: { className?: string; active?: boolean; tone?: LoaderTone }) {
  return <span aria-hidden="true" className={cn("test-loader inline-grid size-4 shrink-0", `test-loader-${tone}`, !active && "test-loader-paused", className)} />;
}
