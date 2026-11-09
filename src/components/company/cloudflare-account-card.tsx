import { DisconnectButton } from "@/components/ui/disconnect-button";
import { ConfirmSurface } from "@/components/ui/confirm-surface";
import { useEffect, useRef, useState } from "react";
import { TestLoader } from "@/components/ui/test-loader";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Globe, Loader2, Mail, Unplug, XCircle, ShieldCheck, MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  disconnectCloudflare,
  getCloudflareConnection,
  startCloudflareConnect,
  testCloudflareConnection,
  enableCloudflareRouting,
} from "@/lib/company-cloudflare.functions";
import { connectCloudflareInPopup } from "@/lib/cloudflare-connect-popup";
import { cn } from "@/lib/utils";
import { DnsRecordsDrawer } from "@/components/company/dns-records-drawer";
import { INTEGRATIONS_CLOUDFLARE_ICON as cfIcon } from "@/lib/brand-assets";
import { INTEGRATIONS_CLOUDFLARE_WORDMARK as cfWordmark } from "@/lib/brand-assets";

const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
type Check = { id: string; label: string; ok: boolean; detail: string; zone?: string; off?: boolean };
const CF_ORANGE = "#F38020";

export function CloudflareMark({ className }: { className?: string }) {
  return <img src={cfIcon.url} alt="" aria-hidden="true" className={cn("object-contain", className)} />;
}

