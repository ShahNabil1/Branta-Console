// The ONE Disconnect/Unlink button for the whole Console. Change here = changes everywhere.
import * as React from "react";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TestLoader } from "@/components/ui/test-loader";
import { cn } from "@/lib/utils";

/** Icon shared by every disconnect button and its confirmation dialog. */
export const DisconnectIcon = Unplug;

export function DisconnectButton({
  busy,
  children = "Disconnect",
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size"> & { busy?: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      disabled={busy || props.disabled}
      className={cn("gap-1.5 transition-transform active:scale-95", className)}
      {...props}
    >
      {busy ? <TestLoader className="size-3.5" tone="white" active /> : <DisconnectIcon className="size-3.5" />}
      {children}
    </Button>
  );
}
