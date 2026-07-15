import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertCircle, Check, Copy, Eye, EyeOff, Info, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import brandLogo from "@/assets/brand-logo.png.asset.json";

const TURNSTILE_SITE_KEY = "0x4AAAAAACNbiRh7P7qtgkXG";

const searchSchema = z.object({
  reason: z.enum(["idle", "signed_out"]).optional(),
  redirect: z.string().optional(),
});

// TOTP anti-abuse tuning
const MAX_TOTP_ATTEMPTS = 5;
const TOTP_LOCK_MS = 60_000;
const ENROLL_REGEN_COOLDOWN_MS = 60_000;
const CHALLENGE_REFRESH_COOLDOWN_MS = 30_000;

const sanitizeRedirect = (r: string | undefined): string => {
  if (!r) return "/app";
  if (!r.startsWith("/") || r.startsWith("//")) return "/app";
  if (r.startsWith("/login")) return "/app";
  return r;
};


export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in · Branta Tech" }] }),
  component: LoginPage,
});

const DOMAIN = "@brantatech.com";

// Strict allow-lists. Anything outside is rejected before it reaches the
// input state (and re-validated by zod at submit time as a second gate).
const LOCAL_ALLOWED = /^[a-z]+$/;               // plain lowercase english only
const PASSWORD_ALLOWED = /^[\x20-\x7E]+$/;      // printable ASCII only

const stripToLocal = (v: string) =>
  v.normalize("NFKC").toLowerCase().replace(/[^a-z]/g, "");
const stripToPassword = (v: string) =>
  v.normalize("NFKC").replace(/[^\x20-\x7E]/g, "");

const localSchema = z
  .string()
  .trim()
  .min(1, "Enter your Branta ID.")
  .max(64, "Branta ID is too long.")
  .regex(LOCAL_ALLOWED, "Only lowercase english letters (a–z). No numbers or symbols.");

const passwordSchema = z
  .string()
  .min(1, "Enter your password.")
  .max(128, "Password is too long.")
  .regex(PASSWORD_ALLOWED, "Password must use english letters, numbers, or symbols only.");

type CaptchaStatus = "loading" | "ready" | "expired" | "error";
type Phase = "credentials" | "enroll" | "challenge";

