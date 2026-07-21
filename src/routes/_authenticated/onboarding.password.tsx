// Forced password change — first sign-in after admin creates the employee OR
// after an admin resets their password. Uses the temporary password as the
// "current" credential; on success the `must_change_password` flag clears and
// the gate advances the user (either to Telegram linking or straight to /app).
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import brandLogo from "@/assets/brand-logo.png.asset.json";
import { changeMyPassword } from "@/lib/change-password.functions";
import { getOnboardingStatus } from "@/lib/onboarding.functions";
import {
  PASSWORD_LEN,
  strongPasswordSchema,
  stripToPassword,
} from "@/lib/branta-credentials";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding/password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Set your password · Branta Tech" }] }),
  component: OnboardingPasswordPage,
});

function OnboardingPasswordPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const changeFn = useServerFn(changeMyPassword);
  const statusFn = useServerFn(getOnboardingStatus);

  const status = useQuery({
    queryKey: ["onboarding.status"],
    queryFn: () => statusFn(),
  });

  // If they've already changed the password, don't linger here.
  useEffect(() => {
    if (!status.data) return;
    if (!status.data.mustChangePassword) {
      navigate({
        to: status.data.mustLinkTelegram ? "/onboarding/telegram" : "/app",
        replace: true,
      });
    }
  }, [status.data, navigate]);

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsed = strongPasswordSchema.safeParse(next);
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsTemp = next.length > 0 && next === current;
  const canSubmit =
    !busy &&
    current.length > 0 &&
    parsed.success &&
    !mismatch &&
    !sameAsTemp;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      await changeFn({
        data: { current_password: current, new_password: next },
      });
      toast.success("Password updated");
      await qc.invalidateQueries({ queryKey: ["onboarding.status"] });
      const fresh = await statusFn();
      navigate({
        to: fresh.mustLinkTelegram ? "/onboarding/telegram" : "/app",
        replace: true,
      });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Password change failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/40 p-6">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src={brandLogo.src}
            alt="Branta Tech"
            className="mb-3 h-9 w-auto"
          />
          <div className="grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
            <KeyRound className="size-5" />
          </div>
          <h1 className="mt-3 text-[15px] font-semibold">
            Set your personal password
          </h1>
          <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
            The temporary password is only valid for this first sign-in. Choose
            a personal password now — you'll use it every time from here on.
          </p>
          {email && (
            <div className="mt-2 font-mono text-[11.5px] text-muted-foreground">
              {email}
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Temporary password
            </label>
            <div className="mt-1 flex items-center gap-1">
              <input
                type={showCur ? "text" : "password"}
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(stripToPassword(e.target.value))}
                maxLength={PASSWORD_LEN}
                className="h-9 flex-1 rounded-sm border border-border bg-card px-2.5 font-mono text-[13px] tracking-widest outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => setShowCur((s) => !s)}
                className="grid size-9 place-items-center rounded-sm border border-border bg-card text-muted-foreground hover:bg-muted"
                aria-label={showCur ? "Hide" : "Show"}
              >
                {showCur ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              New password ({PASSWORD_LEN} chars, incl. upper, lower, digit, symbol)
            </label>
            <div className="mt-1 flex items-center gap-1">
              <input
                type={showNext ? "text" : "password"}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(stripToPassword(e.target.value))}
                maxLength={PASSWORD_LEN}
                className={cn(
                  "h-9 flex-1 rounded-sm border border-border bg-card px-2.5 font-mono text-[13px] tracking-widest outline-none focus:border-brand",
                  next.length > 0 && !parsed.success && "border-rose-400",
                )}
              />
              <button
                type="button"
                onClick={() => setShowNext((s) => !s)}
                className="grid size-9 place-items-center rounded-sm border border-border bg-card text-muted-foreground hover:bg-muted"
                aria-label={showNext ? "Hide" : "Show"}
              >
                {showNext ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            {next.length > 0 && !parsed.success && (
              <p className="mt-1 text-[11.5px] text-rose-600">
                {parsed.error.issues[0]?.message}
              </p>
            )}
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Confirm new password
            </label>
            <input
              type={showNext ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(stripToPassword(e.target.value))}
              maxLength={PASSWORD_LEN}
              className={cn(
                "mt-1 h-9 w-full rounded-sm border border-border bg-card px-2.5 font-mono text-[13px] tracking-widest outline-none focus:border-brand",
                mismatch && "border-rose-400",
              )}
            />
            {mismatch && (
              <p className="mt-1 text-[11.5px] text-rose-600">
                Passwords do not match.
              </p>
            )}
            {sameAsTemp && (
              <p className="mt-1 text-[11.5px] text-rose-600">
                New password must be different from the temporary one.
              </p>
            )}
          </div>

          {err && (
            <p className="rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-700">
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-sm bg-brand text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Save personal password
          </button>
        </form>
      </div>
    </div>
  );
}
