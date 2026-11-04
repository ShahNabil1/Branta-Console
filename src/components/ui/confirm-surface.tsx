// The ONE confirmation dialog look for the whole Console.
// Every confirmation (useConfirm, DangerConfirm, Google, offboarding, reason)
// renders through <ConfirmSurface/>, so a visual change here updates all of them.
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TestLoader } from "@/components/ui/test-loader";
import { cn } from "@/lib/utils";

export type ConfirmTone = "danger" | "warning" | "info" | "neutral";

const TONE: Record<
  ConfirmTone,
  {
    bg: string;
    glow: string;
    badge: string;
    dot: string;
    icon: LucideIcon;
    btn: "destructive" | "default";
  }
> = {
  danger: {
    bg: "bg-destructive/5",
    glow: "bg-destructive/25",
    badge: "border-destructive/30 text-destructive",
    dot: "bg-destructive",
    icon: AlertTriangle,
    btn: "destructive",
  },
  warning: {
    bg: "bg-amber-500/5",
    glow: "bg-amber-500/25",
    badge: "border-amber-500/30 text-amber-600",
    dot: "bg-amber-500",
    icon: ShieldAlert,
    btn: "default",
  },
  info: {
    bg: "bg-primary/5",
    glow: "bg-primary/25",
    badge: "border-primary/30 text-primary",
    dot: "bg-primary",
    icon: Info,
    btn: "default",
  },
  neutral: {
    bg: "bg-muted/40",
    glow: "bg-primary/15",
    badge: "border-border text-foreground",
    dot: "bg-primary",
    icon: CheckCircle2,
    btn: "default",
  },
};

export type ConfirmSurfaceProps = {
  open: boolean;
  tone?: ConfirmTone;
  /** Icon component or a custom node (e.g. an <img>). */
  icon?: LucideIcon | React.ReactNode;
  title: React.ReactNode;
  /** Short line under the title (account, record name…). */
  subject?: React.ReactNode;
  /** Longer explanation shown in the body. */
  description?: React.ReactNode;
  /** Consequence bullets; the last one is shown as the "safe" (green) point when safeLast. */
  points?: React.ReactNode[];
  safeLast?: boolean;
  /** Extra body content (checklists, inputs, blockers…). */
  children?: React.ReactNode;
  /** User must type this exact text before confirming. */
  requireTypedText?: string;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  /** Replace the confirm button entirely (custom branded buttons). */
  confirmSlot?: React.ReactNode;
  confirmDisabled?: boolean;
  busy?: boolean;
  hideConfirmIcon?: boolean;
  className?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmSurface({
  open,
  tone = "danger",
  icon,
  title,
  subject,
  description,
  points,
  safeLast = true,
  children,
  requireTypedText,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmSlot,
  confirmDisabled,
  busy,
  hideConfirmIcon,
  className,
  onCancel,
  onConfirm,
}: ConfirmSurfaceProps) {
  const t = TONE[tone];
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const typedOk = !requireTypedText || typed.trim() === requireTypedText;

  const IconComp = asIcon(icon);
  const BtnIcon = IconComp ?? t.icon;
  // A plain description without points renders as a consequence bullet, so every
  // confirmation shares the same bullet-list look.
  if (!points?.length && description) {
    points = [description];
    description = undefined;
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <AlertDialogContent
        className={cn("max-h-[92vh] overflow-hidden overflow-y-auto p-0 sm:max-w-md", className)}
      >
        <ConfirmHeader tone={tone} icon={icon} title={title} subject={subject} />

        {(description || points?.length || children || requireTypedText) && (
          <div className="space-y-3 px-6 py-4">
            {description && (
              <div className="text-[12.5px] leading-relaxed text-muted-foreground">
                {description}
              </div>
            )}
            {!!points?.length && (
              <ul className="space-y-2">
                {points.map((p, i) => (
                  <li
                    key={i}
                    style={{ animationDelay: `${i * 70}ms` }}
                    className="flex items-start gap-2 text-[12.5px] font-semibold text-foreground animate-in fade-in slide-in-from-left-2 fill-mode-both"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        safeLast && points.length > 1 && i === points.length - 1
                          ? "bg-status-converted"
                          : t.dot,
                      )}
                    />
                    <span className="min-w-0">{p}</span>
                  </li>
                ))}
              </ul>
            )}
            {children}
            {requireTypedText && (
              <ConfirmTypedField
                text={requireTypedText}
                value={typed}
                onChange={setTyped}
                disabled={busy}
              />
            )}
          </div>
        )}

        <ConfirmFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          {confirmSlot ?? (
            <Button
              variant={t.btn}
              size="sm"
              onClick={onConfirm}
              disabled={busy || !typedOk || confirmDisabled}
              className="gap-1.5 transition-transform active:scale-95"
            >
              {busy ? (
                <TestLoader className="size-3.5" tone="white" active />
              ) : (
                !hideConfirmIcon && <BtnIcon className="size-3.5" />
              )}
              {confirmLabel ?? (tone === "danger" ? "Delete" : "Confirm")}
            </Button>
          )}
        </ConfirmFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function asIcon(icon: unknown): LucideIcon | null {
  return typeof icon === "function" ||
    (!!icon && typeof icon === "object" && "render" in (icon as object))
    ? (icon as LucideIcon)
    : null;
}

/** Shared tinted header (icon badge + title + subject). Use inside custom dialogs too. */
export function ConfirmHeader({
  tone = "danger",
  icon,
  title,
  subject,
}: {
  tone?: ConfirmTone;
  icon?: LucideIcon | React.ReactNode;
  title: React.ReactNode;
  subject?: React.ReactNode;
}) {
  const t = TONE[tone];
  const IconComp = asIcon(icon);
  const iconNode = IconComp ? (
    <IconComp className="size-5" />
  ) : icon ? (
    (icon as React.ReactNode)
  ) : (
    <t.icon className="size-5" />
  );
  return (
    <div className={cn("relative px-6 pb-4 pt-6", t.bg)}>
      <span
        className={cn(
          "pointer-events-none absolute -right-10 -top-12 size-36 rounded-full blur-3xl",
          t.glow,
        )}
      />
      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl border bg-card shadow-sm animate-in zoom-in-75 duration-300",
            t.badge,
          )}
        >
          {iconNode}
        </span>
        <div className="min-w-0">
          <AlertDialogTitle className="text-[15px] font-bold leading-tight">
            {title}
          </AlertDialogTitle>
          {subject ? (
            <AlertDialogDescription className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-semibold">
              {subject}
            </AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">Confirm this action</AlertDialogDescription>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shared "Type X to confirm" field. */
export function ConfirmTypedField({
  text,
  value,
  onChange,
  disabled,
}: {
  text: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-[11.5px] font-semibold text-muted-foreground">
        Type{" "}
        <span className="rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] font-bold text-foreground">
          {text}
        </span>{" "}
        to confirm.
      </p>
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={text}
        disabled={disabled}
        className="h-9 bg-card font-mono text-[12.5px]"
      />
    </div>
  );
}

/** Shared footer bar. */
export function ConfirmFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
      {children}
    </div>
  );
}
