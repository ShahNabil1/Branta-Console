import { useEffect, useRef, useState } from "react";
import { Check, Download, CircleAlert } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { TestLoader } from "@/components/ui/test-loader";
import { cn } from "@/lib/utils";

type DownloadState = "idle" | "pending" | "success" | "failed";

export function ExpenseDownloadButton({ onDownload, downloading = false, resetKey, onPendingChange, className, disabled, variant = "outline", size = "sm", ...props }: Omit<ButtonProps, "onClick" | "children"> & {
  onDownload: () => Promise<void>;
  downloading?: boolean;
  resetKey?: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [state, setState] = useState<DownloadState>("idle");
  const locked = useRef(false);
  const pending = downloading || state === "pending";
  useEffect(() => { setState("idle"); }, [resetKey]);
  useEffect(() => {
    if (state !== "success") return;
    const timer = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [state]);
  const download = async () => {
    if (locked.current || pending) return;
    locked.current = true;
    setState("pending");
    onPendingChange?.(true);
    try { await onDownload(); setState("success"); }
    catch { setState("failed"); }
    finally { locked.current = false; onPendingChange?.(false); }
  };
  return <Button {...props} type="button" variant={variant} size={size}
    className={cn("expense-action h-9 min-w-0 gap-1 px-1.5 font-bold transition-colors disabled:opacity-75", className,
      state === "failed"
        ? "border-destructive bg-destructive text-destructive-foreground hover:border-destructive hover:bg-destructive/90 hover:text-destructive-foreground"
        : state === "success"
          ? "border-status-converted bg-status-converted text-background hover:border-status-converted hover:bg-status-converted/90 hover:text-background"
          : "border-status-converted/20 bg-status-converted/5 text-status-converted hover:border-status-converted/40 hover:bg-status-converted/10 hover:text-status-converted")}
    disabled={disabled || pending} aria-busy={pending} title={state === "failed" ? "Download failed — click to retry" : undefined}
    onClick={() => void download()}>
    {pending ? <TestLoader tone="export" className="size-4" /> : state === "failed" ? <CircleAlert className="size-3.5" /> : state === "success" ? <Check className="size-3.5" /> : <Download className="size-3.5" />}
    <span aria-live="polite">{pending ? "Downloading" : state === "failed" ? "Failed" : state === "success" ? "Downloaded" : "Download"}</span>
  </Button>;
}