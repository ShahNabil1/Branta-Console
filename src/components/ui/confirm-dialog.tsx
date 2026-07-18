// Global confirmation dialog — mount <ConfirmProvider/> once at the app root,
// then anywhere in the tree call `const confirm = useConfirm()` and
// `await confirm({ title, description, ... })` to get a boolean.
//
// Designed for destructive + neutral confirmations across the whole system.
import * as React from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ConfirmTone = "danger" | "warning" | "info" | "neutral";

export type ConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary button label. Defaults to "Confirm" (or "Delete" for tone=danger). */
  confirmLabel?: React.ReactNode;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: React.ReactNode;
  /** Visual tone — controls icon + primary button color. */
  tone?: ConfirmTone;
  /**
   * If set, the user must type this exact string before the confirm button
   * activates. Use for high-risk deletes (e.g. the record's slug).
   */
  requireTypedText?: string;
  /**
   * If provided, runs when the user confirms. The dialog shows a spinner
   * on the confirm button until the promise resolves, then closes.
   * If the promise rejects, the dialog stays open and rethrows to the caller.
   */
  onConfirm?: () => void | Promise<void>;
};

type Resolver = (value: boolean) => void;

type InternalState = ConfirmOptions & {
  open: boolean;
  pending: boolean;
  typed: string;
};

const ConfirmContext = React.createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

const toneStyles: Record<ConfirmTone, { icon: React.ReactNode; btn: string }> = {
  danger: {
    icon: <AlertTriangle className="size-5 text-red-600" />,
    btn: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
  },
  warning: {
    icon: <AlertTriangle className="size-5 text-amber-600" />,
    btn: "bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-600",
  },
  info: {
    icon: <Info className="size-5 text-primary" />,
    btn: "bg-primary text-primary-foreground hover:bg-brand-700 focus-visible:ring-primary",
  },
  neutral: {
    icon: null,
    btn: "bg-primary text-primary-foreground hover:bg-brand-700 focus-visible:ring-primary",
  },
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<InternalState>({
    open: false,
    pending: false,
    typed: "",
    title: "",
  });
  const resolverRef = React.useRef<Resolver | null>(null);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        ...options,
        open: true,
        pending: false,
        typed: "",
      });
    });
  }, []);

  const finish = (value: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false, pending: false }));
    r?.(value);
  };

  const handleConfirm = async () => {
    if (state.onConfirm) {
      setState((s) => ({ ...s, pending: true }));
      try {
        await state.onConfirm();
        finish(true);
      } catch (err) {
        setState((s) => ({ ...s, pending: false }));
        throw err;
      }
    } else {
      finish(true);
    }
  };

  const tone: ConfirmTone = state.tone ?? "neutral";
  const styles = toneStyles[tone];
  const requiresTyping =
    !!state.requireTypedText && state.requireTypedText.length > 0;
  const typedOk =
    !requiresTyping || state.typed.trim() === state.requireTypedText;
  const defaultConfirm = tone === "danger" ? "Delete" : "Confirm";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={state.open}
        onOpenChange={(o) => {
          if (!o && !state.pending) finish(false);
        }}
      >
        <AlertDialogContent className="rounded-md border-border p-0 sm:max-w-md">
          <AlertDialogHeader className="gap-2 border-b border-border px-5 pb-3 pt-4 text-left">
            <div className="flex items-start gap-3">
              {styles.icon && <div className="mt-0.5 shrink-0">{styles.icon}</div>}
              <div className="min-w-0 flex-1 space-y-1.5">
                <AlertDialogTitle className="text-[14px] font-semibold leading-tight text-foreground">
                  {state.title}
                </AlertDialogTitle>
                {state.description && (
                  <AlertDialogDescription className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {state.description}
                  </AlertDialogDescription>
                )}
              </div>
            </div>
          </AlertDialogHeader>

          {requiresTyping && (
            <div className="space-y-2 px-5 py-4">
              <p className="text-[11.5px] text-muted-foreground">
                Type{" "}
                <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                  {state.requireTypedText}
                </span>{" "}
                to confirm.
              </p>
              <Input
                autoFocus
                value={state.typed}
                onChange={(e) =>
                  setState((s) => ({ ...s, typed: e.target.value }))
                }
                className="h-9 rounded-sm text-[12.5px]"
                placeholder={state.requireTypedText}
              />
            </div>
          )}

          <AlertDialogFooter className="gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <AlertDialogCancel
              disabled={state.pending}
              className="h-8 rounded-sm text-[12px]"
            >
              {state.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={state.pending || !typedOk}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              className={cn(
                "h-8 rounded-sm text-[12px] font-semibold",
                styles.btn,
              )}
            >
              {state.pending && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              {state.confirmLabel ?? defaultConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx)
    throw new Error("useConfirm must be used inside <ConfirmProvider/>");
  return ctx;
}
