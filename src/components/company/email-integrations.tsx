import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check, CheckCircle2, ChevronDown, Copy, Inbox, KeyRound, Loader2, Lock, Mail, Pencil, RefreshCw,
  Send, ShieldCheck, Star, Unplug, Webhook, X, XCircle, type LucideIcon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  connectBrevoWebhook, connectResendWebhook, disconnectProvider, previewProviderDisconnect, getEmailIntegrations,
  setDefaultProvider, verifyEmailProvider, sendInboxProbe, pollInboxProbe, type Check as CheckT, type ProviderView,
} from "@/lib/company-email.functions";
import { cn } from "@/lib/utils";
import { GoogleAccountCard, GoogleMark, GmailMark } from "@/components/company/google-account-card";
import resendLogo from "@/assets/email/resend.webp.asset.json";
import brevoLogo from "@/assets/email/brevo.webp.asset.json";
import { ProviderTest } from "@/components/company/provider-test";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";

function ChangeInboxDialog({ open, email, verified, onCancel, onConfirm }: { open: boolean; email: string; verified: boolean; onCancel: () => void; onConfirm: () => void }) {
  const points = [
    `${email} stops being the company Inbox address as soon as you save a new one.`,
    ...(verified ? ["The new address must pass automatic verification before mail works again."] : []),
    "Sender Email for Resend and Brevo switches to the new address — re-verify the sender and domain there.",
    "Leads and Invoice emails stay paused for this company until the new sender is verified.",
    "Update your email routing so the new address forwards to the connected Gmail, or replies won't arrive.",
    "Past mail, replies and delivery history stay unchanged.",
  ];
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="overflow-hidden p-0 sm:max-w-md">
        <div className="relative bg-primary/5 px-6 pb-4 pt-6">
          <span className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-primary/25 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-primary/30 bg-card text-primary shadow-sm animate-in zoom-in-75 duration-300"><Mail className="size-5" /></span>
            <div className="min-w-0">
              <AlertDialogTitle className="text-[15px] font-bold">Change Inbox address?</AlertDialogTitle>
              <AlertDialogDescription className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-semibold">
                <Inbox className="size-3.5 shrink-0" /> {email}
                {verified && <CheckCircle2 className="size-3.5 shrink-0 text-status-converted" />}
              </AlertDialogDescription>
            </div>
          </div>
        </div>
        <ul className="space-y-2 px-6 py-4">
          {points.map((t, i) => (
            <li key={t} style={{ animationDelay: `${i * 70}ms` }} className="flex items-start gap-2 text-[12.5px] font-semibold text-foreground animate-in fade-in slide-in-from-left-2 fill-mode-both">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", i === points.length - 1 ? "bg-status-converted" : "bg-primary")} />
              {t}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onConfirm} className="transition-transform active:scale-95"><Pencil className="size-3.5" /> Change address</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
          <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card"><GoogleMark className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold">Email & Calendar</h2>
          </div>
        </div>
        <GoogleAccountCard slug={slug} accent={accent} fallback="brantatech@gmail.com" />
        <InboxAddress slug={slug} accent={accent} inbox={d.inbox} gmail={d.inboxGmail} />
        {!d.inbox?.verified_at && (
          <div className="relative mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[12px] font-semibold text-muted-foreground">
            <Lock className="size-3.5" /> Verify the Inbox address first — Resend and Brevo unlock after that.
          </div>
        )}
        <div className={cn("relative mt-4 grid gap-3 md:grid-cols-2 transition-opacity", !d.inbox?.verified_at && "pointer-events-none opacity-40")}>
          {(["resend", "brevo"] as P[]).map((p) => (
            <ProviderCard key={p} p={p} v={d[p]} on={open === p} onClick={() => setOpen(open === p ? null : p)} />
          ))}
        </div>
      </section>

      {open && d.inbox?.verified_at && (
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
    <Button variant="outline" onClick={onClick} aria-expanded={on}
      className={cn("group relative block h-auto w-full overflow-hidden whitespace-normal rounded-md border bg-background p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]",
        on ? "border-transparent shadow-lg ring-2" : "border-border")}
      style={on ? { ["--tw-ring-color" as string]: m.color } : undefined}>
      <span className="absolute inset-x-0 top-0 h-1 transition-all group-hover:h-1.5" style={{ background: m.color }} />
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card"><ProviderLogo p={p} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[14px] font-bold">{m.name}{v?.is_default && <Star className="size-3.5 fill-brand text-brand" />}</div>
          {v && <div className="truncate text-[11.5px] font-semibold text-muted-foreground">{`${v.sender_name} <${v.sender_email}>`}</div>}
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", s.cls)}>{s.label}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", on && "rotate-180")} />
      </div>
    </Button>
  );
}

function ProviderLogo({ p }: { p: P }) {
  const logo = p === "resend" ? resendLogo : brevoLogo;
  return <img src={logo.url} alt={`${META[p].name} logo`} width={32} height={32} className="size-8 object-contain" />;
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
        {step === 1 && <StepKey p={p} slug={slug} v={v} inboxEmail={data.inbox!.email} companyName={data.company.name} onDone={() => setStep(2)} />}
        {step === 2 && (p === "resend" ? <StepAutoHook p="resend" slug={slug} v={v} data={data} onDone={() => setStep(3)} /> : <StepAutoHook p="brevo" slug={slug} v={v} data={data} onDone={() => setStep(3)} />)}
        {step === 3 && <StepFinish p={p} slug={slug} v={v} both={both} />}
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

function StepKey({ p, slug, v, inboxEmail, companyName, onDone }: { p: P; slug: string; v: ProviderView | null; inboxEmail: string; companyName: string; onDone: () => void }) {
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
    setBusy(true); setChecks(null);
    try {
      const r = await verify({ data: { slug, provider: p, senderName: brevo ? "" : name.trim(), senderEmail: email.trim(), apiKey: key.trim() || undefined } });
      setChecks(r.checks);
      if (r.senderName) setName(r.senderName);
      if (r.ok) { setKey(""); await refresh(); toast.success(`${m.name} verified & saved`); setTimeout(onDone, 900); }
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
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
                <span className="flex items-center gap-1 rounded-full bg-status-converted/15 px-2 py-0.5 text-[10.5px] font-bold text-status-converted"><CheckCircle2 className="size-3" /> Verified in Brevo</span>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-md border px-3 py-2.5" style={{ borderColor: `color-mix(in oklab, ${m.color} 35%, transparent)`, background: `linear-gradient(110deg, color-mix(in oklab, ${m.color} 10%, transparent), color-mix(in oklab, var(--color-primary) 8%, transparent))` }}>
                <div className="flex items-start gap-2">
                  {busy ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" style={{ color: m.color }} /> : <Sparkles className="mt-0.5 size-3.5 shrink-0" style={{ color: m.color }} />}
                  <span className="text-[12.5px] font-semibold">
                    <b style={{ color: m.color }}>Auto-filled from Brevo.</b> Once the API key is verified, the sender name saved in your Brevo account appears here automatically.
                  </span>
                </div>
              </div>
            )}
          </Field>
        ) : (
          <Field label="Sender name" hint="Pre-filled with the company name — edit if you want a different From name"><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Admakai" /></Field>
        )}
        <Field label="Sender email address" hint="Locked to the verified Inbox address so client replies always land in the Inbox.">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <Lock className="size-3.5 text-status-converted" />
            <span className="flex-1 truncate text-[13px] font-semibold">{email}</span>
            <CheckCircle2 className="size-4 text-status-converted" />
          </div>
        </Field>
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
    : ["Brevo → Settings → SMTP & API → API keys → Generate a v3 key (xkeysib-…) with No expiration and Full access.", "The Inbox address must be an active sender in Brevo, with its domain authenticated (DKIM/DMARC).", "The sender name is read from Brevo — set it there.", "If you use Authorised IPs in Brevo, deactivate the restriction for API keys."];
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

const BREVO_STAGES = [
  { k: "account", label: "Brevo account", pct: 25 },
  { k: "clean", label: "Clean old hooks", pct: 50 },
  { k: "register", label: "Register events", pct: 75 },
  { k: "verify", label: "Read back & verify", pct: 100 },
] as const;

function StepAutoHook({ p, slug, v, data, onDone }: { p: P; slug: string; v: ProviderView | null; data: Data; onDone: () => void }) {
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
  const stages = p === "brevo" ? BREVO_STAGES : BREVO_STAGES.map((s) => (s.k === "account" ? { ...s, label: "Resend account" } : s));
  const events = p === "brevo" ? data.brevoEvents : data.resendEvents;
  const busy = active !== null;
  const run = async () => {
    setChecks([]); setDone(-1); setFailed(null); setPct(2);
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      setActive(i);
      setPct((stages[i - 1]?.pct ?? 0) + 8);
      try {
        const r = await fn({ data: { slug, stage: st.k } });
        setChecks((c) => [...c, ...r.checks]);
        if (!r.ok) {
          setFailed(r.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`).join(" · ") || `${st.label} failed.`);
          setActive(null); return;
        }
        setDone(i); setPct(st.pct);
      } catch (e) { setFailed(`${st.label}: ${err(e)}`); setActive(null); return; }
    }
    setActive(null);
    await refresh(); toast.success(`${pname} webhook connected`); setTimeout(onDone, 900);
  };
  const ok = done === stages.length - 1;
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] font-semibold text-muted-foreground">
        One click: the Console uses your {pname} API key to create this company's private webhook with every event, removes old ones, then reads it back from {pname} to confirm{p === "resend" ? " and saves the signing secret automatically" : ""} — nothing to copy or paste.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {events.map((e) => (
          <span key={e} className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-bold transition-colors", ok || v?.webhook_events.includes(e) ? "bg-status-converted/15 text-status-converted" : "bg-muted")}>{e}</span>
        ))}
      </div>
      <Button disabled={busy} onClick={run} className="shadow-md transition-all hover:-translate-y-0.5 active:scale-95" style={{ background: accent }}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Webhook className="size-4" />} {v?.webhook_verified_at ? "Re-check webhook" : "Connect webhook"}
      </Button>
      {(busy || done >= 0 || failed) && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 animate-in fade-in">
          <div className="flex items-center justify-between text-[12px] font-bold">
            <span className="flex items-center gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" style={{ color: accent }} /> : ok ? <CheckCircle2 className="size-3.5 text-status-converted" /> : <XCircle className="size-3.5 text-destructive" />}
              {busy ? `${stages[active!].label}…` : ok ? "Webhook connected & verified" : "Setup failed"}
            </span>
            <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: failed ? "var(--color-destructive)" : ok ? "var(--color-status-converted)" : accent }} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stages.map((st, i) => (
              <div key={st.k} className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-bold transition-colors",
                i <= done ? "border-status-converted/30 bg-status-converted/10 text-status-converted"
                  : failed && i === done + 1 ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : active === i ? "border-border bg-background" : "border-border text-muted-foreground")}>
                {i <= done ? <Check className="size-3" /> : active === i ? <Loader2 className="size-3 animate-spin" style={{ color: accent }} /> : failed && i === done + 1 ? <XCircle className="size-3" /> : <span className="size-3 rounded-full border border-current" />}
                <span className="truncate">{st.label}</span>
              </div>
            ))}
          </div>
          {failed && <div className="text-[12px] font-semibold text-destructive">{failed}</div>}
          {failed && <Button size="sm" variant="outline" onClick={run}><RefreshCw className="size-3.5" /> Retry</Button>}
        </div>
      )}
      {checks.length > 0 && <Checks list={checks} />}
    </div>
  );
}

function StepFinish({ p, slug, v, both }: { p: P; slug: string; v: ProviderView | null; both: boolean }) {
  const def = useServerFn(setDefaultProvider);
  const disc = useServerFn(disconnectProvider);
  const previewDisconnect = useServerFn(previewProviderDisconnect);
  const refresh = useRefresh(slug);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [hooks, setHooks] = useState<{ id: string; address: string }[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  if (!v) return null;
  const act = async (id: string, f: () => Promise<unknown>) => { setBusy(id); try { await f(); } catch (e) { toast.error(err(e)); } finally { setBusy(null); } };
  const loadPreview = async () => {
    setBusy("preview"); setHooks(null); setPreviewError(null);
    try { setHooks((await previewDisconnect({ data: { slug, provider: p } })).hooks); }
    catch (e) { setPreviewError(err(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ProviderTest key={`${slug}:${p}`} slug={slug} provider={p} sender={`${v.sender_name} <${v.sender_email}>`} />

      {both && (
        <Tile icon={Star} title="Default provider" body="Used automatically for this company's mail; the other stays as a manual option.">
          <Button size="sm" variant={v.is_default ? "secondary" : "default"} disabled={v.is_default || !!busy}
            onClick={() => act("def", async () => { await def({ data: { slug, provider: p } }); await refresh(); toast.success(`${META[p].name} is now default`); })}>
            <Star className={cn("size-3.5", v.is_default && "fill-brand text-brand")} /> {v.is_default ? "Default" : "Make default"}
          </Button>
        </Tile>
      )}

      <Tile icon={Unplug} title="Disconnect" body="Removes this company's Branta webhook from the provider and erases the stored key and secret. Other webhooks and history stay intact.">
        <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => { setConfirm(true); void loadPreview(); }}><Unplug className="size-3.5" /> Disconnect</Button>
        <AlertDialog open={confirm} onOpenChange={(open) => { if (!open && !busy) setConfirm(false); }}>
          <AlertDialogContent className="overflow-hidden p-0 sm:max-w-lg">
            <div className="flex items-center gap-3 bg-destructive/5 px-6 py-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-destructive/30 bg-card text-destructive"><Unplug className="size-5" /></span>
              <div>
                <AlertDialogTitle>Disconnect {META[p].name}?</AlertDialogTitle>
                <AlertDialogDescription className="mt-1">Only this company's Branta Tech webhooks will be removed.</AlertDialogDescription>
              </div>
            </div>
            <div className="space-y-3 px-6 py-4">
              {busy === "preview" && <div role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking {META[p].name} webhooks…</div>}
              {previewError && <div role="alert" className="space-y-2 text-[12px] text-destructive"><p>{previewError}</p><Button size="sm" variant="outline" onClick={() => void loadPreview()}><RefreshCw className="size-3.5" /> Retry</Button></div>}
              {hooks !== null && <>
                <div className="flex items-center justify-between text-[13px] font-semibold"><span>Branta Tech webhooks to remove</span><span className="font-mono text-destructive">{hooks.length}</span></div>
                {hooks.length ? <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border">{hooks.map((hook) => <li key={hook.id} className="space-y-1 p-3"><span className="text-[11px] text-muted-foreground">Webhook #{hook.id}</span><code className="block break-all text-[12px]">{hook.address}</code></li>)}</ul> : <p className="text-[12px] text-muted-foreground">No matching Branta Tech webhooks found. Only the Console connection will be removed.</p>}
                {p === "brevo" && hooks.length > 0 && <p className="text-[11px] text-muted-foreground">Private authentication tokens are hidden.</p>}
                <p className="text-[12px] text-muted-foreground">The stored API key and secret will be erased. Other systems' webhooks and past email history stay unchanged.</p>
              </>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setConfirm(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" disabled={!!busy || hooks === null || !!previewError} onClick={() => {
                if (hooks === null) return;
                void act("dc", async () => {
                  const r = await disc({ data: { slug, provider: p, confirmedHookIds: hooks.map((hook) => hook.id) } });
                  setConfirm(false); await refresh(); toast.success(`Disconnected · removed ${r.removed} Branta Tech webhook(s)`);
                });
              }}>{busy === "dc" ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />} Confirm disconnect</Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
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

function InboxAddress({ slug, accent, inbox, gmail }: { slug: string; accent: string; inbox: Data["inbox"]; gmail: string }) {
  const send = useServerFn(sendInboxProbe);
  const poll = useServerFn(pollInboxProbe);
  const refresh = useRefresh(slug);
  const [editing, setEditing] = useState(!inbox);
  const [askChange, setAskChange] = useState(false);
  const [email, setEmail] = useState(inbox?.email ?? "");
  const [run, setRun] = useState<{ id: string | null; stage: "sending" | "sent" | "delivered" | "forwarded" | "verified" | "failed"; msg: string; t0: number } | null>(null);
  const [pct, setPct] = useState(0);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const busy = !!run && !["verified", "failed"].includes(run.stage);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const STAGE_PCT = { sending: 10, sent: 35, delivered: 60, forwarded: 85, verified: 100, failed: 100 } as const;
  useEffect(() => {
    if (!run) return;
    const floor = STAGE_PCT[run.stage];
    const ceil = run.stage === "sending" ? 25 : run.stage === "sent" ? 55 : run.stage === "delivered" ? 80 : run.stage === "forwarded" ? 95 : 100;
    setPct((p) => Math.max(p, floor));
    if (!busy) return;
    const iv = setInterval(() => setPct((p) => Math.min(ceil, p + (ceil - p) * 0.08)), 400);
    return () => clearInterval(iv);
  }, [run?.stage, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const tick = (id: string, t0: number) => {
    timer.current = setTimeout(async () => {
      try {
        const r = await poll({ data: { slug, emailId: id } });
        if (r.stage === "verified") { setRun({ id, stage: "verified", msg: r.message, t0 }); toast.success("Inbox address verified"); await refresh(); return; }
        if (r.stage === "failed") { setRun({ id, stage: "failed", msg: r.message, t0 }); return; }
        if (Date.now() - t0 > 90_000) {
          setRun({ id, stage: "failed", t0, msg: r.stage === "delivered"
            ? `The receiving server accepted the email, but it never reached ${gmail}. Add a Cloudflare Email Routing rule that forwards this address to ${gmail}, then Retry.`
            : "No delivery confirmation after 90 seconds. Press Retry." });
          return;
        }
        setRun({ id, stage: r.stage, msg: r.message, t0 }); tick(id, t0);
      } catch (e) { setRun({ id, stage: "failed", msg: err(e), t0 }); }
    }, 3000);
  };
  const begin = async (addr: string) => {
    if (timer.current) clearTimeout(timer.current);
    const t0 = Date.now(); setPct(0); setEditing(false);
    setRun({ id: null, stage: "sending", msg: "Sending an automatic test email via Branta Tech's Resend…", t0 });
    try {
      const r = await send({ data: { slug, email: addr } });
      await refresh();
      setRun({ id: r.emailId, stage: "sent", msg: "Sent by Branta Tech's Resend. Waiting for the receiving server…", t0 });
      tick(r.emailId, t0);
    } catch (e) { setRun({ id: null, stage: "failed", msg: err(e), t0 }); }
  };
  const STEPS = [
    { k: "sent", label: "Sent via Resend" },
    { k: "delivered", label: "Accepted by domain" },
    { k: "forwarded", label: `Arrived in ${gmail}` },
    { k: "verified", label: "Routing verified" },
  ] as const;
  const order = ["sending", "sent", "delivered", "forwarded", "verified"];
  const reached = (k: string) => run && run.stage !== "failed" ? order.indexOf(run.stage) >= order.indexOf(k) : false;

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-border bg-background p-4">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: inbox?.verified_at ? "var(--color-status-converted)" : accent }} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card"><GmailMark className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-bold">In-app Gmail Inbox Address</h3>
          <div className="break-all text-[11.5px] font-semibold text-muted-foreground">Forwarding destination: {gmail}</div>
        </div>
        {inbox?.verified_at && !editing && <span className="flex items-center gap-1 rounded-full bg-status-converted/15 px-2 py-0.5 text-[10.5px] font-bold text-status-converted"><CheckCircle2 className="size-3" /> Verified</span>}
        {!inbox?.verified_at && inbox && !editing && !run && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-600">Not verified</span>}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-wrap gap-2 animate-in fade-in">
          <Input value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} placeholder="info@admakai.com" className="max-w-sm" />
          <Button disabled={!valid || !!busy} onClick={() => begin(email.trim().toLowerCase())}><ShieldCheck className="size-4" /> Save & verify</Button>
          {inbox && <Button variant="ghost" onClick={() => { setEmail(inbox.email); setEditing(false); }}>Cancel</Button>}
        </div>
      ) : inbox && (
        <div className="mt-3 space-y-3 animate-in fade-in">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <Mail className="size-3.5 text-muted-foreground" />
            <span className="flex-1 truncate text-[13px] font-semibold">{inbox.email}</span>
            <Button size="sm" variant="ghost" onClick={() => setAskChange(true)}><Pencil className="size-3.5" /> Change</Button>
            <ChangeInboxDialog open={askChange} email={inbox.email} verified={!!inbox.verified_at} onCancel={() => setAskChange(false)} onConfirm={() => { setAskChange(false); setEditing(true); }} />
          </div>
          {!inbox.verified_at && !run && (
            <Button size="sm" onClick={() => begin(inbox.email)}><ShieldCheck className="size-3.5" /> Verify automatically</Button>
          )}
          {run && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 animate-in fade-in">
              <div className="flex items-center justify-between text-[12px] font-bold">
                <span className="flex items-center gap-1.5">
                  {busy ? <Loader2 className="size-3.5 animate-spin" style={{ color: accent }} /> : run.stage === "verified" ? <CheckCircle2 className="size-3.5 text-status-converted" /> : <XCircle className="size-3.5 text-destructive" />}
                  {run.stage === "verified" ? "Verified" : run.stage === "failed" ? "Verification failed" : "Verifying…"}
                </span>
                <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: run.stage === "failed" ? "var(--color-destructive)" : run.stage === "verified" ? "var(--color-status-converted)" : accent }} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STEPS.map((st) => (
                  <div key={st.k} className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-bold transition-colors", reached(st.k) ? "border-status-converted/30 bg-status-converted/10 text-status-converted" : "border-border text-muted-foreground")}>
                    {reached(st.k) ? <Check className="size-3" /> : <span className="size-3 rounded-full border border-current" />}
                    <span className="truncate">{st.label}</span>
                  </div>
                ))}
              </div>
              <div className={cn("text-[12px] font-semibold", run.stage === "failed" ? "text-destructive" : "text-muted-foreground")}>{run.msg}</div>
              {run.stage === "failed" && <Button size="sm" variant="outline" onClick={() => begin(inbox.email)}><RefreshCw className="size-3.5" /> Retry</Button>}
            </div>
          )}
          {inbox.verified_at && <div className="text-[11.5px] font-semibold text-muted-foreground">Changing this address requires verifying again and re-verifying Resend/Brevo with the new sender.</div>}
        </div>
      )}
    </div>
  );
}
