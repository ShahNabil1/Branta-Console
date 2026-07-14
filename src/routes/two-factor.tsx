import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/two-factor")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    if (data.session.aal === "aal2") throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [{ title: "Two-factor · Branta Tech" }],
  }),
  component: TwoFactor,
});

function TwoFactor() {
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [enrolling, setEnrolling] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await auth.mfa.listFactors();
      const existing = list.data?.totp.find((f) => f.status === "verified");
      if (existing) {
        setFactorId(existing.id);
        setEnrolling(false);
      } else {
        const { data } = await auth.mfa.enroll();
        if (data) {
          setFactorId(data.id);
          setSecret(data.totp.secret);
        }
      }
    })();
  }, []);

  const onVerify = async () => {
    if (!factorId || code.length !== 6) return;
    setVerifying(true);
    setError(null);
    const { error } = await auth.mfa.verify({ factorId, code });
    setVerifying(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/app" });
  };

  const onCancel = async () => {
    await auth.signOut();
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
            {enrolling ? "Enroll authenticator" : "Verify identity"}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {enrolling
              ? "Scan the code with your authenticator app, then enter the 6-digit code below."
              : "Enter the 6-digit code from your authenticator app."}
          </p>

          {enrolling && secret && (
            <div className="mt-5 space-y-3">
              <div className="rounded-sm border border-border bg-muted p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Secret key
                </div>
                <div className="mt-1 break-all font-mono text-[13px] text-foreground">
                  {secret}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Add manually in your authenticator (Issuer: Branta Tech).
                </div>
              </div>
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
              disabled={code.length !== 6 || verifying}
              className={cn(
                "flex h-9 items-center gap-2 rounded-sm bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700",
                (code.length !== 6 || verifying) && "opacity-60",
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
