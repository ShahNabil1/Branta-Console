import { useEffect, useState } from "react";
import { ArrowLeftRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { BRAND_LOGO as brandLogo } from "@/lib/brand-assets";

export type HandoffStage = "verify" | "issue" | "done" | "error";

const LABELS: Record<HandoffStage, string> = {
  verify: "Verifying your Branta session…",
  issue: "Securing access & permissions…",
  done: "Access granted — redirecting…",
  error: "",
};

/** Progress follows real stages; within a stage it creeps toward a cap, never past it. */
const RANGE: Record<HandoffStage, [number, number]> = {
  verify: [8, 30],
  issue: [30, 88],
  done: [100, 100],
  error: [0, 0],
};

export function SsoHandoff({ appName, appLogo, stage, error, wideLogo }: { appName: string; appLogo: string; wideLogo?: boolean; stage: HandoffStage; error?: string | null }) {
  const [pct, setPct] = useState(RANGE.verify[0]);
  useEffect(() => {
    const [min, cap] = RANGE[stage];
    setPct((p) => Math.max(p, min));
    if (stage === "done" || stage === "error") return;
    const t = setInterval(() => setPct((p) => (p < cap ? p + Math.max(0.4, (cap - p) * 0.08) : p)), 120);
    return () => clearInterval(t);
  }, [stage]);
  const failed = stage === "error";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded border border-border bg-card px-6 py-8 text-center shadow-sm">
        <div className="flex items-center justify-center gap-3">
          <LogoTile src={brandLogo.url} alt="Branta" />
          <div className="relative flex h-1 w-16 items-center">
            <div className="h-px w-full bg-border" />
            {!failed && <span className="absolute h-1.5 w-1.5 animate-[sso-dot_1.4s_ease-in-out_infinite] rounded-full bg-primary" />}
            <span className={`absolute left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border bg-card ${failed ? "border-destructive text-destructive" : "border-primary/40 text-primary"}`}>
              {failed ? <ShieldAlert className="h-3.5 w-3.5" /> : stage === "done" ? <ShieldCheck className="h-3.5 w-3.5" /> : <ArrowLeftRight className="h-3.5 w-3.5 animate-pulse" />}
            </span>
          </div>
          <LogoTile src={appLogo} alt={appName} wide={wideLogo} />
        </div>

        <h1 className="mt-6 text-[15px] font-semibold text-foreground">
          {failed ? `Couldn’t connect ${appName}` : `Connecting to ${appName}`}
        </h1>
        <p className="mt-1 min-h-[18px] text-[13px] text-muted-foreground">{failed ? error : LABELS[stage]}</p>

        {!failed && (
          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="relative h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }}>
                <div className="absolute inset-0 animate-[sso-shine_1.2s_linear_infinite] bg-gradient-to-r from-transparent via-background/50 to-transparent" />
              </div>
            </div>
            <div className="mt-1.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round(pct)}%</div>
          </div>
        )}
        {failed && <a href="/app" className="mt-5 inline-flex h-8 items-center rounded-sm border border-border px-3 text-[13px] text-foreground hover:bg-muted">Back to Console</a>}
      </div>
      <style>{`@keyframes sso-dot{0%{left:0;opacity:0}20%{opacity:1}80%{opacity:1}100%{left:100%;opacity:0}}@keyframes sso-shine{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
    </main>
  );
}

function LogoTile({ src, alt, wide }: { src: string; alt: string; wide?: boolean }) {
  return (
    <div className={`flex h-14 ${wide ? "w-28 px-3" : "w-14"} items-center justify-center rounded border border-border bg-card p-2 shadow-sm`}>
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
