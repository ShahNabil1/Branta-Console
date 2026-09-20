import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * Mandatory-reason modal. Used before editing or deleting an expense so every
 * change in the audit trail carries a written justification.
 */
export function ReasonDialog({
  open,
  title,
  description,
  placeholder,
  confirmLabel = "Confirm",
  tone = "danger",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  confirmLabel?: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  if (!open) return null;
  const tooShort = reason.trim().length < 5;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-background/80 p-3">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start gap-2">
          {tone === "danger" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />}
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold">{title}</h3>
            {description && (
              <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <label className="mt-4 block text-[11px] font-semibold uppercase text-muted-foreground">
          Reason <span className="text-rose-600">*</span>
        </label>
        <textarea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder ?? "Write the reason — it is stored in the activity log."}
          className="mt-1 w-full rounded-sm border border-input bg-background px-2 py-1.5 text-[13px] leading-snug"
        />
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          {tooShort ? "At least 5 characters required." : `${reason.trim().length} characters`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="h-9 rounded-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            className={`h-9 rounded-sm ${tone === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-primary hover:bg-brand-700"}`}
            disabled={tooShort || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
