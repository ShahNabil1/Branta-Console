import { Button } from "@/components/ui/button";
import { INTEGRATIONS_WEBHOOK_FIX as gear } from "@/lib/brand-assets";
import { INTEGRATIONS_WEBHOOK_FIX_STILL as still } from "@/lib/brand-assets";

export function WebhookFixButton({ fixing, disabled, onClick }: { fixing: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" disabled={fixing || disabled} aria-busy={fixing} onClick={onClick}
      className="ml-auto h-8 w-[96px] shrink-0 gap-2 px-3 text-xs font-bold transition-colors hover:border-primary/40 hover:bg-primary/5">
      <picture className="size-5 shrink-0">
        {fixing && <source media="(prefers-reduced-motion: reduce)" srcSet={still.url} />}
        <img key={fixing ? "running" : "still"} src={fixing ? gear.url : still.url} alt="" className="size-5 object-contain mix-blend-multiply" />
      </picture>
      {fixing ? "Fixing" : "Fix"}
    </Button>
  );
}