import { useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import brandLogo from "@/assets/brand-logo.png.asset.json";

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

function LoginPage() {
  const navigate = useNavigate();
  const { reason } = useSearch({ from: "/login" });
  const [local, setLocal] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validateLocal = (v: string) => {
    if (!v) return setLocalError(null);
    const r = localSchema.safeParse(v);
    setLocalError(r.success ? null : r.error.issues[0]?.message ?? null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setSubmitting(true);
    const email = `${r.data}${DOMAIN}`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSubmitting(false);
      setFormError(error.message);
      return;
    }
    // Root layout will re-check AAL and redirect to /two-factor when needed.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setSubmitting(false);
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      navigate({ to: "/two-factor" });
    } else {
      navigate({ to: "/app" });
    }
  };

  return (
    <div className="flex min-h-screen bg-card">
      {/* Left rail */}
      <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-zinc-950 p-12 text-white lg:flex">
        <div className="z-10 flex items-center gap-3">
          <img
            src={brandLogo.url}
            alt="Branta"
            className="h-9 w-auto brightness-0 invert-[.85]"
            style={{ filter: "none" }}
          />
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

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
                  "flex h-9 w-full overflow-hidden rounded-sm border bg-card transition-shadow focus-within:ring-1",
                  localError
                    ? "border-rose-500 focus-within:border-rose-500 focus-within:ring-rose-500"
                    : "border-border focus-within:border-brand focus-within:ring-brand",
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
                  placeholder="your.name"
                  className="flex-1 bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-muted-foreground/50"
                />
                <div className="grid select-none place-items-center border-l border-border bg-muted px-3 font-mono text-[13px] font-semibold text-brand">
                  {DOMAIN}
                </div>
              </div>
              <div className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.1em]">
                {localError ? (
                  <span className="text-rose-600">{localError}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Only @brantatech.com accounts can sign in
                  </span>
                )}
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
                  className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {showPw ? (
                    <EyeOff className="size-3.5" strokeWidth={1.75} />
                  ) : (
                    <Eye className="size-3.5" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>

            {formError && (
              <div className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {formError}
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-brand text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting && <Loader2 className="size-3.5 animate-spin" />}
                Sign in
              </button>
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
