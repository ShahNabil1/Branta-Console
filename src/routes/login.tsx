import { useRef, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import brandLogo from "@/assets/brand-logo.png.asset.json";

const TURNSTILE_SITE_KEY = "0x4AAAAAACNbiRh7P7qtgkXG";

const searchSchema = z.object({
  reason: z.enum(["idle", "signed_out"]).optional(),
});

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in · Branta Tech" }] }),
  component: LoginPage,
});

const DOMAIN = "@brantatech.com";
const localSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your Branta ID.")
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Only letters, numbers, dot, dash, underscore.");

type CaptchaStatus = "loading" | "ready" | "expired" | "error";

function LoginPage() {
  const navigate = useNavigate();
  const { reason } = useSearch({ from: "/login" });
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Double-submit guard — synchronous lock beats React state race conditions.
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
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        navigate({ to: "/two-factor" });
      } else {
        navigate({ to: "/app" });
      }
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
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
            {/* Branta ID with fixed domain suffix */}
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
              {/* Reserved space to avoid layout shift */}
              <div
                id="local-error"
                role="alert"
                aria-live="polite"
                className="mt-1.5 min-h-[14px] text-[11px] font-medium uppercase tracking-[0.1em] text-rose-600"
              >
                {localError}
              </div>
            </div>

            {/* Password with show/hide */}
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

            {/* Reserved form error slot to prevent layout shift */}
            <div
              id="form-error"
              role="alert"
              aria-live="assertive"
              className={cn(
                "min-h-[36px] rounded-sm border px-3 py-2 text-[12px] transition-opacity",
                formError
                  ? "border-rose-200 bg-rose-50 text-rose-700 opacity-100"
                  : "border-transparent bg-transparent opacity-0",
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

            {/* Turnstile verification */}
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
                  onWidgetLoad={() => setCaptchaStatus((s) => (s === "ready" ? s : "loading"))}
                  onSuccess={(token) => {
                    setCaptchaToken(token);
                    setCaptchaStatus("ready");
                    if (formError === "Verification failed. Please try again." ||
                        formError?.startsWith("Verification expired")) {
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
