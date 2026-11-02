import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check, CheckCircle2, ChevronDown, Copy, Inbox, KeyRound, Loader2, Lock, Mail, Pencil, RefreshCw,
  Send, ShieldCheck, Star, Unplug, Webhook, X, XCircle, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkInboundRouting, connectBrevoWebhook, disconnectProvider, getEmailIntegrations, sendProviderTest,
  setDefaultProvider, verifyEmailProvider, verifyResendWebhook, type Check as CheckT, type ProviderView,
} from "@/lib/company-email.functions";
import { cn } from "@/lib/utils";

type P = "resend" | "brevo";
const META: Record<P, { name: string; color: string; tag: string; keyPh: string; keyHelp: string }> = {
  resend: { name: "Resend", color: "#111827", tag: "Developer email API", keyPh: "re_…", keyHelp: "Resend → API Keys → Create (Full access)" },
  brevo: { name: "Brevo", color: "#0B996E", tag: "Transactional email (v3)", keyPh: "xkeysib-…", keyHelp: "Brevo → Settings → SMTP & API → API keys" },
};
const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function EmailIntegrations({ slug, accent }: { slug: string; accent: string }) {
  const fn = useServerFn(getEmailIntegrations);
  const q = useQuery({ queryKey: ["company-email", slug], queryFn: () => fn({ data: { slug } }) });
  const [open, setOpen] = useState<P | null>(null);
  if (q.isLoading) return <div className="grid h-40 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (q.error || !q.data) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-[13px] font-semibold text-destructive">{err(q.error)}</div>;
  const d = q.data;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
        <span className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${accent} 16%, transparent)` }} />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${accent} 15%, transparent)`, color: accent }}><Mail className="size-5" /></span>
          <div className="flex-1">
            <h2 className="text-[16px] font-bold">Email Settings</h2>
            <p className="text-[12px] font-semibold text-muted-foreground">Used only for {d.company.name}'s Leads, Invoices and Inbox replies. Connect one or both.</p>
          </div>
        </div>
        <div className="relative mt-4 grid gap-3 md:grid-cols-2">
          {(["resend", "brevo"] as P[]).map((p) => (
            <ProviderCard key={p} p={p} v={d[p]} on={open === p} onClick={() => setOpen(open === p ? null : p)} />
          ))}
        </div>
      </section>

      {open && (
        <div key={open} className="animate-in fade-in slide-in-from-top-2 duration-300">
          <Setup p={open} slug={slug} v={d[open]} data={d} both={!!d.resend && !!d.brevo} />
        </div>
      )}
    </div>
  );
}

function status(v: ProviderView | null) {
  if (!v) return { label: "Not configured", cls: "bg-muted text-muted-foreground" };
  if (v.domain_verified_at && v.webhook_verified_at) return { label: "Connected", cls: "bg-status-converted/15 text-status-converted" };
  return { label: "Action required", cls: "bg-amber-500/15 text-amber-600" };
}

function ProviderCard({ p, v, on, onClick }: { p: P; v: ProviderView | null; on: boolean; onClick: () => void }) {
  const m = META[p]; const s = status(v);
  return (
    <button onClick={onClick}
      className={cn("group relative overflow-hidden rounded-xl border bg-background p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]",
        on ? "border-transparent shadow-lg ring-2" : "border-border")}
      style={on ? { ["--tw-ring-color" as string]: m.color } : undefined}>
      <span className="absolute inset-x-0 top-0 h-1 transition-all group-hover:h-1.5" style={{ background: m.color }} />
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg shadow-md transition-transform group-hover:rotate-6" style={{ background: m.color }}><ProviderLogo p={p} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[14px] font-bold">{m.name}{v?.is_default && <Star className="size-3.5 fill-brand text-brand" />}</div>
          {v && <div className="truncate text-[11.5px] font-semibold text-muted-foreground">{`${v.sender_name} <${v.sender_email}>`}</div>}
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", s.cls)}>{s.label}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", on && "rotate-180")} />
      </div>
    </button>
  );
}

type Data = Awaited<ReturnType<typeof getEmailIntegrations>>;

