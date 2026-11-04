import { Button } from "@/components/ui/button";
import gear from "@/assets/integrations/webhook-fix.gif.asset.json";
import still from "@/assets/integrations/webhook-fix-still.png.asset.json";

export function WebhookFixButton({ fixing, disabled, onClick }: { fixing: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" disabled={fixing || disabled} aria-busy={fixing} onClick={onClick}
      className="ml-auto h-7 w-[82px] shrink-0 gap-1.5 px-2 text-[11px] font-bold transition-colors hover:border-primary/40 hover:bg-primary/5">
      <picture className="size-4 shrink-0">
        {fixing && <source media="(prefers-reduced-motion: reduce)" srcSet={still.url} />}
        <img key={fixing ? "running" : "still"} src={fixing ? gear.url : still.url} alt="" className="size-4 object-contain mix-blend-multiply" />
      </picture>
      {fixing ? "Fixing" : "Fix"}
    </Button>
  );
}