import { useState } from "react";
import { KeyRound, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TestLoader } from "@/components/ui/test-loader";
import { EMAIL_RESEND as resend } from "@/lib/brand-assets";
import { EMAIL_BREVO as brevo } from "@/lib/brand-assets";
import { DnsNameStatus, useDnsNameCheck } from "@/components/company/dns-name-check";

export function ProviderRepairDialog({ slug, kind, provider, domain, busy, error, onClose, onApi, onDomain }: {
  slug: string; kind: "api" | "domain" | null; provider: "resend" | "brevo"; domain: string; busy: boolean; error: string | null;
  onClose: () => void; onApi: (mode: "oauth" | "manual", key?: string) => void; onDomain: (subdomain: string) => void;
}) {
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [key, setKey] = useState("");
  const [sub, setSub] = useState("links");
  const name = provider === "resend" ? "Resend" : "Brevo";
  const nameCheck = useDnsNameCheck(slug, domain, kind === "domain" && provider === "resend" ? sub : "");
  const gated = kind === "domain" && provider === "resend";
  return <Dialog open={!!kind} onOpenChange={open => { if (!open && !busy) { setKey(""); setMode("choose"); onClose(); } }}>
    <DialogContent onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} className="sm:max-w-md">
      <DialogTitle className="flex items-center gap-2 text-[15px]"><img src={(provider === "resend" ? resend : brevo).url} alt="" className="size-6 object-contain" />Fix {name} {kind === "api" ? "API" : "domain"}</DialogTitle>
      <DialogDescription className="font-mono text-[12px]">{domain}</DialogDescription>
      {kind === "api" ? <>
        {mode === "choose" && provider === "resend" ? <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onApi("oauth")} className="h-24 flex-col gap-2 whitespace-normal border-primary/25 bg-primary/5"><img src={resend.url} alt="" className="size-6" />Connect Resend<ArrowRight className="size-3.5" /></Button>
          <Button variant="outline" disabled={busy} onClick={() => setMode("manual")} className="h-24 flex-col gap-2 whitespace-normal"><KeyRound className="size-5" />Manual API Key<ArrowRight className="size-3.5" /></Button>
        </div> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (key.trim()) onApi("manual", key.trim()); }}>
          <label className="block text-[12px] font-semibold">Full-access API key<Input className="mt-1 font-mono" type="password" autoComplete="off" value={key} disabled={busy} onChange={e => setKey(e.target.value)} placeholder={provider === "resend" ? "re_…" : "xkeysib-…"} /></label>
          <div className="flex justify-end gap-2">{provider === "resend" && <Button variant="outline" disabled={busy} onClick={() => { setMode("choose"); setKey(""); }}>Back</Button>}<Button type="submit" disabled={busy || !key.trim()}>{busy ? <TestLoader active /> : <ShieldCheck className="size-3.5" />}{busy ? "Fixing…" : "Validate & Fix"}</Button></div>
        </form>}
      </> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (gated && !nameCheck.ready) return; onDomain(sub); }}>
        {provider === "resend" && <label className="block text-[12px] font-semibold">Tracking subdomain<div className="mt-1 flex items-center rounded-md border border-border"><Input value={sub} disabled={busy} onChange={e => setSub(e.target.value)} className="w-28 border-0 font-mono" aria-label="Tracking subdomain" /><span className="truncate pr-2 font-mono text-[12px] text-muted-foreground">.{domain}</span></div></label>}
        {gated && <DnsNameStatus slug={slug} check={nameCheck.check} disabled={busy} onOverridden={() => onDomain(sub.trim().toLowerCase())} />}
        <p className="text-[12px] text-muted-foreground">Required DNS records will be added or updated in this company's connected Cloudflare zone. Existing unrelated records stay unchanged.</p>
        <Button type="submit" disabled={busy || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub) || (gated && !nameCheck.ready)} className="w-full">{busy ? <TestLoader active /> : <ShieldCheck className="size-3.5" />}{busy ? "Fixing…" : "Confirm & Fix"}</Button>
      </form>}
      {busy && <div className="flex items-center gap-2 text-[12px] font-semibold"><TestLoader active />Fixing…</div>}
      {error && <p role="alert" className="break-words text-[12px] font-semibold text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}