function Setup({ p, slug, v, data, both }: { p: P; slug: string; v: ProviderView | null; data: Data; both: boolean }) {
  const m = META[p];
  const step1 = !!v?.domain_verified_at, step2 = !!v?.webhook_verified_at;
  const [step, setStep] = useState(step1 ? (step2 ? 3 : 2) : 1);
  const steps: { n: number; label: string; icon: LucideIcon; done: boolean }[] = [
    { n: 1, label: "Sender & API key", icon: KeyRound, done: step1 },
    { n: 2, label: "Webhook", icon: Webhook, done: step2 },
    { n: 3, label: "Test & Inbox", icon: Inbox, done: step1 && step2 },
  ];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-1 border-b border-border p-2">
        {steps.map((s, i) => {
          const on = step === s.n; const locked = s.n > 1 && !step1;
          return (
            <div key={s.n} className="flex flex-1 items-center gap-1">
              <button disabled={locked} onClick={() => setStep(s.n)}
                className={cn("flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                  on ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60")}>
                <span className={cn("grid size-6 place-items-center rounded-full text-[11px] transition-all", s.done ? "bg-status-converted text-primary-foreground" : on ? "text-primary-foreground" : "bg-muted")}
                  style={!s.done && on ? { background: m.color } : undefined}>
                  {s.done ? <Check className="size-3.5" /> : s.n}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < 2 && <span className={cn("h-0.5 w-6 rounded-full transition-colors", s.done ? "bg-status-converted" : "bg-border")} />}
            </div>
          );
        })}
      </div>
      <div key={step} className="p-5 animate-in fade-in slide-in-from-right-2 duration-300">
        {step === 1 && <StepKey p={p} slug={slug} v={v} onDone={() => setStep(2)} />}
        {step === 2 && (p === "resend" ? <StepResendHook slug={slug} v={v} data={data} onDone={() => setStep(3)} /> : <StepBrevoHook slug={slug} v={v} data={data} onDone={() => setStep(3)} />)}
        {step === 3 && <StepFinish p={p} slug={slug} v={v} both={both} inbox={data.inboxGmail} />}
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
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
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
        <li key={c.id} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] animate-in fade-in slide-in-from-left-1",
          c.ok ? "border-status-converted/30 bg-status-converted/5" : "border-destructive/30 bg-destructive/5")} style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}>
          {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-converted" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
          <span><b>{c.label}</b> <span className="font-semibold text-muted-foreground">— {c.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}

function SecretBox({ value, onChange, placeholder, savedHint }: { value: string; onChange: (v: string) => void; placeholder: string; savedHint: string | null }) {
  const [editing, setEditing] = useState(!savedHint);
  if (!editing && savedHint) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <Lock className="size-3.5 text-status-converted" />
        <code className="flex-1 font-mono text-[12.5px] font-semibold">{savedHint}</code>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Replace</Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Input type="password" autoComplete="off" spellCheck={false} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      {savedHint && <Button size="icon" variant="ghost" onClick={() => { onChange(""); setEditing(false); }} aria-label="Cancel"><X className="size-4" /></Button>}
    </div>
  );
}

function StepKey({ p, slug, v, onDone }: { p: P; slug: string; v: ProviderView | null; onDone: () => void }) {
  const m = META[p];
  const [name, setName] = useState(v?.sender_name ?? "");
  const [email, setEmail] = useState(v?.sender_email ?? "");
  const [key, setKey] = useState("");
  const [checks, setChecks] = useState<CheckT[] | null>(null);
  const [busy, setBusy] = useState(false);
  const verify = useServerFn(verifyEmailProvider);
  const refresh = useRefresh(slug);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const can = name.trim() && emailOk && (key.trim() || v?.api_key_hint);
  const run = async () => {
    setBusy(true); setChecks(null);
    try {
      const r = await verify({ data: { slug, provider: p, senderName: name.trim(), senderEmail: email.trim(), apiKey: key.trim() || undefined } });
      setChecks(r.checks);
      if (r.ok) { setKey(""); await refresh(); toast.success(`${m.name} verified & saved`); setTimeout(onDone, 700); }
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Field label="Sender name" hint="Shown as the From name, e.g. Admakai"><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Admakai" /></Field>
        <Field label="Sender email address" hint="Use the same address that is routed to the Inbox (e.g. hello@admakai.com)."><Input value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} placeholder="hello@admakai.com" /></Field>
        <Field label="API key" hint={m.keyHelp}><SecretBox value={key} onChange={setKey} placeholder={m.keyPh} savedHint={v?.api_key_hint ?? null} /></Field>
        <Button disabled={!can || busy} onClick={run} className="shadow-md transition-all hover:-translate-y-0.5 active:scale-95" style={{ background: m.color }}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Verify
        </Button>
        <Checks list={checks} />
      </div>
      <Tips p={p} />
    </div>
  );
}

