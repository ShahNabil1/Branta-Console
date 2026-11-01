import { passkeyErrorMessage } from "@/lib/passkey-errors";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Monitor,
  Smartphone,
  Loader2,
  Trash2,
  Plus,
  LogOut,
  MapPin,
  Fingerprint,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  listMyPasskeys,
  beginPasskeyRegistration,

  finishPasskeyRegistration,
  deleteMyPasskey,
} from "@/lib/passkeys.functions";
import {
  listMySessions,
  revokeSession,
  revokeAllOtherSessions,
} from "@/lib/user-sessions.functions";
import { changeMyPassword } from "@/lib/change-password.functions";
import { beginPasswordResetPasskey, resetMyPassword } from "@/lib/reset-password.functions";
import { getPasskeyProvider } from "@/lib/passkey-providers";
import { PasskeyProviderIcon } from "@/components/profile/passkey-provider-icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SESSION_KEY_STORAGE } from "@/hooks/use-session-watcher";
import { SessionHistoryLog } from "@/components/profile/session-history-log";
import { PASSWORD_LEN, stripToPassword } from "@/lib/branta-credentials";
import { TelegramConnectCard } from "@/components/profile/telegram-connect-card";
import { ConnectedAppsCard } from "@/components/profile/connected-apps-card";
import { NotificationPreferencesCard } from "@/components/profile/notification-preferences-card";

export const Route = createFileRoute("/_authenticated/app/profile/security")({
  head: () => ({ meta: [{ title: "Security & Notifications · Profile" }] }),
  component: SecurityTab,
});

function Section({
  title,
  description,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-sm bg-brand/10 text-brand">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {right ? <div className="flex shrink-0 flex-wrap gap-2">{right}</div> : null}
      </header>
      <div className="min-w-0 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SecurityTab() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 px-3 py-4 sm:px-6 sm:py-8">
      <TwoFactorSection />
      <PasskeysSection />
      <ChangePasswordSection />
      <SessionsSection />
      <NotificationsPlaceholder />
    </div>
  );
}

// ---------- 2FA ----------

