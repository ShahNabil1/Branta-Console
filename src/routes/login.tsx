import { useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Fingerprint, Loader2 } from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  reason: z.enum(["idle", "signed_out"]).optional(),
});

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Sign in · Branta Tech" }],
  }),
  component: LoginPage,
});

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .refine(
    (v) => v.endsWith("@brantatech.com"),
    "Only @brantatech.com addresses are permitted.",
  );

function LoginPage() {
  const navigate = useNavigate();
  const { reason } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validateEmail = (v: string) => {
    if (!v) return setEmailError(null);
    const r = emailSchema.safeParse(v);
    setEmailError(r.success ? null : r.error.issues[0]?.message ?? null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const r = emailSchema.safeParse(email);
    if (!r.success) {
      setEmailError(r.error.issues[0]?.message ?? "Invalid email.");
      return;
    }
    if (!password) {
      setFormError("Enter your password.");
      return;
    }
    setSubmitting(true);
    const { error } = await auth.signInWithPassword({ email: r.data, password });
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    navigate({ to: "/two-factor" });
  };

  return (
    <div className="flex min-h-screen bg-card">
      {/* Left rail */}
      <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-zinc-950 p-12 text-white lg:flex">
        <div className="z-10 flex items-center gap-2">
          <div className="size-6 rounded-sm bg-brand" />
          <span className="text-xl font-bold tracking-tight">
            BRANTA<span className="font-light opacity-50">TECH</span>
          </span>
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
        <div className="mx-auto w-full max-w-[380px]">
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
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[12px] font-medium text-muted-foreground"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  validateEmail(e.target.value);
                }}
                onBlur={(e) => validateEmail(e.target.value)}
                placeholder="name@brantatech.com"
                className={cn(
                  "h-9 w-full rounded-sm border bg-card px-3 font-mono text-[13px] outline-none transition-shadow placeholder:text-muted-foreground/50",
                  emailError
                    ? "border-rose-500 focus:ring-1 focus:ring-rose-500"
                    : "border-border focus:border-brand focus:ring-1 focus:ring-brand",
                )}
              />
              <div className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.1em]">
                {emailError ? (
                  <span className="text-rose-600">{emailError}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Only @brantatech.com addresses are permitted
                  </span>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[12px] font-medium text-muted-foreground"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 w-full rounded-sm border border-border bg-card px-3 text-[13px] outline-none transition-shadow focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            {formError && (
              <div className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {formError}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-brand text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting && <Loader2 className="size-3.5 animate-spin" />}
                Sign in
              </button>
              <button
                type="button"
                onClick={() =>
                  toast("Passkey sign-in", {
                    description:
                      "WebAuthn will be enabled after Supabase is connected. Contact IT to enroll a device.",
                  })
                }
                className="flex h-9 w-full items-center justify-center gap-2 rounded-sm border border-border bg-card text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Fingerprint className="size-4" strokeWidth={1.75} />
                Sign in with passkey
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
