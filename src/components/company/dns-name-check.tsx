import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Replace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmSurface } from "@/components/ui/confirm-surface";
import { clearDnsName, inspectDnsName, type DnsRecord } from "@/lib/company-cloudflare.functions";
import { cn } from "@/lib/utils";

const SUB_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const isResend = (r: DnsRecord) => r.type === "CNAME" && /resend/i.test(r.content);
const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export type NameCheck =
  | { state: "invalid" | "checking" | "free" | "ours" | "error"; host: string; records: DnsRecord[]; message?: string }
  | { state: "taken"; host: string; records: DnsRecord[] };

/** Live Cloudflare lookup of `<sub>.<domain>` while typing (debounced). Proceed only when free or already Resend's. */
export function useDnsNameCheck(slug: string, domain: string, sub: string) {
  const inspect = useServerFn(inspectDnsName);
  const s = sub.trim().toLowerCase();
  const host = s && domain ? `${s}.${domain}` : "";
  const [check, setCheck] = useState<NameCheck>({ state: "checking", host, records: [] });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!SUB_RE.test(s) || !domain) { setCheck({ state: "invalid", host, records: [] }); return; }
    let live = true;
    setCheck({ state: "checking", host, records: [] });
    const t = setTimeout(() => {
      inspect({ data: { slug, host } })
        .then((r) => {
          if (!live) return;
          if (!r.zone) return setCheck({ state: "error", host, records: [], message: `${domain} isn't in the connected Cloudflare account.` });
          const others = r.records.filter((x) => !isResend(x));
          setCheck(others.length ? { state: "taken", host, records: others } : { state: r.records.length ? "ours" : "free", host, records: r.records });
        })
        .catch((e) => { if (live) setCheck({ state: "error", host, records: [], message: err(e) }); });
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [slug, domain, host, s, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return { check, ready: check.state === "free" || check.state === "ours", recheck: () => setNonce((n) => n + 1) };
}

/** Status line under the subdomain input; on a clash lists the records with an Override action. */
export function DnsNameStatus({ slug, check, onOverridden, disabled, className }: {
  slug: string; check: NameCheck; onOverridden: () => void | Promise<void>; disabled?: boolean; className?: string;
}) {
  const clear = useServerFn(clearDnsName);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await clear({ data: { slug, host: check.host, ids: check.records.map((r) => r.id) } });
      setAsk(false);
      toast.success(`Old records at ${check.host} removed.`);
      await onOverridden();
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  if (check.state === "invalid") return <p className={cn("text-[11.5px] font-semibold text-muted-foreground", className)}>Use letters, numbers and dashes only.</p>;
  if (check.state === "checking") return <p className={cn("flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground", className)}><Loader2 className="size-3 animate-spin" /> Checking Cloudflare for <span className="font-mono">{check.host}</span>…</p>;
  if (check.state === "error") return <p className={cn("text-[11.5px] font-semibold text-destructive", className)}>{check.message}</p>;
  if (check.state === "free") return <p className={cn("flex items-center gap-1.5 text-[11.5px] font-semibold text-status-converted", className)}><CheckCircle2 className="size-3" /> <span className="font-mono">{check.host}</span> is free.</p>;
  if (check.state === "ours") return <p className={cn("flex items-center gap-1.5 text-[11.5px] font-semibold text-status-converted", className)}><CheckCircle2 className="size-3" /> <span className="font-mono">{check.host}</span> already points to Resend.</p>;
  return (
    <div className={cn("rounded-md border border-destructive/30 bg-destructive/5 p-2.5 animate-in fade-in", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1 text-[12px] font-bold"><span className="font-mono">{check.host}</span> is already used by {check.records.length} record{check.records.length > 1 ? "s" : ""}</span>
        <Button type="button" size="sm" variant="outline" className="h-7" disabled={disabled || busy} onClick={() => setAsk(true)}><Replace className="size-3.5" /> Override</Button>
      </div>
      <ul className="mt-2 space-y-1">
        {check.records.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-[11.5px]">
            <span className="rounded border border-border bg-background px-1.5 font-mono text-[10.5px] font-extrabold">{r.type}</span>
            <span className="min-w-0 truncate font-mono text-muted-foreground" title={r.content}>{r.content}</span>
            {r.proxied && <span className="shrink-0 text-[10.5px] font-bold text-primary">Proxied</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Type another name, or Override to replace them.</p>
      <ConfirmSurface
        open={ask}
        tone="danger"
        icon={Replace}
        title={`Override ${check.host}?`}
        subject={<span className="font-mono">{check.host}</span>}
        points={[
          <span key="list">These {check.records.length} Cloudflare record{check.records.length > 1 ? "s" : ""} will be deleted: <b className="font-mono">{check.records.map((r) => `${r.type} → ${r.content}`).join(" · ")}</b></span>,
          "A new Resend tracking CNAME (DNS only) is added at this name right after.",
          "Any website, app or service that used this name stops working there.",
          "Other records in the domain stay unchanged.",
        ]}
        safeLast
        confirmLabel="Override"
        busy={busy}
        onCancel={() => setAsk(false)}
        onConfirm={() => void run()}
      />
    </div>
  );
}