function LoginPage() {
  const navigate = useNavigate();
  const { reason, redirect: redirectParam } = useSearch({ from: "/login" });

  // Phase state
  const [phase, setPhase] = useState<Phase>("credentials");

  // Credentials
  const [local, setLocal] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaStatus, setCaptchaStatus] = useState<CaptchaStatus>("loading");
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const submitLockRef = useRef(false);

  // TOTP
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Anti-abuse timers
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number>(0);
  const [enrollCooldownUntil, setEnrollCooldownUntil] = useState<number>(0);
  const [challengeCooldownUntil, setChallengeCooldownUntil] = useState<number>(0);
  const [regenerating, setRegenerating] = useState(false);
  const [refreshingChallenge, setRefreshingChallenge] = useState(false);
  const [, setTick] = useState(0);
  const [secretCopied, setSecretCopied] = useState(false);

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
    } catch {
      // Fallback for older browsers / insecure contexts.
      const ta = document.createElement("textarea");
      ta.value = secret;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setSecretCopied(true);
    window.setTimeout(() => setSecretCopied(false), 1600);
  };

  const otpInputRef = useRef<HTMLInputElement>(null);

  const lockRemaining = Math.max(0, lockUntil - Date.now());
  const enrollRemaining = Math.max(0, enrollCooldownUntil - Date.now());
  const challengeRemaining = Math.max(0, challengeCooldownUntil - Date.now());
  const locked = lockRemaining > 0;

  // 1s tick only while any countdown is active.
  useEffect(() => {
    if (lockRemaining === 0 && enrollRemaining === 0 && challengeRemaining === 0) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [lockRemaining, enrollRemaining, challengeRemaining]);

  // Auto-focus the OTP input whenever we enter/return to a TOTP phase
  // or the code was just cleared after a failed attempt.
  useEffect(() => {
    if (phase === "credentials") return;
    if (locked) return;
    if (code.length === 0) {
      // Small delay lets the input render before focus.
      const id = window.setTimeout(() => otpInputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [phase, code, locked]);

  // Auto-submit once the user finishes typing the 6-digit code.
  const onVerifyRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (
      code.length === 6 &&
      !verifying &&
      !locked &&
      (phase === "enroll" || phase === "challenge")
    ) {
      onVerifyRef.current();
    }
  }, [code, verifying, locked, phase]);





  const validateLocal = (v: string) => {
    if (!v) return setLocalError(null);
    const r = localSchema.safeParse(v);
    setLocalError(r.success ? null : r.error.issues[0]?.message ?? null);
  };

  const canSubmit =
    !submitting &&
    captchaStatus === "ready" &&
    !!captchaToken &&
    local.length > 0 &&
    password.length > 0 &&
    !localError;

  const startTotpPhase = async () => {
    const { data, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr) {
      setFormError(listErr.message);
      return;
    }
    const verified = data.totp.find((f) => f.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: verified.id,
      });
      if (chErr) {
        setFormError(chErr.message);
        return;
      }
      setChallengeId(ch.id);
      setPhase("challenge");
      return;
    }
    // Clean up any half-enrolled unverified factor from a prior attempt.
    const stale = data.totp.find((f) => f.status !== "verified");
    if (stale) await supabase.auth.mfa.unenroll({ factorId: stale.id });
    const { data: enr, error: enErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Branta Tech",
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    if (enErr || !enr) {
      setFormError(enErr?.message ?? "Failed to start enrollment.");
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
    setPhase("enroll");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    setFormError(null);

    const r = localSchema.safeParse(local);
    if (!r.success) {
      setLocalError(r.error.issues[0]?.message ?? "Invalid Branta ID.");
      return;
    }
    if (!password) {
      setFormError("Enter your password.");
      return;
    }
    if (!captchaToken || captchaStatus !== "ready") {
      setFormError(
        captchaStatus === "expired"
          ? "Verification expired. Please complete the challenge again."
          : "Please complete the verification challenge.",
      );
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    const email = `${r.data}${DOMAIN}`;
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      // Turnstile tokens are single-use — always reset after an auth attempt.
      turnstileRef.current?.reset();
      setCaptchaToken(null);
      setCaptchaStatus("loading");
      if (error) {
        setFormError(error.message);
        return;
      }
      await startTotpPhase();
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const registerFailedAttempt = () => {
    const next = failedAttempts + 1;
    if (next >= MAX_TOTP_ATTEMPTS) {
      setLockUntil(Date.now() + TOTP_LOCK_MS);
      setFailedAttempts(0);
      setTotpError(
        `Too many invalid codes. Try again in ${Math.ceil(TOTP_LOCK_MS / 1000)}s.`,
      );
    } else {
      setFailedAttempts(next);
      setTotpError(
        `Invalid code. ${MAX_TOTP_ATTEMPTS - next} attempt${
          MAX_TOTP_ATTEMPTS - next === 1 ? "" : "s"
        } remaining.`,
      );
    }
    setCode("");
  };

  const onVerify = async () => {
    if (!factorId || code.length !== 6 || locked) return;
    setVerifying(true);
    setTotpError(null);
    try {
      if (phase === "enroll") {
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
        if (chErr || !ch) {
          setTotpError(chErr?.message ?? "Challenge failed. Try again.");
          setCode("");
          return;
        }
        const { error: vErr } = await supabase.auth.mfa.verify({
          factorId,
          challengeId: ch.id,
          code,
        });
        if (vErr) {
          registerFailedAttempt();
          return;
        }
      } else {
        if (!challengeId) return;
        const { error: vErr } = await supabase.auth.mfa.verify({
          factorId,
          challengeId,
          code,
        });
        if (vErr) {
          registerFailedAttempt();
          // Challenges are single-use / short-lived — mint a fresh one for the next try.
          const { data: ch } = await supabase.auth.mfa.challenge({ factorId });
          if (ch) setChallengeId(ch.id);
          return;
        }
      }
      setFailedAttempts(0);
      setLockUntil(0);
      navigate({ to: sanitizeRedirect(redirectParam) });
    } finally {
      setVerifying(false);
    }
  };
  onVerifyRef.current = onVerify;



  const onRegenerateEnrollment = async () => {
    if (!factorId || enrollRemaining > 0 || regenerating) return;
    setRegenerating(true);
    setTotpError(null);
    try {
      await supabase.auth.mfa.unenroll({ factorId });
      const { data: enr, error: enErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Branta Tech",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enErr || !enr) {
        setTotpError(enErr?.message ?? "Could not regenerate. Try again shortly.");
        return;
      }
      setFactorId(enr.id);
      setSecret(enr.totp.secret);
      setQrDataUrl(null);
      try {
        const url = await QRCode.toDataURL(enr.totp.uri, { margin: 1, width: 200 });
        setQrDataUrl(url);
      } catch {
        /* fall back to secret only */
      }
      setCode("");
      setFailedAttempts(0);
      setEnrollCooldownUntil(Date.now() + ENROLL_REGEN_COOLDOWN_MS);
    } finally {
      setRegenerating(false);
    }
  };

  const onRefreshChallenge = async () => {
    if (!factorId || challengeRemaining > 0 || refreshingChallenge) return;
    setRefreshingChallenge(true);
    setTotpError(null);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) {
        setTotpError(chErr?.message ?? "Could not refresh challenge.");
        return;
      }
      setChallengeId(ch.id);
      setCode("");
      setChallengeCooldownUntil(Date.now() + CHALLENGE_REFRESH_COOLDOWN_MS);
    } finally {
      setRefreshingChallenge(false);
    }
  };



  const onCancelTotp = async () => {
    if (phase === "enroll" && factorId) {
      await supabase.auth.mfa.unenroll({ factorId });
    }
    await supabase.auth.signOut();
    setPhase("credentials");
    setFactorId(null);
    setChallengeId(null);
    setSecret(null);
    setQrDataUrl(null);
    setCode("");
    setTotpError(null);
    setPassword("");
    setFailedAttempts(0);
    setLockUntil(0);
    setEnrollCooldownUntil(0);
    setChallengeCooldownUntil(0);
  };

  return (
    <div className="flex min-h-screen bg-card">
      {/* Left rail */}
      <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-zinc-950 p-12 text-white lg:flex">
        <div className="z-10 flex items-center gap-3">
          <img src={brandLogo.url} alt="Branta" className="h-9 w-auto" />
        </div>
        <div className="z-10 max-w-sm">
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight">
            Precision control for industrial operations.
          </h1>
          <p className="mt-4 text-sm text-zinc-400">
            The unified command surface for Branta Tech sales, projects, and
            back-office workflows.
          </p>
        </div>
        <div className="z-10 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
          SYSTEM_STATE: READY_FOR_AUTH
          <br />
          LOCAL_NODE: BRANTA_HQ_01
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle, #E56A17 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </aside>

      {/* Form */}
      <main className="flex flex-1 flex-col justify-center bg-muted px-6 py-12 sm:px-16 lg:px-24">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 flex lg:hidden">
            <img src={brandLogo.url} alt="Branta" className="h-8 w-auto" />
          </div>

          {phase === "credentials" ? (
            <>
              <header className="mb-8">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Operator sign in
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your Branta Tech credentials to access the console.
                </p>
              </header>

              {reason === "idle" && (
                <div className="mb-4 rounded-sm border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">
                  You were signed out after 30 minutes of inactivity.
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-4" noValidate aria-busy={submitting}>
                <div>
                  <label
                    htmlFor="local"
                    className="mb-1.5 block text-[12px] font-medium text-muted-foreground"
                  >
                    Branta ID
                  </label>
                  <div
                    className={cn(
                      "flex h-9 w-full overflow-hidden rounded-sm border bg-card",
                      localError ? "border-rose-500" : "border-border",
                    )}
                  >
                    <input
                      id="local"
                      type="text"
                      autoComplete="username"
                      spellCheck={false}
                      value={local}
                      onChange={(e) => {
                        setLocal(e.target.value.toLowerCase());
                        validateLocal(e.target.value);
                      }}
                      onBlur={(e) => validateLocal(e.target.value)}
                      aria-invalid={!!localError}
                      aria-describedby={localError ? "local-error" : undefined}
                      className={cn(
                        "flex-1 bg-transparent px-3 font-mono text-[13px] outline-none transition-shadow focus:ring-1 focus:ring-inset",
                        localError ? "focus:ring-rose-500" : "focus:ring-brand",
                      )}
                    />
                    <div
                      aria-hidden="true"
                      className="grid select-none place-items-center border-l border-border bg-muted px-3 font-mono text-[13px] font-semibold text-brand"
                    >
                      {DOMAIN}
                    </div>
                  </div>
                  <div
                    id="local-error"
                    role="alert"
                    aria-live="polite"
                    className="mt-1.5 min-h-[14px] text-[11px] font-medium uppercase tracking-[0.1em] text-rose-600"
                  >
                    {localError}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-[12px] font-medium text-muted-foreground"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-9 w-full rounded-sm border border-border bg-card px-3 pr-10 text-[13px] outline-none transition-shadow focus:border-brand focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      aria-pressed={showPw}
                      className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                    >
                      {showPw ? (
                        <EyeOff className="size-3.5" strokeWidth={1.75} />
                      ) : (
                        <Eye className="size-3.5" strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </div>

                <div
                  id="form-error"
                  role="alert"
                  aria-live="assertive"
                  className={cn(
                    "overflow-hidden rounded-sm border px-3 text-[12px] transition-all",
                    formError
                      ? "max-h-24 border-rose-200 bg-rose-50 py-2 text-rose-700 opacity-100"
                      : "max-h-0 border-transparent bg-transparent py-0 opacity-0",
                  )}
                >
                  {formError ?? "\u00A0"}
                </div>


                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    aria-disabled={!canSubmit}
                    aria-describedby="captcha-status form-error"
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-brand text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                    <span>{submitting ? "Signing in…" : "Sign in"}</span>
                  </button>
                </div>

                <div className="flex flex-col items-center gap-2 pt-2">
                  <div className="min-h-[65px] w-full" aria-label="Verification challenge">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      options={{
                        theme: "light",
                        size: "flexible",
                        appearance: "always",
                        action: "login",
                      }}
                      onWidgetLoad={() =>
                        setCaptchaStatus((s) => (s === "ready" ? s : "loading"))
                      }
                      onSuccess={(token) => {
                        setCaptchaToken(token);
                        setCaptchaStatus("ready");
                        if (
                          formError === "Verification failed. Please try again." ||
                          formError?.startsWith("Verification expired")
                        ) {
                          setFormError(null);
                        }
                      }}
                      onExpire={() => {
                        setCaptchaToken(null);
                        setCaptchaStatus("expired");
                      }}
                      onError={() => {
                        setCaptchaToken(null);
                        setCaptchaStatus("error");
                        setFormError("Verification failed. Please try again.");
                      }}
                      className="w-full"
                    />
                  </div>
                  <p
                    id="captcha-status"
                    role="status"
                    aria-live="polite"
                    className="min-h-[14px] text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    {captchaStatus === "loading" && "Loading verification…"}
                    {captchaStatus === "ready" && "Protected by Cloudflare"}
                    {captchaStatus === "expired" && "Verification expired — retrying"}
                    {captchaStatus === "error" && "Verification error — try again"}
                  </p>
                </div>
              </form>
            </>
          ) : (
            <>
              {/* Step indicator */}
              <ol className="mb-6 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em]">
                <li className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="grid size-4 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                  Credentials
                </li>
                <li aria-hidden className="h-px w-6 bg-border" />
                {phase === "enroll" && (
                  <>
                    <li className="flex items-center gap-1.5 text-brand">
                      <span className="grid size-4 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">
                        2
                      </span>
                      Set up
                    </li>
                    <li aria-hidden className="h-px w-6 bg-border" />
                    <li className="flex items-center gap-1.5 text-muted-foreground/60">
                      <span className="grid size-4 place-items-center rounded-full border border-border text-[10px] font-bold">
                        3
                      </span>
                      Verify
                    </li>
                  </>
                )}
                {phase === "challenge" && (
                  <li className="flex items-center gap-1.5 text-brand">
                    <span className="grid size-4 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">
                      2
                    </span>
                    Verify
                  </li>
                )}
              </ol>

              <header className="mb-1 flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand" strokeWidth={1.75} />
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Two-factor authentication
                </div>
              </header>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {phase === "enroll" ? "Enroll authenticator" : "Verify identity"}
              </h2>
              <p className="mt-1 whitespace-pre-line text-[13px] text-muted-foreground">
                {phase === "enroll"
                  ? "Scan the QR code with Google Authenticator,\nthen enter the 6-digit code below."
                  : "Enter the 6-digit code from your authenticator app."}
              </p>

              {phase === "enroll" && (
                <div className="mt-5 space-y-3">
                  {qrDataUrl && (
                    <div className="flex justify-center rounded-sm border border-border bg-white p-4">
                      <img src={qrDataUrl} alt="TOTP QR code" className="size-[200px]" />
                    </div>
                  )}
                  {secret && (
                    <div className="rounded-sm border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          Or enter secret manually
                        </div>
                        <button
                          type="button"
                          onClick={copySecret}
                          aria-label={secretCopied ? "Secret copied" : "Copy secret"}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] transition-all duration-200 hover:bg-muted",
                            secretCopied
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className="relative grid size-3 place-items-center">
                            <Copy
                              className={cn(
                                "absolute size-3 transition-all duration-200",
                                secretCopied ? "scale-50 opacity-0" : "scale-100 opacity-100",
                              )}
                              strokeWidth={1.75}
                            />
                            <Check
                              className={cn(
                                "absolute size-3 transition-all duration-200",
                                secretCopied ? "scale-100 opacity-100" : "scale-50 opacity-0",
                              )}
                              strokeWidth={2.5}
                            />
                          </span>
                          {secretCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <div className="mt-1 break-all font-mono text-[13px] text-foreground">
                        {secret}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Issuer: Branta Tech
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onRegenerateEnrollment}
                    disabled={enrollRemaining > 0 || regenerating}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-sm border border-border bg-card px-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      (enrollRemaining > 0 || regenerating) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {regenerating ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" strokeWidth={1.75} />
                    )}
                    {enrollRemaining > 0
                      ? `Regenerate in ${Math.ceil(enrollRemaining / 1000)}s`
                      : "Regenerate secret"}
                  </button>
                </div>
              )}

              <div className="mt-6">
                <label className="mb-2 block text-[12px] font-medium text-muted-foreground">
                  Verification code
                </label>
                <InputOTP
                  ref={otpInputRef}
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  disabled={locked || verifying}
                  autoFocus
                  containerClassName={cn(
                    "gap-2",
                    totpError && !locked && "animate-shake",
                  )}
                >
                  <InputOTPGroup className="gap-1.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className={cn(
                          "h-11 w-10 rounded-sm border border-border text-[15px] font-mono",
                          totpError && !locked && "border-rose-400",
                        )}
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>

                {/* Status / help / error row (fixed height to avoid layout shift) */}
                <div className="mt-2 min-h-[18px] text-[12px]" aria-live="polite">
                  {locked ? (
                    <div className="flex items-center gap-1.5 text-rose-600">
                      <AlertCircle className="size-3.5" strokeWidth={2} />
                      Too many invalid codes. Try again in {Math.ceil(lockRemaining / 1000)}s.
                    </div>
                  ) : totpError ? (
                    <div className="flex items-center gap-1.5 text-rose-600">
                      <AlertCircle className="size-3.5" strokeWidth={2} />
                      {totpError}
                    </div>
                  ) : verifying ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Verifying code…
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Info className="size-3.5" strokeWidth={1.75} />
                      Codes refresh every 30s. We&rsquo;ll verify automatically.
                    </div>
                  )}
                </div>

                {phase === "challenge" && (
                  <button
                    type="button"
                    onClick={onRefreshChallenge}
                    disabled={challengeRemaining > 0 || refreshingChallenge}
                    className={cn(
                      "mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground",
                      (challengeRemaining > 0 || refreshingChallenge) &&
                        "cursor-not-allowed opacity-60",
                    )}
                  >
                    {refreshingChallenge ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" strokeWidth={1.75} />
                    )}
                    {challengeRemaining > 0
                      ? `New challenge in ${Math.ceil(challengeRemaining / 1000)}s`
                      : "Request new challenge"}
                  </button>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  onClick={onCancelTotp}
                  className="h-9 rounded-sm border border-border bg-card px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={onVerify}
                  disabled={code.length !== 6 || verifying || locked}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-sm bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700",
                    (code.length !== 6 || verifying || locked) && "opacity-60",
                  )}
                >
                  {verifying && <Loader2 className="size-3.5 animate-spin" />}
                  Verify and continue
                </button>
              </div>

              <div className="mt-6 border-t border-border pt-4 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                Canceling will sign you out immediately.
              </div>
            </>

          )}

          <footer className="mt-12 border-t border-border pt-6">
            <p className="text-[11px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
              Branta internal infrastructure. Unauthorized access is strictly
              prohibited and monitored by system audit protocols.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
