import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/two-factor")({
  ssr: false,
  beforeLoad: async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw redirect({ to: "/login" });
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") throw redirect({ to: "/app" });
  },
  head: () => ({ meta: [{ title: "Two-factor · Branta Tech" }] }),
  component: TwoFactor,
});

type Mode = "loading" | "enroll" | "challenge";

function TwoFactor() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) {
        setError(listErr.message);
        return;
      }
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        const { data: ch, error: chErr } =
          await supabase.auth.mfa.challenge({ factorId: verified.id });
        if (chErr) {
          setError(chErr.message);
          return;
        }
        setChallengeId(ch.id);
        setMode("challenge");
      } else {
        // Clean up any half-enrolled unverified factor from prior attempt.
        const stale = data.totp.find((f) => f.status !== "verified");
        if (stale) await supabase.auth.mfa.unenroll({ factorId: stale.id });
        const { data: enr, error: enErr } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          issuer: "Branta Tech",
          friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
        });
        if (enErr || !enr) {
          setError(enErr?.message ?? "Failed to start enrollment.");
          return;
        }
        setFactorId(enr.id);
        setSecret(enr.totp.secret);
        try {
          const url = await QRCode.toDataURL(enr.totp.uri, { margin: 1, width: 200 });
          setQrDataUrl(url);
        } catch {
          // Fall back to secret only.
        }
        setMode("enroll");
      }
    })();
  }, []);

  const onVerify = async () => {
    if (!factorId || code.length !== 6) return;
    setVerifying(true);
    setError(null);
    if (mode === "enroll") {
      // Challenge + verify combined for first-time enrollment.
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) {
        setVerifying(false);
        setError(chErr?.message ?? "Challenge failed.");
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      });
      setVerifying(false);
      if (vErr) {
        setError(vErr.message);
        return;
      }
    } else {
      if (!challengeId) return;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });
      setVerifying(false);
      if (vErr) {
        setError(vErr.message);
        return;
      }
    }
    navigate({ to: "/app" });
  };

  const onCancel = async () => {
    if (mode === "enroll" && factorId) {
      await supabase.auth.mfa.unenroll({ factorId });
    }
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12">
      <div className="w-full max-w-[440px] rounded-md border border-border bg-card shadow-[var(--shadow-panel)]">
        <div className="hairline-b flex items-center gap-2 px-6 py-4">
          <ShieldCheck className="size-4 text-brand" strokeWidth={1.75} />
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Two-factor authentication
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {mode === "enroll" ? "Enroll authenticator" : "Verify identity"}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {mode === "loading"
              ? "Preparing authenticator…"
              : mode === "enroll"
                ? "Scan the QR code with your authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code below."
                : "Enter the 6-digit code from your authenticator app."}
          </p>

          {mode === "enroll" && (
            <div className="mt-5 space-y-3">
              {qrDataUrl && (
                <div className="flex justify-center rounded-sm border border-border bg-white p-4">
                  <img src={qrDataUrl} alt="TOTP QR code" className="size-[200px]" />
                </div>
              )}
              {secret && (
                <div className="rounded-sm border border-border bg-muted p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Or enter secret manually
                  </div>
                  <div className="mt-1 break-all font-mono text-[13px] text-foreground">
                    {secret}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Issuer: Branta Tech
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6">
            <label className="mb-2 block text-[12px] font-medium text-muted-foreground">
              Verification code
            </label>
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && (
              <div className="mt-2 text-[12px] text-rose-600">{error}</div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              onClick={onCancel}
              className="h-9 rounded-sm border border-border bg-card px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={onVerify}
              disabled={code.length !== 6 || verifying || mode === "loading"}
              className={cn(
                "flex h-9 items-center gap-2 rounded-sm bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700",
                (code.length !== 6 || verifying || mode === "loading") && "opacity-60",
              )}
            >
              {verifying && <Loader2 className="size-3.5 animate-spin" />}
              Verify and continue
            </button>
          </div>

          <div className="mt-6 border-t border-border pt-4 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Canceling will sign you out immediately.
          </div>
        </div>
      </div>
    </div>
  );
}
