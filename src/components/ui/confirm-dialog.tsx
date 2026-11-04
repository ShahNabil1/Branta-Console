// Global confirmation dialog — mount <ConfirmProvider/> once at the app root,
// then anywhere in the tree call `const confirm = useConfirm()` and
// `await confirm({ title, description, ... })` to get a boolean.
//
// Designed for destructive + neutral confirmations across the whole system.
import * as React from "react";
import { ConfirmSurface, type ConfirmTone } from "@/components/ui/confirm-surface";
import type { LucideIcon } from "lucide-react";

export type { ConfirmTone };

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
  /** Optional header icon (defaults per tone). */
  icon?: LucideIcon | React.ReactNode;
  /** Short line under the title (record name, account…). */
  subject?: React.ReactNode;
  /** Consequence bullets. */
  points?: React.ReactNode[];
};

type Resolver = (value: boolean) => void;

type InternalState = ConfirmOptions & {
  open: boolean;
  pending: boolean;
  typed: string;
};

// Kept on globalThis so a hot reload of this module keeps the same context
// (otherwise pages fail with "useConfirm must be used inside <ConfirmProvider/>").
type ConfirmCtx = React.Context<((options: ConfirmOptions) => Promise<boolean>) | null>;
const g = globalThis as { __brantaConfirmCtx?: ConfirmCtx };
const ConfirmContext: ConfirmCtx = (g.__brantaConfirmCtx ??= React.createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null));

let globalConfirm: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

/** Imperative confirm usable outside hooks (event handlers anywhere). Requires <ConfirmProvider/>. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (!globalConfirm) return Promise.resolve(false);
  return globalConfirm(options);
}

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

  React.useEffect(() => {
    globalConfirm = confirm;
    return () => {
      if (globalConfirm === confirm) globalConfirm = null;
    };
  }, [confirm]);

  const finish = (value: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false, pending: false }));
    r?.(value);
  };

  const handleConfirm = async () => {
    if (state.pending) return;
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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmSurface
        open={state.open}
        tone={state.tone ?? "neutral"}
        icon={state.icon}
        title={state.title}
        subject={state.subject}
        description={state.description}
        points={state.points}
        requireTypedText={state.requireTypedText}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        busy={state.pending}
        onCancel={() => {
          if (!state.pending) finish(false);
        }}
        onConfirm={() => void handleConfirm()}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider/>");
  return ctx;
}