function Tips({ p }: { p: P }) {
  const items = p === "resend"
    ? ["Create a Full access key — sending-only keys can't confirm domains or webhooks.", "The sender's domain must be Verified in Resend → Domains.", "Key is checked live, then encrypted. You'll only see a masked hint."]
    : ["Create a v3 API key (xkeysib-…).", "Sender must be active and its domain authenticated in Brevo.", "If you use Authorised IPs in Brevo, deactivate the restriction for API keys."];
  return (
    <aside className="space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <div className="text-[12px] font-bold">Before you verify</div>
      {items.map((t) => <div key={t} className="flex gap-2 text-[12px] font-semibold text-muted-foreground"><Check className="mt-0.5 size-3.5 shrink-0 text-status-converted" />{t}</div>)}
    </aside>
  );
}

function CopyRow({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <code className="flex-1 truncate font-mono text-[12px] font-semibold">{value}</code>
      <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
        {done ? <Check className="size-3.5 text-status-converted" /> : <Copy className="size-3.5" />} {done ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function StepResendHook({ slug, v, data, onDone }: { slug: string; v: ProviderView | null; data: Data; onDone: () => void }) {
  const [secret, setSecret] = useState("");
  const [checks, setChecks] = useState<CheckT[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(verifyResendWebhook);
  const refresh = useRefresh(slug);
  const run = async () => {
    setBusy(true); setChecks(null);
    try {
      const r = await fn({ data: { slug, secret: secret.trim() || undefined } });
      setChecks(r.checks);
      if (r.ok) { setSecret(""); await refresh(); toast.success("Webhook connected"); setTimeout(onDone, 700); }
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <ol className="space-y-3 text-[12.5px] font-semibold">
        <li><b>1.</b> Resend → <b>Webhooks</b> → <b>Add Webhook</b>, paste this endpoint:</li>
        <CopyRow value={data.resendWebhookUrl} />
        <li><b>2.</b> Select these events:</li>
        <div className="flex flex-wrap gap-1.5">
          {data.resendEvents.map((e) => (
            <span key={e} className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-bold", v?.webhook_events.includes(e) ? "bg-status-converted/15 text-status-converted" : "bg-muted")}>{e}</span>
          ))}
        </div>
        <li><b>3.</b> Save, open the webhook and copy its <b>Signing Secret</b> (whsec_…) here:</li>
      </ol>
      <SecretBox value={secret} onChange={setSecret} placeholder="whsec_…" savedHint={v?.webhook_secret_hint ?? null} />
      <Button disabled={busy || (!secret.trim() && !v?.webhook_secret_hint)} onClick={run} className="shadow-md transition-all hover:-translate-y-0.5 active:scale-95">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Verify webhook
      </Button>
      <Checks list={checks} />
    </div>
  );
}

function StepBrevoHook({ slug, v, data, onDone }: { slug: string; v: ProviderView | null; data: Data; onDone: () => void }) {
  const [checks, setChecks] = useState<CheckT[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(connectBrevoWebhook);
  const refresh = useRefresh(slug);
  const run = async () => {
    setBusy(true); setChecks(null);
    try {
      const r = await fn({ data: { slug } });
      setChecks(r.checks);
      if (r.ok) { await refresh(); toast.success("Brevo webhook connected"); setTimeout(onDone, 700); }
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] font-semibold text-muted-foreground">
        Brevo doesn't issue signing secrets, so the Console creates the transactional webhook for you through the API with a private, encrypted token — nothing to copy or paste.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {data.brevoEvents.map((e) => (
          <span key={e} className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-bold", v?.webhook_events.includes(e) ? "bg-status-converted/15 text-status-converted" : "bg-muted")}>{e}</span>
        ))}
      </div>
      <Button disabled={busy} onClick={run} className="shadow-md transition-all hover:-translate-y-0.5 active:scale-95" style={{ background: META.brevo.color }}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Webhook className="size-4" />} {v?.webhook_verified_at ? "Re-check webhook" : "Create & verify webhook"}
      </Button>
      <Checks list={checks} />
    </div>
  );
}

function StepFinish({ p, slug, v, both, inbox }: { p: P; slug: string; v: ProviderView | null; both: boolean; inbox: string }) {
  const test = useServerFn(sendProviderTest);
  const route = useServerFn(checkInboundRouting);
  const def = useServerFn(setDefaultProvider);
  const disc = useServerFn(disconnectProvider);
  const refresh = useRefresh(slug);
  const [busy, setBusy] = useState<string | null>(null);
  const [routing, setRouting] = useState<{ state: string; message: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!v) return null;
  const act = async (id: string, f: () => Promise<unknown>) => { setBusy(id); try { await f(); } catch (e) { toast.error(err(e)); } finally { setBusy(null); } };
  const routed = routing?.state === "routed";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Tile icon={Send} title="Send a test email" body={`Sends from ${v.sender_name} <${v.sender_email}> to your own address.`}>
        <Button size="sm" disabled={!!busy} onClick={() => act("test", async () => { const r = await test({ data: { slug, provider: p } }); toast.success(`Test sent to ${r.to}`); })}>
          {busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send test
        </Button>
      </Tile>

      <Tile icon={Inbox} title="Inbox routing" body={`Replies to ${v.sender_email} must forward to ${inbox} so they land in this company's Inbox.`}>
        {routing && (
          <div className={cn("mb-2 rounded-md px-2.5 py-1.5 text-[12px] font-bold animate-in fade-in", routed ? "bg-status-converted/10 text-status-converted" : "bg-amber-500/10 text-amber-700")}>
            {routing.message}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("chk", async () => setRouting(await route({ data: { slug, email: v.sender_email, create: false } })))}>
            {busy === "chk" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Check
          </Button>
          {routing && !routed && ["missing", "wrong_target"].includes(routing.state) && (
            <Button size="sm" disabled={!!busy} onClick={() => act("mk", async () => { const r = await route({ data: { slug, email: v.sender_email, create: true } }); setRouting(r); if (r.state === "routed") toast.success("Routing rule created"); })}>
              {busy === "mk" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Create rule
            </Button>
          )}
        </div>
      </Tile>

      {both && (
        <Tile icon={Star} title="Default provider" body="Used automatically for this company's mail; the other stays as a manual option.">
          <Button size="sm" variant={v.is_default ? "secondary" : "default"} disabled={v.is_default || !!busy}
            onClick={() => act("def", async () => { await def({ data: { slug, provider: p } }); await refresh(); toast.success(`${META[p].name} is now default`); })}>
            <Star className={cn("size-3.5", v.is_default && "fill-brand text-brand")} /> {v.is_default ? "Default" : "Make default"}
          </Button>
        </Tile>
      )}

      <Tile icon={Unplug} title="Disconnect" body="Erases the stored key and secret. History and activity logs stay intact.">
        {confirm ? (
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => act("dc", async () => { await disc({ data: { slug, provider: p } }); await refresh(); toast.success("Disconnected"); })}>Confirm</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        ) : <Button size="sm" variant="outline" onClick={() => setConfirm(true)}><Unplug className="size-3.5" /> Disconnect</Button>}
      </Tile>
    </div>
  );
}

function Tile({ icon: I, title, body, children }: { icon: LucideIcon; title: string; body: string; children: ReactNode }) {
  return (
    <div className="group rounded-xl border border-border bg-background p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2 text-[13px] font-bold"><I className="size-4 text-brand transition-transform group-hover:scale-110" />{title}</div>
      <p className="mb-3 mt-1 text-[12px] font-semibold text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
