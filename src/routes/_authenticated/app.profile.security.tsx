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
import { PASSWORD_LEN, stripToPassword } from "@/lib/branta-credentials";
import { TelegramConnectCard } from "@/components/profile/telegram-connect-card";

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
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-sm bg-brand/10 text-brand">
            <Icon className="size-4" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SecurityTab() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
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
        <div className="flex items-center justify-between gap-3">
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
  const [busy, setBusy] = useState(false);

  const startAdd = async () => {
    if (!name.trim()) {
      toast.error("Give this passkey a name so you can recognize it later.");
      return;
    }
    setBusy(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const options = await begin({ data: { friendly_name: name.trim() } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attestation = await startRegistration({ optionsJSON: options as any });
      await finish({
        data: { attestation_response: attestation, friendly_name: name.trim() },
      });
      toast.success("Passkey added");
      setAddOpen(false);
      setName("");
      await qc.invalidateQueries({ queryKey: ["me", "passkeys"] });
    } catch (err) {
      toast.error("Could not add passkey", { description: (err as Error).message });
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
                <div className="grid size-9 shrink-0 place-items-center rounded-sm bg-muted">
                  <Fingerprint className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {p.friendly_name ?? "Untitled passkey"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
                    <span>{p.device_type ?? "Device"}</span>
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
            <Label className="text-[12px] font-semibold text-muted-foreground">
              Name this passkey
            </Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              placeholder="e.g. MacBook Touch ID"
              className="h-9 rounded-sm"
            />
            <p className="text-[11.5px] text-muted-foreground">
              Your browser will ask for biometric verification (Face ID, Touch
              ID, Windows Hello, or a security key). Nothing is stored on our
              servers except the public credential.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={startAdd} disabled={busy || !name.trim()}>
              {busy ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Verifying…</> : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ---------- Change password ----------

function ChangePasswordSection() {
  const change = useServerFn(changeMyPassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    current.length > 0 &&
    next.length === PASSWORD_LEN &&
    !mismatch &&
    next !== current;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await change({ data: { current_password: current, new_password: next } });
      toast.success("Password updated");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Change Password"
      description={`Passwords are exactly ${PASSWORD_LEN} characters — one lowercase, one uppercase, one digit, one symbol.`}
      icon={Lock}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Current password
          </Label>
          <Input
            type="password"
            className="h-9 rounded-sm font-mono text-[12px]"
            value={current}
            onChange={(e) => setCurrent(stripToPassword(e.target.value))}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            New password
          </Label>
          <Input
            type="password"
            className="h-9 rounded-sm font-mono text-[12px]"
            value={next}
            onChange={(e) => setNext(stripToPassword(e.target.value))}
            autoComplete="new-password"
            maxLength={PASSWORD_LEN}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Confirm new password
          </Label>
          <Input
            type="password"
            className={cn(
              "h-9 rounded-sm font-mono text-[12px]",
              mismatch && "border-red-500",
            )}
            value={confirm}
            onChange={(e) => setConfirm(stripToPassword(e.target.value))}
            autoComplete="new-password"
            maxLength={PASSWORD_LEN}
          />
          {mismatch && (
            <p className="text-[11px] text-red-600">Passwords don't match.</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={submit}
          disabled={!canSubmit || busy}
          className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-brand-700"
        >
          {busy ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Updating…</> : "Update password"}
        </Button>
      </div>
    </Section>
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
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
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
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">
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
                      {s.ip && <><span>·</span><span className="font-mono">{s.ip}</span></>}
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
    </Section>
  );
}

// ---------- Notifications ----------

function NotificationsPlaceholder() {
  return (
    <Section
      title="Notifications"
      description="Choose where Branta Tech alerts reach you. More channels coming soon."
      icon={ShieldCheck}
    >
      <div className="space-y-3">
        <TelegramConnectCard />
        <div className="rounded-sm border border-dashed border-border bg-muted/30 px-4 py-3 text-[11.5px] text-muted-foreground">
          Email and in-app notification preferences will land here after
          event triggers are wired.
        </div>
      </div>
    </Section>
  );
}

