import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Inbox, Loader2, RefreshCw, Unplug, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { disconnectGoogle, getGoogleConnection, startGoogleConnect, testGoogleConnection } from "@/lib/company-google.functions";
import { cn } from "@/lib/utils";

const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

type Check = { id: string; label: string; ok: boolean; detail: string };

/** Dedicated Gmail + Calendar for one company. Falls back to the shared Inbox Gmail when not connected. */
export function GoogleAccountCard({ slug, accent, fallback }: { slug: string; accent: string; fallback: string }) {
  const get = useServerFn(getGoogleConnection);
  const start = useServerFn(startGoogleConnect);
  const test = useServerFn(testGoogleConnection);
  const disc = useServerFn(disconnectGoogle);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["company-google", slug], queryFn: () => get({ data: { slug } }) });
  const [busy, setBusy] = useState<"connect" | "test" | "disc" | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["company-google", slug] }),
    qc.invalidateQueries({ queryKey: ["company-email", slug] }),
  ]);

  const connect = async () => {
    setBusy("connect");
    try { const { url } = await start({ data: { slug } }); window.location.assign(url); }
    catch (e) { toast.error(err(e)); setBusy(null); }
  };
  const runTest = async () => {
    setBusy("test"); setChecks(null);
    try { const r = await test({ data: { slug } }); setChecks(r.checks); r.ok ? toast.success("Gmail and Calendar are working.") : toast.error(r.checks.find((c) => !c.ok)?.detail ?? "Check failed"); await refresh(); }
    catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  };
  const runDisc = async () => {
    setBusy("disc");
    try { await disc({ data: { slug } }); setChecks(null); setConfirm(false); toast.success("Google account disconnected."); await refresh(); }
    catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  };

  const a = q.data?.account ?? null;
  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-md">
      <span className="pointer-events-none absolute -right-14 -top-16 size-40 rounded-full blur-3xl" style={{ background: a ? "color-mix(in oklab, #34A853 18%, transparent)" : `color-mix(in oklab, ${accent} 12%, transparent)` }} />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg border border-border bg-card shadow-sm"><GoogleMark className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
            Inbox & Calendar Google account
            {a && <span className="inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[11px] font-bold text-status-converted animate-in fade-in zoom-in-90"><CheckCircle2 className="size-3" /> Connected</span>}
          </div>
          <p className="truncate text-[12px] font-semibold text-muted-foreground">
            {q.isLoading ? "Loading…" : a ? <>Mail and meetings use <b className="text-foreground">{a.email}</b></> : <>Not connected — using the shared <b className="text-foreground">{fallback}</b></>}
          </p>
        </div>
        {q.isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : !q.data?.configured ? (
          <span className="text-[12px] font-semibold text-destructive">Google sign-in isn't configured</span>
        ) : a ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={runTest} disabled={!!busy}>{busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Test</Button>
            <Button size="sm" variant="outline" onClick={connect} disabled={!!busy}>Switch account</Button>
            {confirm ? (
              <Button size="sm" variant="destructive" onClick={runDisc} disabled={!!busy}>{busy === "disc" && <Loader2 className="size-3.5 animate-spin" />} Confirm disconnect</Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} disabled={!!busy}><Unplug className="size-3.5" /> Disconnect</Button>
            )}
          </div>
        ) : (
          <Button size="sm" onClick={connect} disabled={!!busy} className="gap-2 border border-border bg-card text-foreground shadow-sm hover:bg-muted">
            {busy === "connect" ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark className="size-4" />} Connect Gmail & Calendar
          </Button>
        )}
      </div>

      {a && (
        <div className="relative mt-3 flex flex-wrap gap-2">
          <Chip ok={a.gmail} icon={Inbox} label="Gmail inbox (read)" />
          <Chip ok={a.calendar} icon={CalendarDays} label="Calendar meetings" />
          {a.last_error && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">{a.last_error}</span>}
        </div>
      )}
      {a && <p className="relative mt-2 text-[11px] font-semibold text-muted-foreground">Route the company address to {a.email} so incoming mail lands here. Then verify the Inbox address below.</p>}

      {checks && (
        <div className="relative mt-3 space-y-1.5 animate-in fade-in slide-in-from-top-1">
          {checks.map((c) => (
            <div key={c.id} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]", c.ok ? "border-status-converted/30 bg-status-converted/5" : "border-destructive/30 bg-destructive/5")}>
              {c.ok ? <CheckCircle2 className="mt-0.5 size-3.5 text-status-converted" /> : <XCircle className="mt-0.5 size-3.5 text-destructive" />}
              <span className="font-bold">{c.label}</span><span className="font-semibold text-muted-foreground">{c.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ ok, icon: Icon, label }: { ok: boolean; icon: typeof Inbox; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", ok ? "bg-status-converted/10 text-status-converted" : "bg-destructive/10 text-destructive")}>
      <Icon className="size-3" /> {label} {ok ? "✓" : "— not granted"}
    </span>
  );
}
