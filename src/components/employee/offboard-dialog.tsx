import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  MinusCircle,
  ShieldAlert,
  XCircle,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmHeader, ConfirmTypedField } from "@/components/ui/confirm-surface";
import { TestLoader } from "@/components/ui/test-loader";
import { UserX } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  offboardPreflight,
  offboardStep,
  type StepResult,
} from "@/lib/employee-offboard.functions";
import { cn } from "@/lib/utils";

type StepId = "routing" | "destination" | "sessions" | "account" | "apps";
const STEP_LABELS: Record<StepId, string> = {
  routing: "Delete Cloudflare routing rule",
  destination: "Delete Cloudflare destination address",
  sessions: "Block sign-in & end all sessions",
  account: "Remove from Console",
  apps: "Revoke Branta Tracker & Admakai access",
};
const ORDER: StepId[] = ["routing", "destination", "sessions", "account", "apps"];

export function OffboardDialog({
  userId,
  open,
  onOpenChange,
  onFinished,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onFinished: () => void;
}) {
  const preFn = useServerFn(offboardPreflight);
  const stepFn = useServerFn(offboardStep);
  const pre = useQuery({
    queryKey: ["offboard.pre", userId],
    queryFn: () => preFn({ data: { userId } }),
    enabled: open,
    staleTime: 0,
  });
  const [typed, setTyped] = useState("");
  const [results, setResults] = useState<Partial<Record<StepId, StepResult>>>({});
  const [running, setRunning] = useState<StepId | null>(null);
  const [outcome, setOutcome] = useState<"deleted" | "deactivated" | null>(null);
  const started = Object.keys(results).length > 0 || running !== null;
  const done = ORDER.filter((s) => results[s]).length;
  const pct = Math.round((done / ORDER.length) * 100);
  const failed = ORDER.filter((s) => results[s]?.status === "failed");
  const finished = done === ORDER.length;
  const d = pre.data;
  const confirmText = d?.brantaId ?? d?.email ?? "";

  const run = async (only?: StepId[]) => {
    for (const step of only ?? ORDER) {
      setRunning(step);
      try {
        const r = await stepFn({ data: { userId, step } });
        setResults((p) => ({ ...p, [step]: r }));
        if (r.result) setOutcome(r.result);
        if (step === "account" && r.status === "failed") break; // never revoke apps if the account step failed
      } catch (e) {
        setResults((p) => ({
          ...p,
          [step]: { status: "failed", detail: e instanceof Error ? e.message : String(e) },
        }));
        break;
      }
    }
    setRunning(null);
  };

  const close = (o: boolean) => {
    if (running) return;
    if (!o && outcome) {
      toast.success(
        outcome === "deleted"
          ? `${d?.name} permanently deleted`
          : `${d?.name} deactivated — history kept for audit`,
      );
      onFinished();
    }
    onOpenChange(o);
  };

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent className="max-h-[92vh] overflow-hidden overflow-y-auto p-0 sm:max-w-lg">
        <ConfirmHeader
          tone="danger"
          icon={UserX}
          title={`Remove employee${d ? ` · ${d.name}` : ""}`}
          subject={d?.email ?? "Checking…"}
        />
        <div className="px-6 py-4">
          {pre.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking records, routing and access…
            </div>
          ) : pre.isError ? (
            <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
              {pre.error instanceof Error ? pre.error.message : String(pre.error)}
            </div>
          ) : d ? (
            <div className="space-y-4">
              {d.canHardDelete ? (
                <div className="rounded-sm border border-border bg-muted/40 p-3 text-[13px]">
                  No business history found — the account can be <b>permanently deleted</b>.
                </div>
              ) : (
                <div className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold">
                    <Archive className="size-4" /> Permanent delete is not possible
                  </div>
                  <p className="mb-2">
                    {d.name} appears in company records that must stay for audit. They will be{" "}
                    <b>deactivated</b> instead — all access is still removed.
                  </p>
                  <ul className="space-y-1">
                    {d.blockers.map((b) => (
                      <li key={b.label}>
                        <b className="font-mono">{b.count}</b> {b.label}
                        {b.refs.length > 0 && (
                          <span className="text-[12px] opacity-80">
                            {" "}
                            — {b.refs.join(", ")}
                            {b.count > b.refs.length ? ", …" : ""}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {started && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[12px] text-muted-foreground">
                    <span>
                      {running
                        ? STEP_LABELS[running] + "…"
                        : finished
                          ? failed.length
                            ? "Finished with issues"
                            : "Completed"
                          : "Stopped"}
                    </span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </div>
              )}

              <ul className="space-y-2">
                {ORDER.map((s) => {
                  const r = results[s];
                  const label =
                    s === "account"
                      ? d.canHardDelete
                        ? "Permanently delete account & profile"
                        : "Deactivate (keep history for audit)"
                      : STEP_LABELS[s];
                  return (
                    <li key={s} className="flex gap-2 text-[13px]">
                      <span className="mt-0.5">
                        {running === s ? (
                          <TestLoader className="size-4" active />
                        ) : !r ? (
                          <CircleDashed className="size-4 text-muted-foreground" />
                        ) : r.status === "done" ? (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        ) : r.status === "failed" ? (
                          <XCircle className="size-4 text-destructive" />
                        ) : (
                          <MinusCircle className="size-4 text-sky-600" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">
                          {label}
                          {r?.status === "already" && (
                            <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 text-[10.5px] text-sky-700">
                              Already removed
                            </span>
                          )}
                          {r?.status === "skipped" && (
                            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10.5px] text-muted-foreground">
                              Skipped
                            </span>
                          )}
                        </div>
                        {r && (
                          <div
                            className={cn(
                              "break-words text-[12px]",
                              r.status === "failed" ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {r.detail}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {!started && (
                <div className="space-y-2">
                  <ConfirmTypedField text={confirmText} value={typed} onChange={setTyped} />
                  <button
                    type="button"
                    disabled={typed.trim() !== confirmText}
                    onClick={() => run()}
                    className="h-9 w-full rounded-md bg-destructive text-[13px] font-semibold text-destructive-foreground shadow-sm transition-transform active:scale-[.98] disabled:opacity-50"
                  >
                    <ShieldAlert className="mr-1.5 inline size-4" />
                    {d.canHardDelete ? "Delete permanently" : "Deactivate & revoke all access"}
                  </button>
                </div>
              )}

              {!running && started && failed.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const rest = ORDER.filter(
                      (s) => !results[s] || results[s]?.status === "failed",
                    );
                    setResults((p) => {
                      const n = { ...p };
                      rest.forEach((s) => delete n[s]);
                      return n;
                    });
                    void run(rest);
                  }}
                  className="h-9 w-full rounded-sm border border-border text-[13px] font-semibold hover:bg-muted"
                >
                  Retry failed steps
                </button>
              )}
              {!running && finished && failed.length === 0 && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="h-9 w-full rounded-sm bg-brand text-[13px] font-semibold text-primary-foreground"
                >
                  Done
                </button>
              )}
            </div>
          ) : null}
        </div>
        {!running && (
          <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
            <Button variant="outline" size="sm" onClick={() => close(false)}>
              {finished || outcome ? "Close" : "Cancel"}
            </Button>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
