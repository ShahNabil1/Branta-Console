import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Globe, KeyRound, Loader2, ShieldCheck, Unplug, Webhook, XCircle, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisconnectButton } from "@/components/ui/disconnect-button";
import { ConfirmSurface } from "@/components/ui/confirm-surface";
import { TestLoader } from "@/components/ui/test-loader";
import { disconnectResendOAuth, getResendOAuth, runResendSetup, startResendConnect, type SetupStage, type SetupStep } from "@/lib/company-resend.functions";
import { connectResendInPopup } from "@/lib/resend-connect-popup";
import { cn } from "@/lib/utils";
import resendLogo from "@/assets/email/resend.webp.asset.json";
import resendWordmarkBlack from "@/assets/email/resend-wordmark-black.png.asset.json";

const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const STAGES: { id: SetupStage; label: string; icon: LucideIcon }[] = [
  { id: "domain", label: "Add domain", icon: Globe },
  { id: "dns", label: "Cloudflare DNS", icon: Zap },
  { id: "verify", label: "Verify", icon: ShieldCheck },
  { id: "key", label: "API key", icon: KeyRound },
  { id: "webhook", label: "Webhook", icon: Webhook },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Company's Resend account via OAuth plus one-click sending setup. */
export function ResendOAuthCard({ slug, companyName, onReady }: { slug: string; companyName: string; onReady?: () => void }) {
  const get = useServerFn(getResendOAuth);
  const start = useServerFn(startResendConnect);
  const setup = useServerFn(runResendSetup);
  const disc = useServerFn(disconnectResendOAuth);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["company-resend-oauth", slug], queryFn: () => get({ data: { slug } }) });
  const [busy, setBusy] = useState<"connect" | "setup" | "disc" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [steps, setSteps] = useState<Partial<Record<SetupStage, SetupStep>>>({});
  const [running, setRunning] = useState<SetupStage | null>(null);
  const abort = useRef<AbortController | null>(null);
  const auto = useRef(false);
  useEffect(() => () => abort.current?.abort(), [slug]);
  const a = q.data?.account ?? null;
  const inbox = q.data?.inbox ?? null;
  const ready = !!q.data?.providerReady;
  const found = q.data?.domains ?? [];
  const verified = !!inbox && found.some((x) => x.name === inbox.domain && x.status === "verified");
  const refresh = () => qc.invalidateQueries({ queryKey: ["company-resend-oauth", slug] });

  const connect = async () => {
    setBusy("connect");
    abort.current?.abort();
    const c = new AbortController(); abort.current = c;
    try {
      const r = await connectResendInPopup(slug, (popupId) => start({ data: { slug, popupId } }), c.signal);
      if (c.signal.aborted) return;
      if (r?.status === "ok") { auto.current = false; await refresh(); toast.success("Resend account connected."); }
      else if (r?.status === "error") toast.error(r.message || "Resend connection failed.");
    } catch (e) { if (!c.signal.aborted) toast.error(err(e)); }
    finally { if (!c.signal.aborted) setBusy(null); }
  };

  const runAll = async (onlyKeys: boolean) => {
    setBusy("setup"); setSteps({});
    try {
      for (const s of STAGES.filter((x) => !onlyKeys || x.id === "key" || x.id === "webhook")) {
        setRunning(s.id);
        let r = await setup({ data: { slug, stage: s.id } });
        for (let i = 0; s.id === "verify" && r.pending && i < 8; i++) {
          setSteps((p) => ({ ...p, verify: r }));
          await sleep(15_000);
          r = await setup({ data: { slug, stage: "verify" } });
        }
        setSteps((p) => ({ ...p, [s.id]: r }));
        if (!r.ok) { toast.error(r.detail); return; }
      }
      toast.success(`Resend is ready for ${inbox?.email}.`);
      onReady?.();
    } catch (e) { toast.error(err(e)); }
    finally { setRunning(null); setBusy(null); void refresh(); }
  };

  // Connected + verified Inbox address + not yet configured → set up automatically in the background.
  useEffect(() => {
    if (!a || !inbox || ready || busy || auto.current || q.isFetching) return;
    auto.current = true;
    void runAll(verified);
  }, [a, inbox, ready, verified, busy, q.isFetching]); // eslint-disable-line react-hooks/exhaustive-deps

  const runDisc = async () => {
    setBusy("disc");
    try { await disc({ data: { slug } }); setConfirm(false); setSteps({}); toast.success("Resend account disconnected."); await refresh(); }
    catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  };

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-md">
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <img src={resendLogo.url} alt="" aria-hidden="true" className="size-full object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
            <img src={resendWordmarkBlack.url} alt="Resend" className="h-3.5 w-auto object-contain" />
            <span className="text-muted-foreground">·</span> One-click setup
            {a && <span className="inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[11px] font-bold text-status-converted animate-in fade-in zoom-in-90"><CheckCircle2 className="size-3" /> Connected</span>}
          </div>
          <p className="text-[12px] font-semibold text-muted-foreground">
            {q.isLoading ? "Loading…" : a
              ? !inbox ? "Verify the In-app Gmail Inbox Address below first — its address becomes the sender."
                : ready ? `Ready · sending as ${inbox.name} <${inbox.email}> — manage it in the Resend card below.`
                : busy === "setup" ? (verified ? `${inbox.domain} is already verified · creating API key and webhook…` : `Setting up ${inbox.domain}…`)
                : `Sender ${inbox.name} <${inbox.email}>`
              : "Sign in or create a Resend account in the popup — the Console does the rest."}
          </p>
        </div>
        {q.isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : a ? (
          <DisconnectButton onClick={() => setConfirm(true)} disabled={!!busy} />
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={!!busy}
            className="group relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border border-border bg-card pl-2.5 pr-4 text-[13px] font-semibold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-70"
          >
            {busy === "connect" ? <TestLoader className="size-5" tone="export" active /> : <img src={resendLogo.url} alt="" className="size-5 rounded transition-transform group-hover:scale-110" />}
            <span className="relative tracking-tight">{busy === "connect" ? "Connecting…" : "Connect"}</span>
            <img src={resendWordmarkBlack.url} alt="Resend" className="relative h-3 w-auto object-contain" />
          </button>
        )}
      </div>

      {a && inbox && !ready && !(verified && busy === "setup") && Object.keys(steps).length + (running ? 1 : 0) > 0 && (
        <div className="relative mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-5">
            {STAGES.map((s) => {
              const st = steps[s.id];
              const live = running === s.id;
              const Icon = s.icon;
              return (
                <div key={s.id} className={cn(
                  "min-h-[84px] rounded-lg border bg-card p-2.5 transition-colors",
                  live ? "border-primary/50" : st?.ok ? "border-status-converted/30" : st && !st.pending ? "border-destructive/30" : "border-border",
                )}>
                  <div className="flex items-center gap-1.5 text-[12px] font-bold">
                    {live ? <TestLoader className="size-3.5" active /> : st?.ok ? <CheckCircle2 className="size-3.5 text-status-converted" /> : st?.pending ? <Clock className="size-3.5 text-muted-foreground" /> : st ? <XCircle className="size-3.5 text-destructive" /> : <Icon className="size-3.5 text-muted-foreground" />}
                    {s.label}
                  </div>
                  <p className="mt-1 line-clamp-3 break-words text-[11px] font-semibold text-muted-foreground">{st?.detail ?? (live ? "Working…" : "Waiting")}</p>
                </div>
              );
            })}
          </div>
          {a.last_error && !busy && (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[11.5px] font-semibold text-destructive">{a.last_error}</p>
              <Button size="sm" variant="outline" onClick={() => runAll(verified)}><TestLoader active={false} /> Retry</Button>
            </div>
          )}
        </div>
      )}

      <ConfirmSurface
        open={confirm}
        tone="danger"
        icon={Unplug}
        title="Disconnect Resend account?"
        subject={<><img src={resendLogo.url} alt="" className="size-3.5 shrink-0 rounded" /> Resend OAuth</>}
        points={[
          "The Console can no longer run setup in this Resend account.",
          "Saved Resend access is revoked right away.",
          "The domain, API key and webhook already created keep working.",
        ]}
        confirmLabel="Disconnect"
        busy={busy === "disc"}
        onCancel={() => setConfirm(false)}
        onConfirm={runDisc}
      />
    </div>
  );
}
