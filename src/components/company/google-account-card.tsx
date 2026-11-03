import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, CheckCircle2, Loader2, RefreshCw, Unplug, XCircle } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";
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
  const [confirm, setConfirm] = useState<"switch" | "disc" | null>(null);
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
    try { await disc({ data: { slug } }); setChecks(null); setConfirm(null); toast.success("Google account disconnected."); await refresh(); }
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
            <Button size="sm" variant="outline" onClick={() => setConfirm("switch")} disabled={!!busy}><ArrowLeftRight className="size-3.5" /> Switch account</Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirm("disc")} disabled={!!busy}><Unplug className="size-3.5" /> Disconnect</Button>
          </div>
        ) : (
          <Button size="sm" onClick={connect} disabled={!!busy} className="gap-2 border border-border bg-card text-foreground shadow-sm hover:bg-muted">
            {busy === "connect" ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark className="size-4" />} Connect Gmail & Calendar
          </Button>
        )}
      </div>

      {a && (
        <div className="relative mt-3 flex flex-wrap gap-2">
          <Chip ok={a.gmail} icon={GmailMark} label="Gmail" />
          <Chip ok={a.calendar} icon={CalendarMark} label="Calendar" />
          {a.last_error && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">{a.last_error}</span>}
        </div>
      )}
      {a && <p className="relative mt-2 text-[11px] font-semibold text-muted-foreground">Route the company address to {a.email} so incoming mail lands here. Then verify the Inbox address below.</p>}

      <ConfirmDialog
        kind={confirm}
        email={a?.email ?? ""}
        fallback={fallback}
        busy={busy === "disc" || busy === "connect"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => (confirm === "switch" ? connect() : runDisc())}
      />

      {checks && (
        <div className="relative mt-3 grid gap-2 sm:grid-cols-3">
          {checks.map((c, i) => {
            const Icon = /gmail/i.test(c.label) ? GmailMark : /calendar/i.test(c.label) ? CalendarMark : GoogleMark;
            const name = /gmail/i.test(c.label) ? "Gmail" : /calendar/i.test(c.label) ? "Calendar" : "Google";
            return (
              <div
                key={c.id}
                style={{ animationDelay: `${i * 80}ms` }}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                  c.ok ? "border-status-converted/30" : "border-destructive/30",
                )}
              >
                <span className={cn("pointer-events-none absolute -right-8 -top-8 size-20 rounded-full blur-2xl", c.ok ? "bg-status-converted/15" : "bg-destructive/15")} />
                <div className="relative flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background shadow-sm transition-transform group-hover:scale-110">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13px] font-bold">
                      {name}
                      {c.ok ? <CheckCircle2 className="size-3.5 text-status-converted" /> : <XCircle className="size-3.5 text-destructive" />}
                    </div>
                    <div className={cn("text-[10.5px] font-bold uppercase tracking-wide", c.ok ? "text-status-converted" : "text-destructive")}>
                      {c.ok ? "Working" : "Failed"}
                    </div>
                  </div>
                </div>
                <p className="relative mt-2 break-words text-[11.5px] font-semibold text-muted-foreground">{c.detail}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GmailMark({ className }: { className?: string }) {
  return (
    <svg viewBox="52 42 88 66" className={className} aria-hidden>
      <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
      <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
      <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
      <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
      <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
    </svg>
  );
}

export function CalendarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <path fill="#fff" d="M152.6 47.4H47.4v105.2h105.2z" />
      <path fill="#ea4335" d="M152.6 200 200 152.6h-47.4z" />
      <path fill="#fbbc04" d="M200 47.4h-47.4v105.2H200z" />
      <path fill="#34a853" d="M152.6 152.6H47.4V200h105.2z" />
      <path fill="#188038" d="M0 152.6v31.6A15.8 15.8 0 0 0 15.8 200h31.6v-47.4z" />
      <path fill="#1967d2" d="M200 47.4V15.8A15.8 15.8 0 0 0 184.2 0h-31.6v47.4z" />
      <path fill="#4285f4" d="M152.6 0H15.8A15.8 15.8 0 0 0 0 15.8v136.8h47.4V47.4h105.2z" />
      <text x="100" y="128" textAnchor="middle" fontSize="72" fontWeight="700" fill="#4285f4" fontFamily="Arial, sans-serif">31</text>
    </svg>
  );
}

function ConfirmDialog({ kind, email, fallback, busy, onCancel, onConfirm }: {
  kind: "switch" | "disc" | null; email: string; fallback: string; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const sw = kind === "switch";
  const points = sw
    ? [
        `You'll pick a different Google account on Google's sign-in page.`,
        `${email || "The current account"} stops being used once the new one connects.`,
        "Gmail inbox and Calendar meetings move to the new account.",
        "Past mail history and sent records stay unchanged.",
      ]
    : [
        `Gmail inbox and Calendar meetings stop using ${email || "this account"}.`,
        `Mail falls back to the shared ${fallback} until you connect again.`,
        "Saved access is removed from the Console right away.",
        "Past mail history and sent records stay unchanged.",
      ];
  return (
    <AlertDialog open={!!kind} onOpenChange={(o) => !o && !busy && onCancel()}>
      <AlertDialogContent className="overflow-hidden p-0 sm:max-w-md">
        <div className={cn("relative px-6 pb-4 pt-6", sw ? "bg-primary/5" : "bg-destructive/5")}>
          <span className={cn("pointer-events-none absolute -right-10 -top-12 size-36 rounded-full blur-3xl", sw ? "bg-primary/25" : "bg-destructive/25")} />
          <div className="relative flex items-center gap-3">
            <span className={cn("grid size-11 place-items-center rounded-xl border bg-card shadow-sm animate-in zoom-in-75 duration-300", sw ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive")}>
              {sw ? <ArrowLeftRight className="size-5" /> : <Unplug className="size-5" />}
            </span>
            <div className="min-w-0">
              <AlertDialogTitle className="text-[15px] font-bold">{sw ? "Switch Google account?" : "Disconnect Google account?"}</AlertDialogTitle>
              <AlertDialogDescription className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-semibold">
                <GoogleMark className="size-3.5 shrink-0" /> {email}
              </AlertDialogDescription>
            </div>
          </div>
        </div>
        <ul className="space-y-2 px-6 py-4">
          {points.map((t, i) => (
            <li key={t} style={{ animationDelay: `${i * 70}ms` }} className="flex items-start gap-2 text-[12.5px] font-semibold text-foreground animate-in fade-in slide-in-from-left-2 fill-mode-both">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", i === points.length - 1 ? "bg-status-converted" : sw ? "bg-primary" : "bg-destructive")} />
              {t}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          {sw ? (
            <Button size="sm" variant="outline" onClick={onConfirm} disabled={busy} className="gap-2 rounded-full bg-card px-4 font-medium text-foreground shadow-sm transition-all hover:bg-muted hover:shadow-md active:scale-95">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark className="size-4" />}
              Continue to Google
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={onConfirm} disabled={busy} className="transition-transform active:scale-95">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />}
              Disconnect
            </Button>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Chip({ ok, icon: Icon, label }: { ok: boolean; icon: typeof GmailMark; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[12px] font-bold shadow-sm", ok ? "border-border text-foreground" : "border-destructive/30 text-destructive")}>
      <Icon className="size-3.5" /> {label}
      {ok ? <CheckCircle2 className="size-3 text-status-converted" /> : <span className="text-[11px]">— not granted</span>}
    </span>
  );
}
