import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Same look as the Google "Disconnect" confirmation, driven by the caller's data. */
export function DangerConfirm({ open, icon: Icon, title, subject, points, confirmLabel, busy, onCancel, onConfirm }: {
  open: boolean; icon: LucideIcon; title: string; subject: string; points: string[]; confirmLabel: string;
  busy?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <AlertDialogContent className="overflow-hidden p-0 sm:max-w-md">
        <div className="relative bg-destructive/5 px-6 pb-4 pt-6">
          <span className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-destructive/25 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-destructive/30 bg-card text-destructive shadow-sm animate-in zoom-in-75 duration-300">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle className="text-[15px] font-bold">{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-0.5 truncate text-[12px] font-semibold">{subject}</AlertDialogDescription>
            </div>
          </div>
        </div>
        <ul className="space-y-2 px-6 py-4">
          {points.map((t, i) => (
            <li key={t} style={{ animationDelay: `${i * 70}ms` }} className="flex items-start gap-2 text-[12.5px] font-semibold text-foreground animate-in fade-in slide-in-from-left-2 fill-mode-both">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${i === points.length - 1 ? "bg-status-converted" : "bg-destructive"}`} />
              {t}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Keep it</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />} {confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