/** Company's own Cloudflare account: DNS management and Email Routing. */
export function CloudflareAccountCard({ slug }: { slug: string }) {
  const get = useServerFn(getCloudflareConnection);
  const start = useServerFn(startCloudflareConnect);
  const test = useServerFn(testCloudflareConnection);
  const disc = useServerFn(disconnectCloudflare);
  const enable = useServerFn(enableCloudflareRouting);
  const [enabling, setEnabling] = useState(false);
  const runEnable = async (zone: string) => {
    setEnabling(true);
    try {
      await enable({ data: { slug, zone } });
      setChecks((cs) => cs?.map((c) => c.id === "routing" ? { ...c, ok: true, off: false, detail: `On for ${zone}.` } : c) ?? cs);
      toast.success(`Email Routing is on for ${zone}.`);
      await refresh();
    } catch (e) { toast.error(err(e)); } finally { setEnabling(false); }
  };
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["company-cloudflare", slug], queryFn: () => get({ data: { slug } }), staleTime: 5 * 60_000 });
  const [busy, setBusy] = useState<"connect" | "test" | "disc" | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [dnsOpen, setDnsOpen] = useState(false);
  const popupAbort = useRef<AbortController | null>(null);
  const autoRan = useRef(false);
  useEffect(() => () => popupAbort.current?.abort(), [slug]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["company-cloudflare", slug] });

  const connect = async () => {
    setBusy("connect");
    popupAbort.current?.abort();
    const controller = new AbortController();
    popupAbort.current = controller;
    try {
      const r = await connectCloudflareInPopup(slug, (popupId) => start({ data: { slug, popupId } }), controller.signal);
      if (controller.signal.aborted) return;
      if (r?.status === "ok") { setChecks(null); autoRan.current = false; await refresh(); toast.success("Cloudflare account connected."); }
      else if (r?.status === "error") toast.error(r.message || "Cloudflare connection failed. Please try again.");
    } catch (e) { if (!controller.signal.aborted) toast.error(err(e)); }
    finally { if (!controller.signal.aborted) setBusy(null); }
  };
  const runTest = async () => {
    setBusy("test"); setChecks(null);
    try { const r = await test({ data: { slug } }); setChecks(r.checks); r.ok ? toast.success("Cloudflare DNS and Email Routing are reachable.") : toast.error(r.checks.find((c) => !c.ok)?.detail ?? "Check failed"); await refresh(); }
    catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  };
  const runDisc = async () => {
    setBusy("disc");
    try { await disc({ data: { slug } }); setChecks(null); setConfirm(false); toast.success("Cloudflare account disconnected."); await refresh(); }
    catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  };

  const data = q.data;
  const a = data?.account ?? null;
  useEffect(() => {
    if (autoRan.current || !a) return;
    autoRan.current = true;
    void test({ data: { slug } }).then((r) => { if (!r.ok) { setChecks(r.checks); void refresh(); } }).catch(() => { /* manual Test shows errors */ });
  }, [a]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-md">
      <span className="pointer-events-none absolute -right-14 -top-16 size-40 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${CF_ORANGE} ${a ? 18 : 10}%, transparent)` }} />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg border border-border bg-card shadow-sm"><CloudflareMark className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
            <img src={cfWordmark.url} alt="Cloudflare" className="h-3.5 w-auto object-contain" />
            <span className="text-muted-foreground">·</span> DNS & Email Routing
            {a && <span className="inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[11px] font-bold text-status-converted animate-in fade-in zoom-in-90"><CheckCircle2 className="size-3" /> Connected</span>}
          </div>
          <p className="truncate text-[12px] font-semibold text-muted-foreground">
            {q.isLoading ? "Loading…" : a
              ? <>Managing domains as <b className="text-foreground">{a.email ?? "Cloudflare user"}</b>{a.accounts.length > 0 && <> · {a.accounts.join(", ")}</>}</>
              : "Connect this company's Cloudflare account to manage DNS records and Email Routing from here."}
          </p>
        </div>
        {q.isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : !data?.configured ? (
          <span className="text-[12px] font-semibold text-destructive">Cloudflare sign-in isn't configured</span>
        ) : a ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={runTest} disabled={!!busy}><TestLoader active={busy === "test"} /> Test</Button>
            <DisconnectButton onClick={() => setConfirm(true)} disabled={!!busy} />
            <Button size="sm" variant="outline" className="px-2" aria-label="Manage DNS records" title="Manage DNS records" onClick={() => setDnsOpen(true)}><MoreHorizontal className="size-4" /></Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={!!busy}
            className="group relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border border-border bg-card pl-2.5 pr-4 text-[13px] font-semibold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-70"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#F38020]/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {busy === "connect" ? <TestLoader className="size-5" tone="export" active /> : <CloudflareMark className="size-5 transition-transform group-hover:scale-110" />}
            <span className="relative tracking-tight">{busy === "connect" ? "Connecting…" : "Connect"}</span>
            <img src={cfWordmark.url} alt="Cloudflare" className="relative h-3 w-auto object-contain" />
          </button>
        )}
      </div>

      {a && (
        <div className="relative mt-3 flex flex-wrap gap-2">
          <Chip icon={Globe} label="DNS records" />
          <Chip icon={Mail} label="Email Routing" />
          <Chip icon={ShieldCheck} label="SSL status" />
          {a.last_error && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">{a.last_error}</span>}
        </div>
      )}

      {a && <DnsRecordsDrawer slug={slug} open={dnsOpen} onOpenChange={setDnsOpen} />}

      <ConfirmSurface
        open={confirm}
        tone="danger"
        icon={Unplug}
        title="Disconnect Cloudflare account?"
        subject={<><CloudflareMark className="size-3.5 shrink-0" /> {a?.email ?? "Cloudflare"}</>}
        points={[
          "The Console stops managing DNS and Email Routing for this company.",
          "Saved access is revoked and removed from the Console right away.",
          "Your domains, DNS records and routing rules in Cloudflare stay unchanged.",
        ]}
        confirmLabel="Disconnect"
        busy={busy === "disc"}
        onCancel={() => setConfirm(false)}
        onConfirm={runDisc}
      />

      {checks && (
        <div className="relative mt-3 grid gap-2 sm:grid-cols-3">
          {checks.map((c, i) => (
            <div
              key={c.id}
              style={{ animationDelay: `${i * 80}ms` }}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                c.ok ? "border-status-converted/30" : "border-destructive/30",
              )}
            >
              <div className="relative flex items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background shadow-sm transition-transform group-hover:scale-110">
                  {c.id === "dns" ? <Globe className="size-4" /> : c.id === "routing" ? <Mail className="size-4" /> : <CloudflareMark className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-bold">
                    {c.label}
                    {c.ok ? <CheckCircle2 className="size-3.5 text-status-converted" /> : <XCircle className="size-3.5 text-destructive" />}
                  </div>
                  <div className={cn("text-[10.5px] font-bold uppercase tracking-wide", c.ok ? "text-status-converted" : "text-destructive")}>{c.ok ? (c.id === "routing" ? "Enabled" : "Working") : c.off ? "Off" : "Failed"}</div>
                </div>
                {c.off && c.zone && (
                  <Button size="sm" variant="outline" className="h-8 shrink-0 animate-in fade-in" disabled={enabling || !!busy} onClick={() => void runEnable(c.zone!)}>
                    <TestLoader active={enabling} /> {enabling ? "Enabling…" : "Enable"}
                  </Button>
                )}
              </div>
              <p className="relative mt-2 break-words text-[11.5px] font-semibold text-muted-foreground">{c.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] font-bold shadow-sm">
      <Icon className="size-3.5 text-muted-foreground" /> {label} <CheckCircle2 className="size-3 text-status-converted" />
    </span>
  );
}
