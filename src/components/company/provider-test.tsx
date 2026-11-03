import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProviderTestStatus, sendProviderTest } from "@/lib/company-email.functions";
import { cn } from "@/lib/utils";

export function ProviderTest({ slug, provider, sender }: { slug: string; provider: "resend" | "brevo"; sender: string }) {
  const send = useServerFn(sendProviderTest);
  const status = useServerFn(getProviderTestStatus);
  const [run, setRun] = useState<{ testId: string; to: string; startedAt: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchUntil, setWatchUntil] = useState(0);
  const q = useQuery({
    queryKey: ["company-email-test", slug, provider, run?.testId],
    queryFn: () => {
      if (!run) throw new Error("No test selected");
      return status({ data: { slug, provider, testId: run.testId } });
    },
    enabled: !!run,
    refetchInterval: () => Date.now() < watchUntil ? 2000 : false,
    retry: false,
  });
  const start = async () => {
    setSending(true); setError(null); setRun(null);
    try {
      const r = await send({ data: { slug, provider } });
      setWatchUntil(Date.now() + 5 * 60_000);
      setRun({ testId: r.testId, to: r.to, startedAt: Date.now() });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send test email."); }
    finally { setSending(false); }
  };
  const data = q.data;
  const percent = sending ? 0 : data?.percent ?? (run ? 30 : 0);
  const failed = !!error || !!data?.failed || !!data?.sendError;
  const watching = !!run && Date.now() < watchUntil;
  const label = sending ? "Sending request…" : failed ? "Delivery issue" : data?.delivered ? "Delivery confirmed" : run ? watching ? "Waiting for delivery webhook…" : "Delivery not confirmed yet" : "";
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-4">
      <h3 className="flex items-center gap-2 text-[13px] font-bold"><Send className="size-4 text-brand" /> Send a test email</h3>
      <p className="break-words text-[12px] font-semibold text-muted-foreground">From {sender}{run ? ` to ${run.to}` : " to your account email"}</p>
      <Button size="sm" disabled={sending} onClick={() => void start()}><Send className="size-3.5" />{run ? "Send another test" : "Send test"}</Button>
      {(sending || run || error) && <div className="space-y-3" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-[12px] font-semibold">
          <span className={cn("flex items-center gap-1.5", failed ? "text-destructive" : data?.delivered ? "text-status-converted" : "text-muted-foreground")}>
            {failed ? <XCircle className="size-3.5" /> : data?.delivered ? <CheckCircle2 className="size-3.5" /> : <Loader2 className={cn("size-3.5", (sending || watching) && "animate-spin motion-reduce:animate-none")} />}{label}
          </span>
          <span className="shrink-0 font-mono">{percent}%</span>
        </div>
        <div role="progressbar" aria-label="Test email delivery" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full transition-[width] duration-300 motion-reduce:transition-none", failed ? "bg-destructive" : data?.delivered ? "bg-status-converted" : "bg-primary")} style={{ width: `${percent}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold">
          {[{ label: "Accepted", done: !!run }, { label: "Webhook received", done: !!data?.events.length }, { label: "Delivered", done: !!data?.delivered }].map((step) => <span key={step.label} className={cn("flex items-start gap-1", step.done ? "text-status-converted" : "text-muted-foreground")}><CheckCircle2 className={cn("mt-0.5 size-3 shrink-0", !step.done && "opacity-30")} />{step.label}</span>)}
        </div>
        {(error || q.error || data?.sendError) && <p role="alert" className="text-[12px] text-destructive">{error ?? data?.sendError ?? (q.error instanceof Error ? q.error.message : "Tracking unavailable")}</p>}
        {run && <>
          {data?.messageId && <div className="break-all font-mono text-[10.5px] text-muted-foreground">Message ID: {data.messageId}</div>}
          <div className="flex items-center justify-between text-[12px] font-semibold"><span>Webhook events <span className="font-mono text-muted-foreground">({data?.events.length ?? 0})</span></span><Button size="icon" variant="ghost" aria-label="Refresh delivery events" onClick={() => { setWatchUntil(Date.now() + 5 * 60_000); void q.refetch(); }}><RefreshCw className={cn("size-3.5", q.isFetching && "animate-spin")} /></Button></div>
          {data?.events.length ? <ol className="max-h-80 space-y-2 overflow-y-auto">
            {data.events.map((event) => <li key={event.id} className="border-l-2 border-border pl-3">
              <div className="flex flex-wrap justify-between gap-1 text-[12px]"><b>{event.event}</b><time className="font-mono text-[10px] text-muted-foreground" dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time></div>
              <dl className="mt-1 space-y-1 text-[11px] text-muted-foreground">{Object.entries(event.details).map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(70px,0.3fr)_minmax(0,1fr)] gap-2"><dt>{key.replace(/_/g, " ")}</dt><dd className="break-all">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>
            </li>)}
          </ol> : <p className="text-[11.5px] text-muted-foreground">No webhook event received yet.</p>}
        </>}
      </div>}
    </div>
  );
}