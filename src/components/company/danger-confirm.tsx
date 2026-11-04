import type { LucideIcon } from "lucide-react";
import { Undo2, X } from "lucide-react";
import { useState } from "react";
import { ConfirmSurface } from "@/components/ui/confirm-surface";
import { Button } from "@/components/ui/button";

/** Destructive confirmation — thin wrapper over the global ConfirmSurface. */
export function DangerConfirm({ open, icon, title, subject, points, confirmLabel, cancelLabel = "Keep it", busy, requireTypedText, onCancel, onConfirm }: {
  open: boolean; icon: LucideIcon; title: string; subject: string; points: string[]; confirmLabel: string; cancelLabel?: string;
  busy?: boolean; requireTypedText?: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <ConfirmSurface open={open} tone="danger" icon={icon} title={title} subject={subject} points={points}
      confirmLabel={confirmLabel} cancelLabel={cancelLabel} busy={busy} requireTypedText={requireTypedText}
      onCancel={onCancel} onConfirm={onConfirm} />
  );
}

/** Cancel for view/edit forms: asks before discarding real changes, cancels instantly when nothing changed. */
export function DiscardCancelButton({ dirty, disabled, onCancel, className, label = "Cancel" }: {
  dirty: boolean; disabled?: boolean; onCancel: () => void; className?: string; label?: string;
}) {
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" disabled={disabled} className={className ?? "h-7 gap-1 text-[12px] font-bold"}
        onClick={() => (dirty ? setAsk(true) : onCancel())}><X className="size-3.5" /> {label}</Button>
      <DangerConfirm open={ask} icon={Undo2} title="Discard unsaved changes?" subject="Your edits have not been saved yet."
        points={["All changes made since you clicked Edit will be lost.", "The last saved version will be shown again.", "Choose No to keep editing."]}
        confirmLabel="Yes, discard" cancelLabel="No, keep editing"
        onCancel={() => setAsk(false)} onConfirm={() => { setAsk(false); onCancel(); }} />
    </>
  );
}
