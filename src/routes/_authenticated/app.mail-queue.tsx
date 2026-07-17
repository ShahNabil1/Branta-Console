// Phase 5 — Failure management dashboard for Resend sends.
// Shows queue metrics, lists every failed email across leads, and lets you
// retry individually or in bulk. Realtime subscription keeps it fresh.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Mail,
  RefreshCw,
  RotateCw,
  Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  drainEmailQueue,
  getQueueMetrics,
  listFailedEmails,
  retryAllFailed,
  retryFailedEmail,
  type FailedEmailRow,
  type QueueMetrics,
} from "@/lib/lead-email.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/mail-queue")({
  ssr: false,
  component: MailQueuePage,
});

function relTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Metric({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warn" | "info" | "danger" | "ok";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneCls: Record<typeof tone, string> = {
    neutral: "text-foreground",
    warn: "text-amber-700",
    info: "text-blue-700",
    danger: "text-red-700",
    ok: "text-emerald-700",
  };
  return (
    <div className="grid gap-1 rounded-sm border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className={cn("font-mono text-[22px] font-semibold tabular-nums", toneCls[tone])}>
        {value}
      </div>
    </div>
  );
}

function MailQueuePage() {
  const qc = useQueryClient();
  const metricsFn = useServerFn(getQueueMetrics);
  const listFn = useServerFn(listFailedEmails);
  const retryFn = useServerFn(retryFailedEmail);
  const retryAllFn = useServerFn(retryAllFailed);
  const drainFn = useServerFn(drainEmailQueue);

  const metrics = useQuery<QueueMetrics>({
    queryKey: ["mail-queue", "metrics"],
    queryFn: () => metricsFn(),
    refetchInterval: 5_000,
  });
  const failed = useQuery<FailedEmailRow[]>({
    queryKey: ["mail-queue", "failed"],
    queryFn: () => listFn(),
    refetchInterval: 10_000,
  });

  // Realtime: any lead_emails change refreshes both queries.
  useEffect(() => {
    const ch = supabase
      .channel("mail-queue-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_emails" },
        () => {
          qc.invalidateQueries({ queryKey: ["mail-queue"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Drain pump whenever anything is queued/sending.
  const hasWork = (metrics.data?.queued ?? 0) + (metrics.data?.sending ?? 0) > 0;
  useEffect(() => {
    if (!hasWork) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await drainFn();
      } catch {
        /* ignore */
      }
      if (!cancelled) qc.invalidateQueries({ queryKey: ["mail-queue"] });
    };
    const iv = setInterval(tick, 3000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [hasWork, drainFn, qc]);

  const retryOne = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Requeued");
      qc.invalidateQueries({ queryKey: ["mail-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry failed"),
  });

  const retryAll = useMutation({
    mutationFn: () => retryAllFn({ data: {} }),
    onSuccess: (r) => {
      toast.success(`Requeued ${r.retried} email${r.retried === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["mail-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry failed"),
  });

  const rows = failed.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Mail queue
          </h1>
          <p className="text-[12.5px] text-muted-foreground">
            Live status of Resend sends across every lead. Failures land here for one-click retry.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-sm text-[12px]"
          onClick={() => qc.invalidateQueries({ queryKey: ["mail-queue"] })}
        >
          <RefreshCw className="mr-1.5 size-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="In queue" value={metrics.data?.queued ?? 0} tone="warn" icon={Mail} />
        <Metric label="Sending" value={metrics.data?.sending ?? 0} tone="info" icon={Send} />
        <Metric label="Failed" value={metrics.data?.failed ?? 0} tone="danger" icon={AlertTriangle} />
        <Metric label="Sent today" value={metrics.data?.sentToday ?? 0} tone="ok" icon={Send} />
      </div>

      <section className="rounded-sm border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <AlertTriangle className="size-3.5 text-red-600" />
            Failed ({rows.length})
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm text-[12px]"
            disabled={rows.length === 0 || retryAll.isPending}
            onClick={() => retryAll.mutate()}
          >
            {retryAll.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <RotateCw className="mr-1.5 size-3.5" />
            )}
            Retry all
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {failed.isLoading && (
            <li className="p-4 text-[12px] text-muted-foreground">Loading…</li>
          )}
          {!failed.isLoading && rows.length === 0 && (
            <li className="p-6 text-center text-[12.5px] text-muted-foreground">
              No failures. 🎉
            </li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="grid gap-1 p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {r.lead_slug && (
                  <Link
                    to="/app/leads/$slug"
                    params={{ slug: r.lead_slug }}
                    className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-widest hover:bg-primary/10 hover:text-primary"
                  >
                    {r.lead_slug}
                  </Link>
                )}
                <span className="font-medium text-foreground">{r.lead_name ?? "—"}</span>
                <span>·</span>
                <span className="font-mono">{relTime(r.sent_at ?? r.created_at)}</span>
                {r.sent_by_name && (
                  <>
                    <span>·</span>
                    <span>by {r.sent_by_name}</span>
                  </>
                )}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 grow">
                  <div className="truncate text-[12.5px] font-medium text-foreground">
                    {r.subject || "(no subject)"}
                  </div>
                  <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                    → {r.to_emails.join(", ")}
                  </div>
                  {r.error_message && (
                    <div className="mt-1 rounded-sm bg-red-50 px-2 py-1 text-[11.5px] text-red-700">
                      {r.error_message}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  className="h-8 shrink-0 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
                  disabled={retryOne.isPending && retryOne.variables === r.id}
                  onClick={() => retryOne.mutate(r.id)}
                >
                  {retryOne.isPending && retryOne.variables === r.id ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="mr-1.5 size-3.5" />
                  )}
                  Retry
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
