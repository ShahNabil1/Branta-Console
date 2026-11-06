import { DisconnectButton as SharedDisconnectButton } from "@/components/ui/disconnect-button";
import { TestLoader } from "@/components/ui/test-loader";
import { WebhookFixButton } from "@/components/company/webhook-fix-button";
import { fixBlocker } from "@/lib/fix-order";
import { ProviderRepairDialog } from "@/components/company/provider-repair-dialog";
import { repairProviderApi, repairProviderDomain } from "@/lib/company-provider-repair.functions";
import { startResendConnect } from "@/lib/company-resend.functions";
import { connectResendInPopup } from "@/lib/resend-connect-popup";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Inbox,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Radar,
  Star,
  Unplug,
  Webhook,
  X,
  XCircle,
  type LucideIcon,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getInboxDomains, verifyInboxRouting, type RoutingResult } from "@/lib/company-inbox-routing.functions";
import {
  connectBrevoWebhook,
  connectResendWebhook,
  disconnectProvider,
  previewProviderDisconnect,
  getEmailIntegrations,
  setDefaultProvider,
  setFinanceSender,
  testEmailProvider,
  repairCompanyWebhook,
  fixResendTracking,
  verifyEmailProvider,
  type Check as CheckT,
  type ProviderView,
} from "@/lib/company-email.functions";
import { cn } from "@/lib/utils";
import { providerCheckState } from "@/lib/provider-check-state";
import { DangerConfirm, DiscardCancelButton } from "@/components/company/danger-confirm";
import { GoogleAccountCard, GoogleMark, GmailMark } from "@/components/company/google-account-card";
import { CloudflareAccountCard } from "@/components/company/cloudflare-account-card";
import { ResendOAuthCard } from "@/components/company/resend-oauth-card";
import { EMAIL_RESEND as resendLogo } from "@/lib/brand-assets";
import { EMAIL_BREVO as brevoLogo } from "@/lib/brand-assets";
import { EMAIL_RESEND_MARK_WHITE as resendMarkWhite } from "@/lib/brand-assets";
import { EMAIL_RESEND_WORDMARK_WHITE as resendWordmarkWhite } from "@/lib/brand-assets";
import { EMAIL_RESEND_WORDMARK_BLACK as resendWordmarkBlack } from "@/lib/brand-assets";
import { EMAIL_BREVO_ICON as brevoIcon } from "@/lib/brand-assets";
import { EMAIL_BREVO_WORDMARK as brevoWordmark } from "@/lib/brand-assets";
import { INTEGRATIONS_SWITCH_ACCOUNT as switchAccountIcon } from "@/lib/brand-assets";
import { INTEGRATIONS_CLOUDFLARE_EMAIL_ROUTING_MARK as cfRoutingIcon } from "@/lib/brand-assets";
import { INTEGRATIONS_EMAIL_ROUTING_RULE_ENVELOPE as routingRuleIcon } from "@/lib/brand-assets";
import { COMPANY_CONNECTION_VERIFIED as verifiedIcon } from "@/lib/brand-assets";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function ChangeInboxDialog({
  open,
  email,
  verified,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  email: string;
  verified: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const points = [
    `${email} stops being the company Inbox address as soon as you save a new one.`,
    ...(verified
      ? ["The new address must pass automatic verification before mail works again."]
      : []),
    "Sender Email for Resend and Brevo switches to the new address — re-verify the sender and domain there.",
    "Leads and Invoice emails stay paused for this company until the new sender is verified.",
    "Update your email routing so the new address forwards to the connected Gmail, or replies won't arrive.",
    "Past mail, replies and delivery history stay unchanged.",
  ];
  return (
    <ChangeConfirm
      open={open}
      title="Change Inbox address?"
      icon={Inbox}
      subject={email}
      verified={verified}
      points={points}
      confirmLabel="Change address"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function ChangeConfirm({
  open,
  title,
  icon: Icon,
  subject,
  verified,
  points,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  icon: typeof Mail;
  subject: string;
  verified?: boolean;
  points: string[];
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="overflow-hidden p-0 sm:max-w-md">
        <div className="relative bg-primary/5 px-6 pb-4 pt-6">
          <span className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-primary/25 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-primary/30 bg-card text-primary shadow-sm animate-in zoom-in-75 duration-300">
              <Mail className="size-5" />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle className="text-[15px] font-bold">{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-semibold">
                <Icon className="size-3.5 shrink-0" /> <span className="truncate">{subject}</span>
                {verified && <CheckCircle2 className="size-3.5 shrink-0 text-status-converted" />}
              </AlertDialogDescription>
            </div>
          </div>
        </div>
        <ul className="space-y-2 px-6 py-4">
          {points.map((t, i) => (
            <li
              key={t}
              style={{ animationDelay: `${i * 70}ms` }}
              className="flex items-start gap-2 text-[12.5px] font-semibold text-foreground animate-in fade-in slide-in-from-left-2 fill-mode-both"
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  i === points.length - 1 ? "bg-status-converted" : "bg-primary",
                )}
              />
              {t}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} className="transition-transform active:scale-95">
            <Pencil className="size-3.5" /> {confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type P = "resend" | "brevo";
const META: Record<
  P,
  { name: string; color: string; tag: string; keyPh: string; keyHelp: string }
> = {
  resend: {
    name: "Resend",
    color: "#111827",
    tag: "Developer email API",
    keyPh: "re_…",
    keyHelp: "Resend → API Keys → Create (Full access)",
  },
  brevo: {
    name: "Brevo",
    color: "#0B996E",
    tag: "Transactional email (v3)",
    keyPh: "xkeysib-…",
    keyHelp: "Brevo → Settings → SMTP & API → API keys",
  },
};
const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function EmailIntegrations({ slug, accent }: { slug: string; accent: string }) {
  const fn = useServerFn(getEmailIntegrations);
  const q = useQuery({ queryKey: ["company-email", slug], queryFn: () => fn({ data: { slug } }) });
  const [open, setOpen] = useState<P | null>(null);
  if (q.isLoading)
    return (
      <div className="grid h-40 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (q.error || !q.data)
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-[13px] font-semibold text-destructive">
        {err(q.error)}
      </div>
    );
  const d = q.data;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
        <span
          className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full blur-3xl"
          style={{ background: `color-mix(in oklab, ${accent} 16%, transparent)` }}
        />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card">
            <GoogleMark className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold">Email & Calendar</h2>
          </div>
        </div>
        <GoogleAccountCard slug={slug} accent={accent} />
        <CloudflareAccountCard slug={slug} />
        <InboxAddress slug={slug} accent={accent} inbox={d.inboxGmail ? d.inbox : null} gmail={d.inboxGmail} />
        <ResendOAuthCard slug={slug} companyName={d.company.name} onReady={() => void q.refetch()} />
        {!d.inbox?.verified_at && (
          <div className="relative mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[12px] font-semibold text-muted-foreground">
            <Lock className="size-3.5" /> Verify the Inbox address first — Resend and Brevo unlock
            after that.
          </div>
        )}
        <div
          className={cn(
            "relative transition-opacity",
            !d.inbox?.verified_at && "pointer-events-none opacity-40",
          )}
        >
          {(["resend", "brevo"] as P[]).map((p) => (
            <ProviderPanel
              key={p}
              p={p}
              slug={slug}
              v={d[p]}
              data={d}
              both={!!d.resend && !!d.brevo}
              open={open === p}
              onToggle={() => setOpen(open === p ? null : p)}
              locked={!d.inbox?.verified_at}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

type TestCheck = CheckT & { kind?: "api" | "domain" | "tracking" | "webhook"; needsInput?: boolean };

function ProviderPanel({
  p,
  slug,
  v,
  data,
  both,
  open,
  onToggle,
  locked,
}: {
  p: P;
  slug: string;
  v: ProviderView | null;
  data: Data;
  both: boolean;
  open: boolean;
  onToggle: () => void;
  locked: boolean;
}) {
  const m = META[p];
  const [flowing, setFlowing] = useState(false);
  const configured = !flowing && !!v;
  const connected = !flowing && !!v?.domain_verified_at && !!v?.webhook_verified_at;
  const test = useServerFn(testEmailProvider);
  const repair = useServerFn(repairCompanyWebhook);
  const fixTrack = useServerFn(fixResendTracking);
  const [sub, setSub] = useState("links");
  const def = useServerFn(setDefaultProvider);
  const refresh = useRefresh(slug);
  const [busy, setBusy] = useState<"test" | "def" | "fix" | null>(null);
  const fixingRef = useRef(false);
  const [fixingKind, setFixingKind] = useState<TestCheck["kind"] | null>(null);
  const [repairDialog, setRepairDialog] = useState<"api" | "domain" | null>(null);
  const [repairError, setRepairError] = useState<string | null>(null);
  const apiRepair = useServerFn(repairProviderApi);
  const domainRepair = useServerFn(repairProviderDomain);
  const startConnect = useServerFn(startResendConnect);
  const popupAbort = useRef<AbortController | null>(null);
  useEffect(() => () => popupAbort.current?.abort(), [slug]);
  const [checks, setChecks] = useState<TestCheck[] | null>(null);
  const domain = data.inbox?.verified_at ? data.inbox.email.split("@")[1] : v ? v.domain || v.sender_email.split("@")[1] : "";

  const [manualRan, setManualRan] = useState(false);
  const runTest = async (silent: boolean) => {
    if (!silent) {
      setManualRan(true);
      setBusy("test");
      setChecks(null);
    }
    try {
      const r = await test({ data: { slug, provider: p } });
      if (!silent) {
        setChecks(r.checks);
        if (r.ok) toast.success(`${m.name} is working.`);
        else toast.error(r.checks.find((c) => !c.ok)?.detail ?? "Check failed");
      } else setChecks(r.checks);
    } catch (e) {
      if (!silent) toast.error(err(e));
    } finally {
      if (!silent) setBusy(null);
    }
  };
  // Silent health check once on open: quiet when everything works.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !configured) return;
    autoRan.current = true;
    void runTest(true);
  }, [configured]); // eslint-disable-line react-hooks/exhaustive-deps

  const fixWebhook = async () => {
    if (fixingRef.current || busy) return;
    fixingRef.current = true;
    setBusy("fix");
    setFixingKind("webhook");
    try {
      await repair({ data: { slug, provider: p } });
      const result = await test({ data: { slug, provider: p } });
      setChecks(result.checks);
      await refresh();
      if (result.checks.find(c => c.kind === "webhook")?.ok) toast.success(`${m.name} webhook fixed.`);
      else toast.error("Webhook was registered, but its check still needs attention.");
    } catch (e) {
      toast.error(err(e));
    } finally {
      fixingRef.current = false;
      setBusy(null);
      setFixingKind(null);
    }
  };
  const fixTracking = async (needsInput?: boolean) => {
    if (fixingRef.current || busy) return;
    const v = sub.trim().toLowerCase();
    if (needsInput && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v)) { toast.error("Use letters, numbers and dashes only."); return; }
    fixingRef.current = true;
    setBusy("fix");
    setFixingKind("tracking");
    try {
      const r = await fixTrack({ data: { slug, subdomain: needsInput ? v : undefined } });
      const result = await test({ data: { slug, provider: p } });
      setChecks(result.checks);
      if (r.ok) toast.success("Tracking & TLS fixed.");
      else if (r.pending) toast.message("Settings fixed · Resend is still verifying the tracking DNS. Test again in a few minutes.");
      else toast.error(r.detail || "Tracking still needs attention.");
    } catch (e) {
      toast.error(err(e));
    } finally {
      fixingRef.current = false;
      setBusy(null);
      setFixingKind(null);
    }
  };
  const openRepair = (kind: "api" | "domain") => { setRepairError(null); setRepairDialog(kind); };
  const fixApi = async (mode: "oauth" | "manual", apiKey?: string) => {
    if (fixingRef.current || busy) return;
    fixingRef.current = true; setBusy("fix"); setFixingKind("api"); setRepairError(null);
    try {
      if (mode === "oauth") {
        const controller = new AbortController(); popupAbort.current = controller;
        const result = await connectResendInPopup(slug, popupId => startConnect({ data: { slug, popupId } }), controller.signal);
        if (result?.status !== "ok") throw new Error(result?.status === "error" ? result.message || "Resend connection failed." : "Resend connection was cancelled.");
      }
      await apiRepair({ data: { slug, provider: p, mode, ...(apiKey ? { apiKey } : {}) } });
      await repair({ data: { slug, provider: p } });
      const result = await test({ data: { slug, provider: p } });
      setChecks(result.checks);
      await refresh();
      setRepairDialog(null);
      toast.success(`${m.name} API repaired.`);
    } catch (e) { setRepairError(err(e)); }
    finally { fixingRef.current = false; setBusy(null); setFixingKind(null); }
  };
  const fixDomain = async (subdomain: string) => {
    if (fixingRef.current || busy) return;
    fixingRef.current = true; setBusy("fix"); setFixingKind("domain"); setRepairError(null);
    try {
      const result = await domainRepair({ data: { slug, provider: p, subdomain } });
      const health = await test({ data: { slug, provider: p } });
      setChecks(health.checks);
      await refresh();
      setRepairDialog(null);
      if (result.ok) toast.success(result.detail);
      else if (result.pending) toast.message(result.detail);
      else toast.error(result.detail);
    } catch (e) { setRepairError(err(e)); }
    finally { fixingRef.current = false; setBusy(null); setFixingKind(null); }
  };
  const chips =
    p === "resend"
      ? [
          { k: "api", label: "API key" },
          { k: "webhook", label: "Webhook" },
          { k: "domain", label: `Domain · ${domain}` },
          { k: "tracking", label: "Tracking & TLS" },
        ]
      : [
          { k: "api", label: "API key" },
          { k: "domain", label: `Sender & domain · ${domain}` },
          { k: "webhook", label: "Webhook" },
        ];

  return (
    <div className="relative mt-4 flex min-h-[112px] flex-col overflow-hidden rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-md">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: m.color }} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card shadow-sm">
          <ProviderLogo p={p} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
            <span className="inline-flex items-center rounded-md border border-border bg-card px-2 py-1 shadow-sm">
              <img
                src={p === "resend" ? resendWordmarkBlack.url : brevoWordmark.url}
                alt={m.name}
                className="h-3 w-auto object-contain"
              />
            </span>
            {connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[11px] font-bold text-status-converted">
                <CheckCircle2 className="size-3" /> Connected
              </span>
            ) : (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", status(v).cls)}>
                {status(v).label}
              </span>
            )}
            {v?.is_default && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                <Star className="size-3 fill-brand" /> Default
              </span>
            )}
          </div>
          <p className="truncate text-[12px] font-semibold text-muted-foreground">
            {v ? (
              <>
                Sending from{" "}
                <b className="text-foreground">
                  {v.sender_name} &lt;{v.sender_email}&gt;
                </b>
              </>
            ) : (
              m.tag
            )}
          </p>
        </div>
        {configured ? (
          <div className="flex flex-wrap gap-2 animate-in fade-in duration-500">
            <Button size="sm" variant="outline" onClick={() => runTest(false)} disabled={!!busy}>
              <TestLoader active={busy === "test"} /> Test
            </Button>
            {both && !v!.is_default && (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("def");
                  try {
                    await def({ data: { slug, provider: p } });
                    await refresh();
                    toast.success(`${m.name} is now default`);
                  } catch (e) {
                    toast.error(err(e));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <Star className="size-3.5" /> Make default
              </Button>
            )}
            <DisconnectButton p={p} slug={slug} v={v!} />
          </div>
        ) : (
          <InlineConnect p={p} slug={slug} v={v} data={data} locked={locked} onFlowing={setFlowing} />
        )}
      </div>

      {configured && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => {
            const state = providerCheckState(checks, c.k, busy === "test");
            const bad = state === "issue";
            return (
              <span
                key={c.k}
                title={state === "unknown" ? "Not verified — run Test to check" : state === "pending" ? "Checking…" : state === "issue" ? "Issue" : "Working"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold",
                  bad
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-border bg-card text-foreground",
                )}
              >
                {c.k === "api" ? (
                  <KeyRound className="size-3" />
                ) : c.k === "webhook" ? (
                  <Webhook className="size-3" />
                ) : (
                  <ShieldCheck className="size-3" />
                )}
                {c.label}
                {state === "pending" ? (
                  <TestLoader className="size-3" active />
                ) : bad ? (
                  <XCircle className="size-3" />
                ) : state === "success" ? (
                  <CheckCircle2 className="size-3 text-status-converted" />
                ) : <span className="text-[10px] font-semibold text-muted-foreground">Not checked</span>}
              </span>
            );
          })}
        </div>
      )}

      {configured && checks && (manualRan || checks.some(c => !c.ok)) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {checks.map((c, i) => {
            const I = c.kind === "webhook" ? Webhook : c.kind === "domain" ? ShieldCheck : c.kind === "tracking" ? Radar : KeyRound;
            return (
              <div
                key={c.id}
                style={{ animationDelay: `${i * 80}ms` }}
                className={cn(
                  "relative overflow-hidden rounded-xl border bg-card p-3 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                  c.ok ? "border-status-converted/30" : "border-destructive/30",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute -right-8 -top-8 size-20 rounded-full blur-2xl",
                    c.ok ? "bg-status-converted/15" : "bg-destructive/15",
                  )}
                />
                <div className="relative flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background shadow-sm">
                    <I className="size-4" style={{ color: m.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[13px] font-bold">
                      {c.label}
                      {c.ok ? (
                        <CheckCircle2 className="size-3.5 text-status-converted" />
                      ) : (
                        <XCircle className="size-3.5 text-destructive" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "text-[10.5px] font-bold uppercase tracking-wider",
                        c.ok ? "text-status-converted" : "text-destructive",
                      )}
                    >
                      {c.ok ? "Working" : "Issue"}
                    </div>
                  </div>
                  {!c.ok && (c.kind === "api" || c.kind === "domain" || c.kind === "tracking" || c.kind === "webhook") && (() => {
                    const blocker = fixBlocker(c.kind, checks);
                    return (
                      <span title={blocker ?? undefined} className="ml-auto">
                        <WebhookFixButton fixing={fixingKind === c.kind} disabled={locked || !!busy || !!blocker} onClick={() => {
                          if (c.kind === "webhook") void fixWebhook();
                          else if (c.kind === "tracking") void fixTracking(c.needsInput);
                          else openRepair(c.kind as "api" | "domain");
                        }} />
                      </span>
                    );
                  })()}
                </div>
                <p className="relative mt-2 break-words text-[11.5px] font-semibold text-muted-foreground">
                  {c.detail}
                </p>
                {c.kind === "tracking" && !c.ok && c.needsInput && (
                  <div className="relative mt-2 flex h-8 items-center overflow-hidden rounded-md border border-border bg-background focus-within:border-primary">
                    <input value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Tracking subdomain" className="h-full w-20 min-w-0 flex-1 bg-transparent px-2 text-[12px] font-semibold outline-none" />
                    <span className="truncate pr-2 font-mono text-[11px] text-muted-foreground">.{domain}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {p === "resend" && connected && <FinanceSender slug={slug} v={v!} />}

      {repairDialog && <ProviderRepairDialog kind={repairDialog} provider={p} domain={domain} busy={!!busy} error={repairError} onClose={() => setRepairDialog(null)} onApi={(mode, key) => void fixApi(mode, key)} onDomain={value => void fixDomain(value)} />}

    </div>
  );
}

function DisconnectButton({ p, slug, v }: { p: P; slug: string; v: ProviderView }) {
  const disc = useServerFn(disconnectProvider);
  const previewDisconnect = useServerFn(previewProviderDisconnect);
  const refresh = useRefresh(slug);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [hooks, setHooks] = useState<{ id: string; address: string }[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const loadPreview = async () => {
    if (busy) return;
    setBusy("preview");
    setHooks(null);
    setPreviewError(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        previewDisconnect({ data: { slug, provider: p } }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("The webhook check timed out. Please retry.")), 30_000);
        }),
      ]);
      setHooks(result.hooks);
    } catch (e) {
      setPreviewError(err(e));
    } finally {
      clearTimeout(timeout);
      setBusy(null);
    }
  };
  return (
    <>
      <SharedDisconnectButton
        disabled={!!busy}
        onClick={() => {
          setConfirm(true);
          void loadPreview();
        }}
      />
      <DangerConfirm
        open={confirm}
        icon={Unplug}
        title={`Disconnect ${META[p].name}?`}
        subject={`${v.sender_name} <${v.sender_email}>`}
        busy={!!busy}
        confirmLabel={busy === "preview" ? "Checking…" : busy === "dc" ? "Disconnecting…" : previewError ? "Disconnect anyway" : "Disconnect"}
        cancelLabel="Keep it"
        points={
          busy === "preview"
            ? [`Checking ${META[p].name} webhooks…`]
            : previewError
              ? [
                  `${META[p].name} didn't respond: ${previewError}`,
                  `Its webhooks can't be removed on ${META[p].name}'s side — delete them there later if needed.`,
                  "Disconnecting erases the API key, signing secret and webhook from Branta Console.",
                ]
              : hooks === null
                ? ["Check the company webhooks before disconnecting."]
              : [
                  hooks.length
                    ? `Removes ${hooks.length} Branta Tech webhook(s): ${hooks.map((h) => h.address).join(", ")}`
                    : "No Branta Tech webhooks found — only the Console connection is removed.",
                  "Erases the stored API key and webhook secret. To use a different API key, connect again afterwards.",
                  p === "resend"
                    ? `The finance sender ${v.finance_sender_name || v.sender_name} <${v.finance_sender_email || v.sender_email}> is removed too; invoice emails and reminders switch to Brevo if it's connected, otherwise they stop.`
                    : "Lead, Inbox and invoice mail stop unless Resend is connected.",
                  "Other systems' webhooks and past email history stay unchanged.",
                ]
        }
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          if (busy) return;
          const force = !!previewError;
          if (hooks === null && !force) {
            void loadPreview();
            return;
          }
          setBusy("dc");
          void disc({ data: { slug, provider: p, confirmedHookIds: (hooks ?? []).map((h) => h.id), force } })
            .then(async (r) => {
              setConfirm(false);
              await refresh();
              setPreviewError(null);
              toast.success(force ? "Disconnected · credentials erased from Branta Console" : `Disconnected · removed ${r.removed} Branta Tech webhook(s)`);
            })
            .catch((e) => toast.error(err(e)))
            .finally(() => setBusy(null));
        }}
      />
    </>
  );
}

function status(v: ProviderView | null) {
  if (!v) return { label: "Not configured", cls: "bg-muted text-muted-foreground" };
  if (v.domain_verified_at && v.webhook_verified_at)
    return { label: "Connected", cls: "bg-status-converted/15 text-status-converted" };
  return { label: "Action required", cls: "bg-amber-500/15 text-amber-600" };
}

function ProviderLogo({ p }: { p: P }) {
  const logo = p === "resend" ? resendLogo : brevoLogo;
  return (
    <img
      src={logo.url}
      alt={`${META[p].name} logo`}
      width={32}
      height={32}
      className="size-8 object-contain"
    />
  );
}

type Data = Awaited<ReturnType<typeof getEmailIntegrations>>;

function Setup({ p, slug, v, data }: { p: P; slug: string; v: ProviderView | null; data: Data }) {
  const m = META[p];
  const step1 = !!v?.domain_verified_at,
    step2 = !!v?.webhook_verified_at;
  const [step, setStep] = useState(step1 ? 2 : 1);
  const steps: { n: number; label: string; icon: LucideIcon; done: boolean }[] = [
    { n: 1, label: "Sender & API key", icon: KeyRound, done: step1 },
    { n: 2, label: "Webhook", icon: Webhook, done: step2 },
  ];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-1 border-b border-border p-2">
        {steps.map((s, i) => {
          const on = step === s.n;
          const locked = s.n > 1 && !step1;
          return (
            <div key={s.n} className="flex flex-1 items-center gap-1">
              <button
                disabled={locked}
                onClick={() => setStep(s.n)}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                  on ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[11px] transition-all",
                    s.done
                      ? "bg-status-converted text-primary-foreground"
                      : on
                        ? "text-primary-foreground"
                        : "bg-muted",
                  )}
                  style={!s.done && on ? { background: m.color } : undefined}
                >
                  {s.done ? <Check className="size-3.5" /> : s.n}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "h-0.5 w-6 rounded-full transition-colors",
                    s.done ? "bg-status-converted" : "bg-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <div key={step} className="min-h-[420px] p-5 animate-in fade-in duration-200">
        {step === 1 && (
          <StepKey
            p={p}
            slug={slug}
            v={v}
            inboxEmail={data.inbox!.email}
            companyName={data.company.name}
            onDone={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepAutoHook
            p={p}
            slug={slug}
            v={v}
            data={data}
            onDone={() => {
              /* panel switches to connected view */
            }}
          />
        )}
      </div>
    </section>
  );
}

function useRefresh(slug: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["company-email", slug] });
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
      {hint && <div className="text-[11.5px] font-semibold text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Checks({ list }: { list: CheckT[] | null }) {
  if (!list) return null;
  return (
    <ul className="space-y-1.5">
      {list.map((c, i) => (
        <li
          key={c.id}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] animate-in fade-in slide-in-from-left-1",
            c.ok
              ? "border-status-converted/30 bg-status-converted/5"
              : "border-destructive/30 bg-destructive/5",
          )}
          style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}
        >
          {c.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-converted" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          )}
          <span>
            <b>{c.label}</b>{" "}
            <span className="font-semibold text-muted-foreground">— {c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SecretBox({
  value,
  onChange,
  placeholder,
  savedHint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  savedHint: string | null;
}) {
  const [editing, setEditing] = useState(!savedHint);
  if (!editing && savedHint) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <Lock className="size-3.5 text-status-converted" />
        <code className="flex-1 font-mono text-[12.5px] font-semibold">{savedHint}</code>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> Replace
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
      />
      {savedHint && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            onChange("");
            setEditing(false);
          }}
          aria-label="Cancel"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

function StepKey({
  p,
  slug,
  v,
  inboxEmail,
  companyName,
  onDone,
}: {
  p: P;
  slug: string;
  v: ProviderView | null;
  inboxEmail: string;
  companyName: string;
  onDone: () => void;
}) {
  const m = META[p];
  const [name, setName] = useState(v?.sender_name || (p === "resend" ? companyName : ""));
  const email = inboxEmail;
  const [key, setKey] = useState("");
  const [checks, setChecks] = useState<CheckT[] | null>(null);
  const [busy, setBusy] = useState(false);
  const verify = useServerFn(verifyEmailProvider);
  const refresh = useRefresh(slug);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const brevo = p === "brevo";
  const can = (brevo || name.trim()) && emailOk && (key.trim() || v?.api_key_hint);
  const run = async () => {
    setBusy(true);
    setChecks(null);
    try {
      const r = await verify({
        data: {
          slug,
          provider: p,
          senderName: brevo ? "" : name.trim(),
          senderEmail: email.trim(),
          apiKey: key.trim() || undefined,
        },
      });
      setChecks(r.checks);
      if (r.senderName) setName(r.senderName);
      if (r.ok) {
        setKey("");
        await refresh();
        toast.success(`${m.name} verified & saved`);
        setTimeout(onDone, 900);
      }
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {brevo ? (
          <Field label="Sender name">
            {name ? (
              <div className="flex items-center gap-2 rounded-md border border-status-converted/30 bg-status-converted/5 px-3 py-2 animate-in fade-in zoom-in-95">
                <Lock className="size-3.5 text-status-converted" />
                <span className="flex-1 truncate text-[13px] font-semibold">{name}</span>
                <span className="flex items-center gap-1 rounded-full bg-status-converted/15 px-2 py-0.5 text-[10.5px] font-bold text-status-converted">
                  <CheckCircle2 className="size-3" /> Verified in Brevo
                </span>
              </div>
            ) : (
              <div
                className="relative overflow-hidden rounded-md border px-3 py-2.5"
                style={{
                  borderColor: `color-mix(in oklab, ${m.color} 35%, transparent)`,
                  background: `linear-gradient(110deg, color-mix(in oklab, ${m.color} 10%, transparent), color-mix(in oklab, var(--color-primary) 8%, transparent))`,
                }}
              >
                <div className="flex items-start gap-2">
                  {busy ? (
                    <Loader2
                      className="mt-0.5 size-3.5 shrink-0 animate-spin"
                      style={{ color: m.color }}
                    />
                  ) : (
                    <Sparkles className="mt-0.5 size-3.5 shrink-0" style={{ color: m.color }} />
                  )}
                  <span className="text-[12.5px] font-semibold">
                    <b style={{ color: m.color }}>Auto-filled from Brevo.</b> Once the API key is
                    verified, the sender name saved in your Brevo account appears here
                    automatically.
                  </span>
                </div>
              </div>
            )}
          </Field>
        ) : (
          <Field
            label="Sender name"
            hint="Pre-filled with the company name — edit if you want a different From name"
          >
            <Input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Admakai"
            />
          </Field>
        )}
        <Field
          label="Sender email address"
          hint="Locked to the verified Inbox address so client replies always land in the Inbox."
        >
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <Lock className="size-3.5 text-status-converted" />
            <span className="flex-1 truncate text-[13px] font-semibold">{email}</span>
            <CheckCircle2 className="size-4 text-status-converted" />
          </div>
        </Field>
        <Field label="API key" hint={m.keyHelp}>
          <SecretBox
            value={key}
            onChange={setKey}
            placeholder={m.keyPh}
            savedHint={v?.api_key_hint ?? null}
          />
        </Field>
        <Button
          disabled={!can || busy}
          onClick={run}
          className="shadow-md transition-all hover:-translate-y-0.5 active:scale-95"
          style={{ background: m.color }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{" "}
          Verify
        </Button>
        <Checks list={checks} />
      </div>
      <Tips p={p} />
    </div>
  );
}

function Tips({ p }: { p: P }) {
  const items =
    p === "resend"
      ? [
          "Create a Full access key — sending-only keys can't confirm domains or webhooks.",
          "The sender's domain must be Verified in Resend → Domains.",
          "Key is checked live, then encrypted. You'll only see a masked hint.",
        ]
      : [
          "Brevo → Settings → SMTP & API → API keys → Generate a v3 key (xkeysib-…) with No expiration and Full access.",
          "The Inbox address must be an active sender in Brevo, with its domain authenticated (DKIM/DMARC).",
          "The sender name is read from Brevo — set it there.",
          "If you use Authorised IPs in Brevo, deactivate the restriction for API keys.",
        ];
  return (
    <aside className="space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <div className="text-[12px] font-bold">Before you verify</div>
      {items.map((t) => (
        <div key={t} className="flex gap-2 text-[12px] font-semibold text-muted-foreground">
          <Check className="mt-0.5 size-3.5 shrink-0 text-status-converted" />
          {t}
        </div>
      ))}
    </aside>
  );
}

function CopyRow({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <code className="flex-1 truncate font-mono text-[12px] font-semibold">{value}</code>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? (
          <Check className="size-3.5 text-status-converted" />
        ) : (
          <Copy className="size-3.5" />
        )}{" "}
        {done ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

const BREVO_STAGES = [
  { k: "account", label: "Brevo account", pct: 25 },
  { k: "clean", label: "Clean old hooks", pct: 50 },
  { k: "register", label: "Register events", pct: 75 },
  { k: "verify", label: "Read back & verify", pct: 100 },
] as const;

function StepAutoHook({
  p,
  slug,
  v,
  data,
  onDone,
}: {
  p: P;
  slug: string;
  v: ProviderView | null;
  data: Data;
  onDone: () => void;
}) {
  const [checks, setChecks] = useState<CheckT[]>([]);
  const [done, setDone] = useState(-1); // index of last completed stage
  const [active, setActive] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const brevoFn = useServerFn(connectBrevoWebhook);
  const resendFn = useServerFn(connectResendWebhook);
  const fn = p === "brevo" ? brevoFn : resendFn;
  const refresh = useRefresh(slug);
  const accent = META[p].color;
  const pname = META[p].name;
  const stages =
    p === "brevo"
      ? BREVO_STAGES
      : BREVO_STAGES.map((s) => (s.k === "account" ? { ...s, label: "Resend account" } : s));
  const events = p === "brevo" ? data.brevoEvents : data.resendEvents;
  const busy = active !== null;
  const run = async () => {
    setChecks([]);
    setDone(-1);
    setFailed(null);
    setPct(2);
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      setActive(i);
      setPct((stages[i - 1]?.pct ?? 0) + 8);
      try {
        const r = await fn({ data: { slug, stage: st.k } });
        setChecks((c) => [...c, ...r.checks]);
        if (!r.ok) {
          setFailed(
            r.checks
              .filter((c) => !c.ok)
              .map((c) => `${c.label}: ${c.detail}`)
              .join(" · ") || `${st.label} failed.`,
          );
          setActive(null);
          return;
        }
        setDone(i);
        setPct(st.pct);
      } catch (e) {
        setFailed(`${st.label}: ${err(e)}`);
        setActive(null);
        return;
      }
    }
    setActive(null);
    await refresh();
    toast.success(`${pname} webhook connected`);
    setTimeout(onDone, 900);
  };
  const ok = done === stages.length - 1;
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] font-semibold text-muted-foreground">
        One click: the Console uses your {pname} API key to create this company's private webhook
        with every event, removes old ones, then reads it back from {pname} to confirm
        {p === "resend" ? " and saves the signing secret automatically" : ""} — nothing to copy or
        paste.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {events.map((e) => (
          <span
            key={e}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[11px] font-bold transition-colors",
              ok || v?.webhook_events.includes(e)
                ? "bg-status-converted/15 text-status-converted"
                : "bg-muted",
            )}
          >
            {e}
          </span>
        ))}
      </div>
      <Button
        disabled={busy}
        onClick={run}
        className="shadow-md transition-all hover:-translate-y-0.5 active:scale-95"
        style={{ background: accent }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Webhook className="size-4" />}{" "}
        {v?.webhook_verified_at ? "Re-check webhook" : "Connect webhook"}
      </Button>
      {(busy || done >= 0 || failed) && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 animate-in fade-in">
          <div className="flex items-center justify-between text-[12px] font-bold">
            <span className="flex items-center gap-1.5">
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" style={{ color: accent }} />
              ) : ok ? (
                <CheckCircle2 className="size-3.5 text-status-converted" />
              ) : (
                <XCircle className="size-3.5 text-destructive" />
              )}
              {busy
                ? `${stages[active!].label}…`
                : ok
                  ? "Webhook connected & verified"
                  : "Setup failed"}
            </span>
            <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${pct}%`,
                background: failed
                  ? "var(--color-destructive)"
                  : ok
                    ? "var(--color-status-converted)"
                    : accent,
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stages.map((st, i) => (
              <div
                key={st.k}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-bold transition-colors",
                  i <= done
                    ? "border-status-converted/30 bg-status-converted/10 text-status-converted"
                    : failed && i === done + 1
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : active === i
                        ? "border-border bg-background"
                        : "border-border text-muted-foreground",
                )}
              >
                {i <= done ? (
                  <Check className="size-3" />
                ) : active === i ? (
                  <Loader2 className="size-3 animate-spin" style={{ color: accent }} />
                ) : failed && i === done + 1 ? (
                  <XCircle className="size-3" />
                ) : (
                  <span className="size-3 rounded-full border border-current" />
                )}
                <span className="truncate">{st.label}</span>
              </div>
            ))}
          </div>
          {failed && <div className="text-[12px] font-semibold text-destructive">{failed}</div>}
          {failed && (
            <Button size="sm" variant="outline" onClick={run}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          )}
        </div>
      )}
      {checks.length > 0 && <Checks list={checks} />}
    </div>
  );
}

function InboxAddress({
  slug,
  accent,
  inbox,
  gmail,
}: {
  slug: string;
  accent: string;
  inbox: Data["inbox"];
  gmail: string | null;
}) {
  const loadDomains = useServerFn(getInboxDomains);
  const verify = useServerFn(verifyInboxRouting);
  const refresh = useRefresh(slug);
  const dq = useQuery({
    queryKey: ["inbox-domains", slug],
    queryFn: () => loadDomains({ data: { slug } }),
    enabled: !!gmail,
    staleTime: 60_000,
  });
  const domains = dq.data?.domains ?? [];
  const [editing, setEditing] = useState(!inbox);
  const [askChange, setAskChange] = useState(false);
  const [local, setLocal] = useState(inbox?.email.split("@")[0] ?? "hello");
  const [domain, setDomain] = useState(inbox?.email.split("@")[1] ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RoutingResult | null>(null);
  const stop = useRef(false);
  useEffect(() => () => void (stop.current = true), []);
  useEffect(() => {
    if (!domain && domains[0]) setDomain(domains[0].name);
  }, [domains, domain]);
  useEffect(() => {
    if (!name && dq.data?.senderName) setName(dq.data.senderName);
  }, [dq.data?.senderName, name]);

  const l = local.trim().toLowerCase();
  const n = name.trim();
  const localOk = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(l);
  const nameOk = n.length > 0 && n.length <= 80 && !/[<>"\r\n]/.test(n);
  const canRun = localOk && nameOk && !!domain && domains.some((d) => d.name === domain);

  const run = async (enableRouting = false) => {
    setBusy(true);
    setEditing(false);
    stop.current = false;
    try {
      let r = await verify({ data: { slug, local: l, domain, senderName: n, enableRouting } });
      const t0 = Date.now();
      while (r.stage === "destination_pending" && !stop.current && Date.now() - t0 < 180_000) {
        setRes(r);
        await new Promise((ok) => setTimeout(ok, 6000));
        r = await verify({ data: { slug, local: l, domain, senderName: n } });
      }
      setRes(r);
      if (r.stage === "verified") toast.success(r.message);
      await refresh();
    } catch (e) {
      setRes({ stage: "failed", message: err(e), steps: [] });
    } finally {
      setBusy(false);
    }
  };

  if (!gmail)
    return (
      <div className="relative mt-4 flex items-center gap-3 overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card opacity-60">
          <GmailMark className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-bold">In-app Gmail Inbox Address</h3>
          <div className="text-[11.5px] font-semibold text-muted-foreground">
            Connect this company's Google account above first. The address must be verified again after connecting.
          </div>
        </div>
      </div>
    );

  const cfMissing = dq.data && !dq.data.connected;
  const verified = !!inbox?.verified_at && !editing && !busy && res?.stage !== "failed";

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-background p-4">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: verified ? "var(--color-status-converted)" : accent }} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card">
          <GmailMark className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-bold">In-app Gmail Inbox Address</h3>
            {verified && (
              <span className="flex items-center gap-1 rounded-full bg-status-converted/15 px-2 py-0.5 text-[10.5px] font-bold text-status-converted">
                <CheckCircle2 className="size-3" /> Verified
              </span>
            )}
            {!inbox?.verified_at && inbox && !editing && !busy && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-600">Not verified</span>
            )}
          </div>
          <div className="truncate text-[11.5px] font-semibold text-muted-foreground">
            {inbox && !editing ? (
              <>
                {dq.data?.senderName && <span className="text-foreground">{dq.data.senderName} · </span>}
                <b className="font-mono text-foreground">{inbox.email}</b> → {gmail}
              </>
            ) : (
              <>Routed by Cloudflare Email Routing to {gmail}</>
            )}
          </div>
        </div>

        {!editing && inbox && (
          <div className="flex flex-wrap items-center gap-2 animate-in fade-in">
            <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy || !canRun}><TestLoader active={busy} /> Test</Button>
            <Button size="sm" variant="outline" className="h-9 shrink-0 gap-2 bg-card px-3 font-semibold text-foreground" onClick={() => setAskChange(true)}>
              <img src={switchAccountIcon.url} alt="" aria-hidden="true" width={20} height={20} className="size-5 shrink-0 object-contain" /> Change address
            </Button>
            {!inbox.verified_at && (
              <AutoVerifyButton busy={busy} disabled={!canRun || busy} onClick={() => void run()} />
            )}
            <ChangeInboxDialog
              open={askChange}
              email={inbox.email}
              verified={!!inbox.verified_at}
              onCancel={() => setAskChange(false)}
              onConfirm={() => {
                setAskChange(false);
                setRes(null);
                setEditing(true);
              }}
            />
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-4 animate-in fade-in slide-in-from-top-1">
          {cfMissing ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[12px] font-semibold text-muted-foreground">
              <Lock className="size-3.5" /> Connect Cloudflare above first — the address uses its domain.
            </div>
          ) : dq.isLoading ? (
            <div className="flex h-[60px] items-center gap-2 text-[12px] font-semibold text-muted-foreground">
              <TestLoader /> Loading Cloudflare domains…
            </div>
          ) : !domains.length ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[12px] font-semibold text-muted-foreground">
              No domains in the connected Cloudflare account.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="space-y-1">
                <span className="text-[11.5px] font-bold text-muted-foreground">Sender name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" className="h-9" />
              </label>
              <label className="space-y-1">
                <span className="text-[11.5px] font-bold text-muted-foreground">Sender email</span>
                <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-input bg-card focus-within:ring-1 focus-within:ring-ring">
                  <input
                    value={local}
                    onChange={(e) => setLocal(e.target.value.toLowerCase())}
                    placeholder="hello"
                    className="min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[13px] outline-none"
                    aria-label="Address before @"
                  />
                  {domains.length === 1 ? (
                    <span className="flex items-center gap-1 border-l border-border bg-muted/50 px-2.5 font-mono text-[12.5px] font-semibold text-muted-foreground">
                      @{domains[0].name} <Lock className="size-3" />
                    </span>
                  ) : (
                    <Select value={domain} onValueChange={setDomain}>
                      <SelectTrigger className="h-full w-auto rounded-none border-0 border-l border-border bg-muted/50 font-mono text-[12.5px] shadow-none">
                        <SelectValue placeholder="@domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {domains.map((d) => (
                          <SelectItem key={d.id} value={d.name} className="font-mono text-[12.5px]">@{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </label>
              <div className="flex gap-2">
                <AutoVerifyButton busy={busy} disabled={!canRun || busy} onClick={() => void run()} />
                {inbox && (
                  <DiscardCancelButton
                    dirty={`${l}@${domain}` !== inbox.email}
                    className="h-9 gap-1 font-bold"
                    onCancel={() => {
                      setLocal(inbox.email.split("@")[0]);
                      setDomain(inbox.email.split("@")[1]);
                      setEditing(false);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(busy || res) && !editing && (
        <div className="relative mt-3 grid gap-2 sm:grid-cols-3">
          {(["routing", "destination", "rule"] as const).map((id, i) => {
            const s = res?.steps.find((x) => x.id === id);
            const meta = {
              routing: { label: "Email Routing", img: cfRoutingIcon.url },
              destination: { label: "Destination address", img: null },
              rule: { label: "Routing rule", img: routingRuleIcon.url },
            }[id];
            const pending = busy && !s;
            const ok = s?.ok ?? null;
            return (
              <div
                key={id}
                style={{ animationDelay: `${i * 80}ms` }}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                  ok === true ? "border-status-converted/30" : ok === false ? "border-destructive/30" : "border-border",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute -right-8 -top-8 size-20 rounded-full blur-2xl",
                    ok === true ? "bg-status-converted/15" : ok === false ? "bg-destructive/15" : "bg-muted",
                  )}
                />
                <div className="relative flex items-center gap-2.5">
                  <span className="grid size-12 shrink-0 place-items-center overflow-visible rounded-lg border border-border bg-background p-1 shadow-sm transition-transform group-hover:scale-110">
                    {meta.img ? (
                      <img src={meta.img} alt="" className="size-full object-contain" />
                    ) : (
                      <GmailMark className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13px] font-bold">
                      {meta.label}
                      {ok === true ? (
                        <CheckCircle2 className="size-3.5 text-status-converted" />
                      ) : ok === false ? (
                        <XCircle className="size-3.5 text-destructive" />
                      ) : pending ? (
                        <TestLoader active className="size-4" />
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "text-[10.5px] font-bold uppercase tracking-wide",
                        ok === true ? "text-status-converted" : ok === false ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {ok === true ? "Working" : ok === false ? "Failed" : pending ? "Checking" : "Waiting"}
                    </div>
                  </div>
                </div>
                <p className="relative mt-2 break-words text-[11.5px] font-semibold text-muted-foreground">
                  {s?.detail ?? (pending ? "Checking…" : "Waiting for the previous step…")}
                </p>
              </div>
            );
          })}
          {res?.stage === "routing_off" && !busy && (
            <div className="sm:col-span-3">
              <Button size="sm" className="h-8" onClick={() => void run(true)}>
                <Sparkles className="size-3.5" /> Turn on Email Routing
              </Button>
            </div>
          )}
          {res?.stage === "failed" && !busy && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12px] font-semibold text-destructive sm:col-span-3">
              <XCircle className="mt-px size-3.5 shrink-0" />
              <span className="flex-1">{res.message}</span>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void run()}>
                <RefreshCw className="size-3.5" /> Retry
              </Button>
            </div>
          )}
          {res?.stage === "destination_pending" && !busy && (
            <div className="sm:col-span-3">
              <Button size="sm" variant="outline" className="h-8" onClick={() => void run()}>
                <RefreshCw className="size-3.5" /> Check again
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AutoVerifyButton({ busy, disabled, onClick }: { busy?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn("group inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-[12.5px] font-bold text-foreground shadow-sm transition-all hover:-translate-y-px hover:border-status-converted/40 hover:shadow-md disabled:pointer-events-none", busy ? "opacity-100" : "disabled:opacity-50")}
    >
      {busy ? <TestLoader className="size-5" tone="export" active /> : <img src={verifiedIcon.url} alt="" aria-hidden="true" width={20} height={20} className="size-5 shrink-0 object-contain transition-transform group-hover:scale-110 animate-in fade-in zoom-in-75" />}
      {busy ? "Verifying…" : "Auto-verify"}
      {!busy && <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
    </button>
  );
}

function FinanceSender({ slug, v }: { slug: string; v: ProviderView }) {
  const domain = (v.domain || v.sender_email.split("@")[1]).toLowerCase();
  const curEmail = v.finance_sender_email || v.sender_email;
  const curLocal = curEmail.split("@")[0];
  const curName = v.finance_sender_name || v.sender_name;
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(curLocal);
  const [name, setName] = useState(curName);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const save = useServerFn(setFinanceSender);
  const refresh = useRefresh(slug);
  const l = local.trim().toLowerCase();
  const n = name.trim();
  const localOk = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(l) && !l.includes("..");
  const nameOk = n.length >= 1 && n.length <= 80 && !/[<>"\r\n]/.test(n);
  const dirty = l !== curLocal || n !== curName;
  const reset = () => {
    setLocal(curLocal);
    setName(curName);
  };
  const submit = async () => {
    setBusy(true);
    try {
      await save({ data: { slug, email: `${l}@${domain}`, name: n } });
      await refresh();
      toast.success(`From now on invoices are sent from ${n} <${l}@${domain}>`);
      setEditing(false);
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusy(false);
    }
  };
  const isDefault = !v.finance_sender_email && !v.finance_sender_name;
  return (
    <div className="mt-auto border-t border-border pt-3 animate-in fade-in duration-300">
      {editing ? (
        <div className="mt-3 grid gap-3 animate-in fade-in sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11.5px] font-bold text-muted-foreground">Sender name</span>
            <Input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value.replace(/[<>"\r\n]/g, ""))}
              placeholder={v.sender_name}
            />
            {!nameOk && (
              <span className="block text-[11.5px] font-semibold text-destructive">
                Enter a name (up to 80 characters).
              </span>
            )}
          </label>
          <label className="space-y-1">
            <span className="text-[11.5px] font-bold text-muted-foreground">Sender email</span>
            <div
              className={cn(
                "flex h-9 overflow-hidden rounded-md border bg-background shadow-sm transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20",
                l && !localOk ? "border-destructive" : "border-input",
              )}
            >
              <input
                value={local}
                maxLength={64}
                aria-label="Sender email name"
                onChange={(e) =>
                  setLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._+-]/g, ""))
                }
                placeholder="finance"
                className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] outline-none focus:ring-1 focus:ring-inset focus:ring-brand"
              />
              <div
                aria-hidden
                className="flex shrink-0 select-none items-center gap-1.5 border-l border-brand/20 bg-brand/10 px-3 font-mono text-[13px] font-bold text-brand"
              >
                <ShieldCheck className="size-3.5" />@{domain}
              </div>
            </div>
            {l && !localOk && (
              <span className="block text-[11.5px] font-semibold text-destructive">
                Use letters, numbers, dot, dash or plus.
              </span>
            )}
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button
              size="sm"
              className="h-9"
              disabled={!localOk || !nameOk || busy || !dirty}
              onClick={submit}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{" "}
              Save
            </Button>
            <DiscardCancelButton
              dirty={dirty}
              disabled={busy}
              className="h-9 gap-1 font-bold"
              onCancel={() => {
                reset();
                setEditing(false);
              }}
            />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-brand/25 bg-brand/5 px-3 py-2.5 sm:col-span-2 animate-in fade-in">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-primary-foreground">
              {(n || "?").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Clients will see
              </div>
              <div className="truncate text-[14px] font-bold">
                {n || "…"}{" "}
                <span className="font-mono text-[12.5px] text-brand">
                  &lt;{l || "…"}@{domain}&gt;
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Send className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-[12.5px] font-semibold">
            <span className="text-muted-foreground">Invoice sender:</span> {curName}{" "}
            <span className="font-mono text-muted-foreground">&lt;{curEmail}&gt;</span>
            {isDefault && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                Default
              </span>
            )}
          </span>
          <Button size="sm" variant="outline" className="h-8 shrink-0 gap-2 bg-card px-3 font-semibold text-foreground" onClick={() => setAsk(true)}>
            <img src={switchAccountIcon.url} alt="" aria-hidden="true" width={20} height={20} className="size-5 shrink-0 object-contain" /> Change sender
          </Button>
          <ChangeConfirm
            open={ask}
            title="Change finance sender?"
            icon={Send}
            subject={`${curName} <${curEmail}>`}
            confirmLabel="Change sender"
            points={[
              `${curName} <${curEmail}> stops sending invoices as soon as you save.`,
              `From that moment every invoice email and reminder goes out from the new name and address.`,
              `The address always stays on the Resend-verified domain @${domain}.`,
              "Lead and Inbox mail keep using the default sender.",
              "Invoices already sent and their delivery history stay unchanged.",
            ]}
            onCancel={() => setAsk(false)}
            onConfirm={() => {
              setAsk(false);
              reset();
              setEditing(true);
            }}
          />
        </div>
      )}
    </div>
  );
}

const FLOW_STAGES = [
  { label: "Verifying API key & domain", pct: 25 },
  { label: "Checking account & webhooks", pct: 50 },
  { label: "Registering & enabling webhook", pct: 75 },
  { label: "Saving signing secret", pct: 100 },
] as const;

type FlowPhase = "idle" | "key" | "run" | "name" | "saving";

function InlineConnect({
  p,
  slug,
  v,
  data,
  locked,
  onFlowing,
}: {
  p: P;
  slug: string;
  v: ProviderView | null;
  data: Data;
  locked: boolean;
  onFlowing: (f: boolean) => void;
}) {
  const m = META[p];
  const verify = useServerFn(verifyEmailProvider);
  const resendFn = useServerFn(connectResendWebhook);
  const brevoFn = useServerFn(connectBrevoWebhook);
  const hook = p === "resend" ? resendFn : brevoFn;
  const refresh = useRefresh(slug);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [key, setKey] = useState("");
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(data.company.name);
  const keyRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const email = data.inbox?.email ?? "";

  useEffect(() => {
    if (phase === "key") setTimeout(() => keyRef.current?.focus(), 250);
    if (phase === "name") setTimeout(() => nameRef.current?.select(), 250);
  }, [phase]);

  const fail = (msg: string) => {
    setError(msg);
    setPhase("key");
    onFlowing(false);
  };

  const run = async () => {
    if (!key.trim()) return;
    setError(null);
    setPhase("run");
    onFlowing(true);
    setStage(0);
    setPct(6);
    try {
      const r = await verify({
        data: {
          slug,
          provider: p,
          senderName: p === "brevo" ? "" : v?.sender_name || data.company.name,
          senderEmail: email,
          apiKey: key.trim(),
        },
      });
      if (!r.ok)
        return fail(
          r.checks
            .filter((c) => !c.ok)
            .map((c) => `${c.label}: ${c.detail}`)
            .join(" · ") || "Verification failed.",
        );
      if (r.senderName) setName(r.senderName);
      setPct(25);
      const steps: { s: "account" | "clean" | "register" | "verify"; at: number }[] = [
        { s: "account", at: 1 },
        { s: "clean", at: 1 },
        { s: "register", at: 2 },
        { s: "verify", at: 3 },
      ];
      for (const st of steps) {
        setStage(st.at);
        setPct((x) => Math.max(x, FLOW_STAGES[st.at - 1].pct + 6));
        const w = await hook({ data: { slug, stage: st.s } });
        if (!w.ok)
          return fail(
            w.checks
              .filter((c) => !c.ok)
              .map((c) => `${c.label}: ${c.detail}`)
              .join(" · ") || "Webhook setup failed.",
          );
        if (st.s !== "account") setPct(FLOW_STAGES[st.at].pct);
      }
      setKey("");
      await new Promise((res) => setTimeout(res, 450));
      if (p === "resend") {
        setPhase("name");
      } else {
        await refresh();
        toast.success(`${m.name} connected`);
        setPhase("idle");
        onFlowing(false);
      }
    } catch (e) {
      fail(err(e));
    }
  };

  const saveName = async () => {
    if (!name.trim()) return;
    setPhase("saving");
    try {
      const r = await verify({
        data: { slug, provider: p, senderName: name.trim(), senderEmail: email },
      });
      if (!r.ok) {
        toast.error(r.checks.find((c) => !c.ok)?.detail ?? "Could not save sender name");
        setPhase("name");
        return;
      }
      await refresh();
      toast.success(`${m.name} connected`);
      setPhase("idle");
      onFlowing(false);
    } catch (e) {
      toast.error(err(e));
      setPhase("name");
    }
  };

  const wide = phase !== "idle";
  const btnStyle = { background: m.color };

  return (
    <div className="relative ml-auto w-full sm:w-auto">
      <div
        className={cn(
          "relative ml-auto h-9 overflow-hidden rounded-lg transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          wide ? "w-full sm:w-[440px]" : "w-full sm:w-[200px]",
        )}
      >
        {/* idle button */}
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            setError(null);
            setPhase("key");
          }}
          style={btnStyle}
          className={cn(
            "absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg text-[13px] text-primary-foreground shadow-sm transition-all duration-300 hover:brightness-110 active:scale-[0.98] disabled:opacity-50",
            wide ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          {p === "resend" ? (
            <>
              <img src={resendMarkWhite.url} alt="" className="size-4 object-contain" />
              <span className="font-semibold tracking-tight">Connect</span>
              <img src={resendWordmarkWhite.url} alt="Resend" className="h-3 w-auto" />
            </>
          ) : (
            <>
              <span className="grid size-5 place-items-center rounded-full bg-card">
                <img src={brevoIcon.url} alt="" className="size-4 object-contain" />
              </span>
              <span className="font-semibold tracking-tight">Connect</span>
              <span className="inline-flex items-center rounded-full bg-card px-1.5 py-0.5">
                <img src={brevoWordmark.url} alt="Brevo" className="h-2.5 w-auto" />
              </span>
            </>
          )}
        </button>

        {/* key / name input */}
        <div
          className={cn(
            "absolute inset-0 flex items-center gap-1.5 transition-opacity duration-300",
            phase === "key" || phase === "name" || phase === "saving"
              ? "opacity-100 delay-150"
              : "pointer-events-none opacity-0",
          )}
        >
          {phase === "name" || phase === "saving" ? (
            <>
              <div className="relative h-9 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Sender
                </span>
                <input
                  ref={nameRef}
                  value={name}
                  maxLength={80}
                  disabled={phase === "saving"}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void saveName()}
                  aria-label="Sender name"
                  className="h-9 w-full rounded-lg border border-border bg-card pl-[68px] pr-3 text-[13px] font-semibold outline-none transition-colors focus:border-brand"
                />
              </div>
              <button
                type="button"
                onClick={() => void saveName()}
                disabled={!name.trim() || phase === "saving"}
                style={btnStyle}
                className="flex h-9 w-[92px] shrink-0 items-center justify-center gap-1 rounded-lg text-[12.5px] font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
              >
                {phase === "saving" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    Save <Check className="size-3.5" />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <div className="relative h-9 flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={keyRef}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void run();
                    if (e.key === "Escape") setPhase("idle");
                  }}
                  placeholder={m.keyPh}
                  aria-label={`${m.name} API key`}
                  className={cn(
                    "h-9 w-full rounded-lg border bg-card pl-8 pr-3 font-mono text-[12.5px] outline-none transition-colors",
                    error ? "border-destructive" : "border-border focus:border-brand",
                  )}
                />
              </div>
              <button
                type="button"
                onClick={() => void run()}
                disabled={!key.trim()}
                style={btnStyle}
                className="flex h-9 w-[92px] shrink-0 items-center justify-center rounded-lg text-[12.5px] font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
              >
                Connect
              </button>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => {
                  setPhase("idle");
                  setKey("");
                  setError(null);
                }}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </>
          )}
        </div>

        {/* progress */}
        <div
          className={cn(
            "absolute inset-0 overflow-hidden rounded-lg border border-border bg-card transition-opacity duration-300",
            phase === "run" ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: `color-mix(in oklab, ${m.color} 16%, transparent)`,
            }}
          />
          <div
            className="absolute bottom-0 left-0 h-0.5 transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%`, background: m.color }}
          />
          <div className="relative flex h-full items-center gap-2 px-3">
            {pct >= 100 ? (
              <CheckCircle2 className="size-4 shrink-0 text-status-converted" />
            ) : (
              <TestLoader className="size-5" />
            )}
            <span
              key={stage}
              className="flex-1 truncate text-[12.5px] font-semibold animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              {pct >= 100 ? "Connected" : FLOW_STAGES[stage].label}
            </span>
            <span className="font-mono text-[12px] font-bold tabular-nums" style={{ color: m.color }}>
              {pct}%
            </span>
          </div>
        </div>
      </div>
      {error && (
        <p className="absolute right-0 top-full mt-2 flex w-max max-w-[min(760px,calc(100vw-8rem))] items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-left text-[12px] font-semibold leading-snug text-destructive animate-in fade-in slide-in-from-top-1" title={error}>
          <XCircle className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
