import { useEffect, useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { ConfirmSurface } from "@/components/ui/confirm-surface";

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
  const tooShort = reason.trim().length < 5;
  return (
    <ConfirmSurface
      open={open}
      tone={tone === "danger" ? "danger" : "info"}
      icon={tone === "danger" ? AlertTriangle : FileText}
      title={title}
      subject="A written reason is required for the audit log."
      description={description}
      confirmLabel={confirmLabel}
      confirmDisabled={tooShort}
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => onConfirm(reason.trim())}
    >
      <div>
        <label className="block text-[11px] font-semibold uppercase text-muted-foreground">
          Reason <span className="text-destructive">*</span>
        </label>
        <textarea
          autoFocus
          rows={3}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder ?? "Write the reason — it is stored in the activity log."}
          className="mt-1 w-full rounded-md border border-input bg-card px-2.5 py-2 text-[13px] leading-snug outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          {tooShort ? "At least 5 characters required." : `${reason.trim().length} characters`}
        </p>
      </div>
    </ConfirmSurface>
  );
}
