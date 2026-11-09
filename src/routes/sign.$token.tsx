import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, Printer, Share2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/contracts/signature-pad";

export const Route = createFileRoute("/sign/$token")({
  head: () => ({
    meta: [
      { title: "Review & sign contract" },
      { name: "description", content: "Securely review and electronically sign your contract." },
      { property: "og:title", content: "Review & sign contract" },
      { property: "og:description", content: "Securely review and electronically sign your contract." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignPage,
});

type View = {
  state: "open" | "signed" | "expired" | "replaced"; title: string; version: number;
  company: { name: string; address: string | null; email: string | null; phone: string | null; website: string | null };
  client: { name: string; company: string }; body: string | null;
  invoice: { slug: string; total: number; currency: string; due_date: string | null } | null;
  ceo: { name: string; title: string; signature_png: string | null }; email: string; expires_at: string;
  signed: { name: string; title: string | null; at: string; signature_png: string } | null;
};
const BANK: Array<[string, string]> = [["Bank Name", "Standard Islami Bank PLC"], ["Account Name", "Branta Tech"], ["Account Number", "03433001126"], ["Branch", "Bogra Branch"], ["Routing Number", "210100374"], ["SWIFT Code", "SDBLBDDH"]];

function SignPage() {
  const { token } = Route.useParams();
  const api = `/api/public/contracts/${token}`;
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<"read" | "code" | "sign">("read");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<string | null>(null);
  const [name, setName] = useState(""); const [title, setTitle] = useState(""); const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);

  const load = () => fetch(api).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setV(b); setName((n) => n || b.client.name); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (body: object) => {
    setBusy(true); setMsg(null);
    try { const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; }
    catch (e) { setMsg((e as Error).message); return null; } finally { setBusy(false); }
  };

  if (err) return <Shell><p className="text-center text-[15px] text-muted-foreground">{err}</p></Shell>;
  if (!v) return <Shell><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></Shell>;
  if (v.state === "expired" || v.state === "replaced") return <Shell><h1 className="text-center text-xl font-semibold">{v.state === "expired" ? "This signing link has expired" : "This contract was replaced"}</h1><p className="mt-2 text-center text-muted-foreground">Please contact {v.company.name} for a new link.</p></Shell>;

  return (
    <div className="min-h-screen bg-muted/40 px-3 py-6 print:bg-background print:p-0">
      <div className="mx-auto max-w-[820px] space-y-4">
        {v.state === "signed" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 print:hidden">
            <div className="flex items-center gap-2 text-[14px] font-medium"><CheckCircle2 className="h-5 w-5 text-status-converted" />Signed on {new Date(v.signed!.at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild><a href={`${api}?pdf=1`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" />PDF</a></Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
              <Button size="sm" variant="outline" onClick={() => { const u = window.location.href; if (navigator.share) navigator.share({ title: v.title, url: u }).catch(() => {}); else navigator.clipboard.writeText(u); }}><Share2 className="h-4 w-4" />Share</Button>
            </div>
          </div>
        )}
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-12 print:border-0 print:shadow-none">
          <div className="border-b border-border pb-4"><div className="text-[18px] font-bold">{v.company.name}</div><div className="text-[12px] text-muted-foreground">{[v.company.address, v.company.email, v.company.phone, v.company.website].filter(Boolean).join(" · ")}</div></div>
          <h1 className="mt-6 text-[22px] font-bold tracking-tight">{v.title.toUpperCase()}</h1>
          <div className="text-[12px] text-muted-foreground">Version {v.version}</div>
          <div className="mt-5 whitespace-pre-wrap text-[14px] leading-7">{v.body}</div>
          <Payment v={v} />
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <SigBox label={`For ${v.company.name}`} name={v.ceo.name} title={v.ceo.title} png={v.ceo.signature_png} />
            <SigBox label="For the client" name={v.signed?.name ?? v.client.name} title={v.signed?.title ?? null} png={v.signed?.signature_png ?? null} />
          </div>
        </article>

        {v.state === "open" && (
          <div className="rounded-2xl border border-border bg-card p-5 print:hidden">
            {step === "read" && (<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[14px] text-muted-foreground">To sign, we'll email a 6-digit code to {v.email}.</p><Button disabled={busy} onClick={async () => { if (await post({ action: "send_code" })) setStep("code"); }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}<ShieldCheck className="h-4 w-4" />Send code</Button></div>)}
            {step === "code" && (<div className="space-y-3"><p className="text-[14px]">Enter the code sent to {v.email}</p><div className="flex gap-2"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="max-w-[160px] text-center font-mono text-lg tracking-[0.4em]" /><Button disabled={busy || code.length !== 6} onClick={async () => { const b = await post({ action: "verify", code }); if (b) { setSession(b.session); setStep("sign"); } }}>Verify</Button><Button variant="ghost" disabled={busy} onClick={() => post({ action: "send_code" })}>Resend</Button></div></div>)}
            {step === "sign" && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-[13px]"><span className="text-muted-foreground">Full name</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label><label className="space-y-1 text-[13px]"><span className="text-muted-foreground">Title (optional)</span><Input value={title} onChange={(e) => setTitle(e.target.value)} /></label></div>
                <SignaturePad onChange={setSig} typedName={name} />
                <label className="flex items-start gap-2 text-[13.5px]"><Checkbox checked={agree} onCheckedChange={(c) => setAgree(!!c)} className="mt-0.5" />I have read this contract and agree to sign it electronically.</label>
                <Button disabled={busy || !agree || !sig || name.trim().length < 2} onClick={async () => { if (await post({ action: "submit", session, name, title: title || undefined, agree: true, signature: sig })) load(); }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Submit signature</Button>
              </div>
            )}
            {msg && <p className="mt-3 text-[13px] text-destructive">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Payment({ v }: { v: View }) {
  return (
    <section className="mt-8 rounded-xl border border-border p-4">
      <div className="text-[13px] font-bold">PAYMENT DETAILS</div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{v.invoice ? `Invoice ${v.invoice.slug} · ${v.invoice.currency} ${v.invoice.total.toLocaleString("en-US")}${v.invoice.due_date ? ` · Due ${v.invoice.due_date}` : ""}. Please mention the invoice number as the payment reference.` : "Invoice to be issued."}</p>
      <dl className="mt-3 grid grid-cols-[130px_1fr] gap-y-1 text-[12.5px]">{BANK.map(([k, val]) => <><dt key={k} className="text-muted-foreground">{k}</dt><dd key={`${k}v`} className="font-medium">{val}</dd></>)}</dl>
    </section>
  );
}
function SigBox({ label, name, title, png }: { label: string; name: string; title: string | null; png: string | null }) {
  return <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="flex h-16 items-end">{png && <img src={png} alt="Signature" className="max-h-16" />}</div><div className="border-t border-foreground pt-1 text-[14px] font-semibold">{name}</div>{title && <div className="text-[12px] text-muted-foreground">{title}</div>}</div>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">{children}</div></div>;
}