function TwoFactorSection() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(
      (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })),
    );
    setLoading(false);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const verified = factors.find((f) => f.status === "verified");

  const onReset = async () => {
    const ok = await confirm({
      title: "Reset two-factor authentication?",
      description:
        "You will be signed out of every device immediately. On your next sign-in, you must set up 2FA again with a fresh QR code.",
      confirmLabel: "Reset & sign out",
      tone: "danger",
    });
    if (!ok) return;
    setResetting(true);
    try {
      for (const f of factors) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      window.localStorage.removeItem(SESSION_KEY_STORAGE);
      await supabase.auth.signOut();
      navigate({ to: "/login", search: { reason: "signed_out" } });
    } catch (err) {
      toast.error("Reset failed", { description: (err as Error).message });
      setResetting(false);
    }
  };

  return (
    <Section
      title="Two-Factor Authentication"
      description="TOTP codes from your authenticator app (Google Authenticator, 1Password, Authy…)."
      icon={ShieldCheck}
      right={
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-semibold",
            verified
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700",
          )}
        >
          {verified ? <><Check className="size-3" /> Active</> : <><AlertTriangle className="size-3" /> Not configured</>}
        </span>
      }
    >
      {loading ? (
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">
            {verified
              ? "TOTP is enabled on this account. Reset it if you lost your authenticator."
              : "TOTP is not enabled yet. It will be set up on your next sign-in."}
          </p>
          {verified && (
            <Button
              variant="outline"
              onClick={onReset}
              disabled={resetting}
              className="h-9 rounded-sm border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              {resetting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Reset 2FA
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}

// ---------- Passkeys ----------

function PasskeysSection() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const list = useServerFn(listMyPasskeys);
  const begin = useServerFn(beginPasskeyRegistration);
  const finish = useServerFn(finishPasskeyRegistration);
  const del = useServerFn(deleteMyPasskey);

  const q = useQuery({
    queryKey: ["me", "passkeys"],
    queryFn: () => list(),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);

  const mfaValid = /^\d{6}$/.test(mfaCode);

  const startAdd = async () => {
    if (!name.trim()) {
      toast.error("Give this passkey a name so you can recognize it later.");
      return;
    }
    if (!mfaValid) {
      toast.error("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const options = await begin({
        data: { friendly_name: name.trim(), mfa_code: mfaCode },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attestation = await startRegistration({ optionsJSON: options as any });
      await finish({
        data: { attestation_response: attestation, friendly_name: name.trim() },
      });
      toast.success("Passkey added");
      setAddOpen(false);
      setName("");
      setMfaCode("");
      await qc.invalidateQueries({ queryKey: ["me", "passkeys"] });
    } catch (err) {
      toast.error("Could not add passkey", { description: passkeyErrorMessage(err, "add") });
    } finally {
      setBusy(false);
    }
  };


  const onDelete = async (id: string, label: string) => {
    const ok = await confirm({
      title: "Delete this passkey?",
      description: `"${label}" will no longer work for signing in. You can add another at any time.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await del({ data: { id } });
      toast.success("Passkey removed");
      await qc.invalidateQueries({ queryKey: ["me", "passkeys"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const passkeys = q.data?.passkeys ?? [];
  const max = q.data?.max ?? 3;
  const canAdd = passkeys.length < max;

  return (
    <Section
      title="Passkeys"
      description={`Sign in with Face ID, Touch ID, or a security key — no code needed. Up to ${max} passkeys per account.`}
      icon={Fingerprint}
      right={
        <Button
          onClick={() => setAddOpen(true)}
          disabled={!canAdd}
          className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-brand-700"
        >
          <Plus className="mr-1.5 size-3.5" /> Add passkey
        </Button>
      }
    >
      {q.isLoading ? (
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      ) : passkeys.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
          No passkeys yet. Add one from a device you trust.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-sm border border-border bg-card text-foreground">
                  <PasskeyProviderIcon kind={getPasskeyProvider(p).kind} className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {p.friendly_name ?? "Untitled passkey"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">{getPasskeyProvider(p).name}</span>
                    {p.backed_up && (
                      <span className="inline-flex items-center gap-0.5 rounded-sm bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Synced
                      </span>
                    )}
                    <span>·</span>
                    <span>
                      Added {new Date(p.created_at).toLocaleDateString()}
                    </span>
                    {p.last_used_at && (
                      <>
                        <span>·</span>
                        <span>
                          Last used {new Date(p.last_used_at).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(p.id, p.friendly_name ?? "Passkey")}
                className="h-8 rounded-sm text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a passkey</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px] font-semibold text-muted-foreground">
                Name this passkey
              </Label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                placeholder="e.g. MacBook Touch ID"
                className="mt-1 h-9 rounded-sm"
              />
            </div>
            <div>
              <Label className="text-[12px] font-semibold text-muted-foreground">
                2FA code from your authenticator
              </Label>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="mt-1 h-9 rounded-sm font-mono tracking-[0.35em]"
              />
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                We verify 2FA before enrolling a new passkey — this prevents a
                stolen password alone from adding a persistent sign-in method.
              </p>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Your browser will then ask for biometric verification (Face ID,
              Touch ID, Windows Hello, or a security key). Nothing is stored on
              our servers except the public credential.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={startAdd}
              disabled={busy || !name.trim() || !mfaValid}
            >
              {busy ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Verifying…</> : "Continue"}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ---------- Password ----------

const PW_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: `Exactly ${PASSWORD_LEN} characters`, test: (v) => v.length === PASSWORD_LEN },
  { label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One digit", test: (v) => /[0-9]/.test(v) },
  { label: "One symbol (! @ # $ % ^ & * - _ = + ?)", test: (v) => /[!@#$%^&*\-_=+?]/.test(v) },
];
const pwValid = (v: string) => PW_RULES.every((r) => r.test(v));

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  invalid,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          className={cn("h-10 rounded-sm pr-9 font-mono text-[13px]", invalid && "border-red-500")}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(stripToPassword(e.target.value))}
          autoComplete={autoComplete}
          maxLength={PASSWORD_LEN}
        />
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function NewPasswordFields({
  next,
  setNext,
  confirmPw,
  setConfirmPw,
}: {
  next: string;
  setNext: (v: string) => void;
  confirmPw: string;
  setConfirmPw: (v: string) => void;
}) {
  const mismatch = confirmPw.length > 0 && next !== confirmPw;
  return (
    <>
      <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
      <ul className="grid grid-cols-1 gap-1 text-[11.5px] sm:grid-cols-2">
        {PW_RULES.map((r) => {
          const ok = r.test(next);
          return (
            <li key={r.label} className={cn("flex items-center gap-1.5", ok ? "text-emerald-700" : "text-muted-foreground")}>
              {ok ? <Check className="size-3.5 shrink-0" /> : <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />}
              {r.label}
            </li>
          );
        })}
      </ul>
      <PasswordField label="Confirm new password" value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" invalid={mismatch} />
      {mismatch && <p className="text-[11.5px] text-red-600">Passwords don't match.</p>}
    </>
  );
}

function ChangePasswordSection() {
  const [mode, setMode] = useState<null | "change" | "reset">(null);
  return (
    <Section
      title="Password"
      description={`Exactly ${PASSWORD_LEN} characters with lowercase, uppercase, a digit and a symbol.`}
      icon={Lock}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">
          Change it with your current password, or reset it after verifying with your authenticator or a passkey.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" className="h-9 rounded-sm" onClick={() => setMode("reset")}>
            Reset Password
          </Button>
          <Button className="h-9 rounded-sm" onClick={() => setMode("change")}>
            Change Password
          </Button>
        </div>
      </div>
      <ChangePasswordDialog open={mode === "change"} onClose={() => setMode(null)} />
      <ResetPasswordDialog open={mode === "reset"} onClose={() => setMode(null)} />
    </Section>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const change = useServerFn(changeMyPassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setCurrent(""); setNext(""); setConfirmPw(""); }
  }, [open]);

  const sameAsCurrent = next.length > 0 && next === current;
  const canSubmit = current.length > 0 && pwValid(next) && next === confirmPw && !sameAsCurrent;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await change({ data: { current_password: current, new_password: next } });
      toast.success("Password updated");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
          <NewPasswordFields next={next} setNext={setNext} confirmPw={confirmPw} setConfirmPw={setConfirmPw} />
          {sameAsCurrent && <p className="text-[11.5px] text-red-600">New password must be different from your current password.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit || busy}>
              {busy ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Updating…</> : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reset = useServerFn(resetMyPassword);
  const beginPk = useServerFn(beginPasswordResetPasskey);
  const [step, setStep] = useState<"verify" | "password">("verify");
  const [method, setMethod] = useState<"totp" | "passkey">("totp");
  const [code, setCode] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assertion, setAssertion] = useState<any>(null);
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("verify"); setMethod("totp"); setCode(""); setAssertion(null);
      setNext(""); setConfirmPw("");
    }
  }, [open]);

  const verifyPasskey = async () => {
    setBusy(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const options = await beginPk();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = await startAuthentication({ optionsJSON: options as any });
      setAssertion(a);
      setMethod("passkey");
      setStep("password");
    } catch (err) {
      toast.error(passkeyErrorMessage(err, "verify"));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = pwValid(next) && next === confirmPw;
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await reset({
        data: method === "totp"
          ? { method: "totp", code, new_password: next }
          : { method: "passkey", assertion_response: assertion, new_password: next },
      });
      toast.success("Password reset");
      onClose();
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(msg);
      // A used passkey/TOTP proof can't be replayed — verify again.
      if (/passkey|code|challenge|verif/i.test(msg)) { setStep("verify"); setAssertion(null); setCode(""); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
        </DialogHeader>
        {step === "verify" ? (
          <div className="space-y-4">
            <p className="text-[12.5px] text-muted-foreground">
              Verify it's you first — no current password needed.
            </p>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Authenticator code
              </Label>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="h-10 rounded-sm font-mono tracking-[0.35em]"
              />
              <Button
                className="w-full"
                disabled={!/^\d{6}$/.test(code) || busy}
                onClick={() => { setMethod("totp"); setStep("password"); }}
              >
                Continue with code
              </Button>
            </div>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={verifyPasskey} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Fingerprint className="mr-1.5 size-4" />}
              Verify with a passkey
            </Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="flex items-center gap-1.5 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[12px] text-emerald-800">
              <Check className="size-3.5" />
              {method === "passkey" ? "Passkey verified." : "Code ready — it is checked when you save."}
            </div>
            <NewPasswordFields next={next} setNext={setNext} confirmPw={confirmPw} setConfirmPw={setConfirmPw} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={!canSubmit || busy}>
                {busy ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Saving…</> : "Reset password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Sessions ----------

function SessionsSection() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const list = useServerFn(listMySessions);
  const revoke = useServerFn(revokeSession);
  const revokeOthers = useServerFn(revokeAllOtherSessions);

  const currentKey = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return window.localStorage.getItem(SESSION_KEY_STORAGE) ?? undefined;
  }, []);

  const q = useQuery({
    queryKey: ["me", "sessions", currentKey ?? ""],
    queryFn: () => list({ data: { current_session_key: currentKey } }),
    refetchInterval: 30_000,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const onRevoke = async (id: string, isCurrent: boolean, label: string) => {
    const ok = await confirm({
      title: isCurrent ? "Sign out from this device?" : "Sign out this session?",
      description: isCurrent
        ? "You'll be signed out immediately and returned to the login page."
        : `${label} will be signed out immediately.`,
      confirmLabel: "Sign out",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(id);
    try {
      await revoke({ data: { session_id: id } });
      toast.success("Session revoked");
      if (isCurrent) {
        window.localStorage.removeItem(SESSION_KEY_STORAGE);
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }
      await qc.invalidateQueries({ queryKey: ["me", "sessions"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onRevokeOthers = async () => {
    if (!currentKey) return;
    const ok = await confirm({
      title: "Sign out all other devices?",
      description:
        "Every other browser and device will lose access within a minute. This device stays signed in.",
      confirmLabel: "Sign out others",
      tone: "danger",
    });
    if (!ok) return;
    setBusyAll(true);
    try {
      await revokeOthers({ data: { session_key: currentKey } });
      toast.success("Other sessions revoked");
      await qc.invalidateQueries({ queryKey: ["me", "sessions"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyAll(false);
    }
  };

  const sessions = q.data?.sessions ?? [];
  const others = sessions.filter((s) => !s.is_current);

  return (
    <Section
      title="Active Sessions"
      description="Every device currently signed in with your Branta ID. Revoke any that you don't recognize."
      icon={KeyRound}
      right={
        others.length > 0 ? (
          <Button
            variant="outline"
            onClick={onRevokeOthers}
            disabled={busyAll}
            className="h-9 rounded-sm text-red-700 hover:bg-red-50"
          >
            {busyAll ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <LogOut className="mr-1.5 size-3.5" />}
            Sign out others ({others.length})
          </Button>
        ) : null
      }
    >
      {q.isLoading ? (
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
          No active sessions on record. This will populate as you sign in.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((s) => {
            const isMobile =
              s.device?.toLowerCase().includes("mobile") ||
              /iphone|android|ipad/i.test(s.device ?? "");
            const Icon = isMobile ? Smartphone : Monitor;
            const label = `${s.browser ?? "Browser"} · ${s.os ?? "OS"}`;
            const location = [s.city, s.country].filter(Boolean).join(", ");
            return (
              <li key={s.id} className="flex min-w-0 items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-sm",
                      s.is_current ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                        {label}
                      </span>
                      {s.is_current && (
                        <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                          <Check className="size-3" /> This device
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
                      {location && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="size-3" /> {location}
                        </span>
                      )}
                      {s.ip && <><span>·</span><span className="break-all font-mono">{s.ip}</span></>}
                      <span>·</span>
                      <span>
                        Active {new Date(s.last_seen_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRevoke(s.id, s.is_current, label)}
                  disabled={busy === s.id}
                  className="h-8 rounded-sm text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  {busy === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <SessionHistoryLog rows={q.data?.history ?? []} />
    </Section>
  );
}

// ---------- Notifications ----------

function NotificationsPlaceholder() {
  return (
    <>
      <Section
        title="Connected Apps & Extensions"
        description="Manage external tools, browser extensions and messaging apps linked to your Branta account."
        icon={ShieldCheck}
      >
        <div className="space-y-3">
          <ConnectedAppsCard />
          <TelegramConnectCard />
        </div>
      </Section>
      <Section
        title="Notifications & Alerts"
        description="Choose which Branta Tech alerts and updates reach you."
        icon={ShieldCheck}
      >
        <NotificationPreferencesCard />
      </Section>
    </>
  );
}

