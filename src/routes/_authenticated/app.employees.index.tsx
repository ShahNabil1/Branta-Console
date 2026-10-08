import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import {
  DOMAIN,
  LOCAL_MAX,
  LOCAL_MIN,
  PASSWORD_LEN,
  generateTempPassword,
  localSchema,
  strongPasswordSchema,
  stripToLocal,
  stripToPassword,
} from "@/lib/branta-credentials";
import {
  checkIsAdmin,
  createEmployee,
  deleteEmployee,
  listEmployees,
  syncRecentEmailEvents,
} from "@/lib/employees.functions";
import { cn } from "@/lib/utils";

import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import { EmployeesDirectory } from "@/components/branta/employees-directory";

export const Route = createFileRoute("/_authenticated/app/employees/")({
  head: () => ({
    meta: [
      { title: "Employee Directory · Branta Tech" },
      { name: "description", content: "Manage Branta Tech employee accounts, roles, access, and onboarding." },
      { property: "og:title", content: "Employee Directory · Branta Tech" },
      { property: "og:description", content: "Manage Branta Tech employee accounts, roles, access, and onboarding." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireSuperAdmin>
      <EmployeesPage />
    </RequireSuperAdmin>
  ),
});

type Role = "super_admin" | "admin" | "finance" | "manager" | "user";
const ROLE_OPTIONS: { value: Role; label: string; note: string }[] = [
  { value: "user", label: "User", note: "Standard operator access." },
  { value: "manager", label: "Manager", note: "Team lead — extended read access." },
  { value: "finance", label: "Finance", note: "Full finance CRUD access." },
  { value: "admin", label: "Admin", note: "Manages employees and settings." },
  { value: "super_admin", label: "Super admin", note: "Full unrestricted access." },
];

const roleBadge = (role: string) => {
  switch (role) {
    case "super_admin":
      return "border-brand/40 bg-brand/10 text-brand";
    case "admin":
      return "border-violet-300 bg-violet-50 text-violet-700";
    case "finance":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "manager":
      return "border-sky-300 bg-sky-50 text-sky-700";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
};

// Brevo event names (canonicalised on the server) → UI label + color.
const EVENT_STYLES: Record<
  string,
  { label: string; className: string; tone: "ok" | "warn" | "bad" | "info" }
> = {
  sent: { label: "Sent", className: "border-border bg-muted text-muted-foreground", tone: "info" },
  delivered: { label: "Delivered", className: "border-emerald-300 bg-emerald-50 text-emerald-700", tone: "ok" },
  opened: { label: "Opened", className: "border-sky-300 bg-sky-50 text-sky-700", tone: "ok" },
  clicked: { label: "Clicked", className: "border-indigo-300 bg-indigo-50 text-indigo-700", tone: "ok" },
  deferred: { label: "Deferred", className: "border-amber-300 bg-amber-50 text-amber-700", tone: "warn" },
  soft_bounce: { label: "Soft bounce", className: "border-amber-300 bg-amber-50 text-amber-700", tone: "warn" },
  hard_bounce: { label: "Hard bounce", className: "border-rose-300 bg-rose-50 text-rose-700", tone: "bad" },
  blocked: { label: "Blocked", className: "border-rose-300 bg-rose-50 text-rose-700", tone: "bad" },
  spam: { label: "Marked spam", className: "border-rose-300 bg-rose-50 text-rose-700", tone: "bad" },
  invalid_email: { label: "Invalid", className: "border-rose-300 bg-rose-50 text-rose-700", tone: "bad" },
  error: { label: "Error", className: "border-rose-300 bg-rose-50 text-rose-700", tone: "bad" },
  unsubscribed: { label: "Unsubscribed", className: "border-violet-300 bg-violet-50 text-violet-700", tone: "warn" },
};

interface EmailEventRow {
  id: string;
  event: string;
  email: string;
  subject: string | null;
  reason: string | null;
  occurred_at: string;
}

// Realtime hook: pulls the 500 most recent email_events, subscribes to inserts,
// and returns the latest event per lower-cased email + full timeline per email.
function useEmailEvents(enabled: boolean, syncRecent: () => Promise<unknown>) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["email_events.recent"],
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async () => {
      try {
        await syncRecent();
      } catch (error) {
        console.error("[email-events] Brevo sync failed", error);
      }
      const { data, error } = await supabase
        .from("email_events")
        .select("id, event, email, subject, reason, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EmailEventRow[];
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("email_events:stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "email_events" },
        (payload) => {
          const row = payload.new as EmailEventRow;
          qc.setQueryData<EmailEventRow[]>(
            ["email_events.recent"],
            (prev) => {
              const next = [row, ...(prev ?? [])];
              // Keep list bounded so browser memory doesn't grow forever.
              return next.slice(0, 500);
            },
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);

  const byEmail = useMemo(() => {
    const map = new Map<string, EmailEventRow[]>();
    (query.data ?? []).forEach((row) => {
      const key = row.email.toLowerCase();
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    });
    return map;
  }, [query.data]);

  return { byEmail, isLoading: query.isLoading };
}

const timeAgo = (iso: string): string => {
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "";
  const diff = Math.max(0, Date.now() - d);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

function EmployeesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const isAdminFn = useServerFn(checkIsAdmin);
  const listFn = useServerFn(listEmployees);
  const deleteFn = useServerFn(deleteEmployee);
  const syncEmailEventsFn = useServerFn(syncRecentEmailEvents);

  const admin = useQuery({
    queryKey: ["employees.admin"],
    queryFn: () => isAdminFn(),
  });

  const employees = useQuery({
    queryKey: ["employees.list"],
    queryFn: () => listFn(),
    enabled: !!admin.data?.isAdmin,
  });

  const del = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: (res) => {
      if (res.result === "deleted") toast.success("Employee permanently deleted (no business history)");
      else toast.success(`This employee has business history and cannot be permanently deleted, so they were deactivated (${Object.entries(res.blockers ?? {}).map(([k, v]) => `${v} ${k}`).join(", ")}).`);
      void qc.invalidateQueries({ queryKey: ["employees.list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [open, setOpen] = useState(false);

  const { byEmail: emailEvents } = useEmailEvents(
    !!admin.data?.isAdmin,
    () => syncEmailEventsFn(),
  );

  if (admin.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (!admin.data?.isAdmin) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <ShieldCheck className="mx-auto size-6 text-muted-foreground" strokeWidth={1.5} />
          <h1 className="mt-2 text-lg font-semibold">Restricted area</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You need an admin role to manage employees.
          </p>
          <button
            onClick={() => navigate({ to: "/app" })}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-sm bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-700"
          >
            Return to console
          </button>
        </div>
      </div>
    );
  }

  const rows = employees.data ?? [];

  return (
    <EmployeesDirectory
      rows={rows}
      loading={employees.isLoading}
      emailEvents={emailEvents}
      onOpen={(userId) => navigate({ to: "/app/employees/$userId", params: { userId } })}
      onCreate={() => setOpen(true)}
    >
      {del.isError && (
        <div className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {del.error instanceof Error ? del.error.message : "Failed to remove employee."}
        </div>
      )}

      {open && (
        <CreateEmployeeModal
          onClose={() => setOpen(false)}
          canCreateSuperAdmin={!!admin.data?.isSuperAdmin}
        />
      )}

    </EmployeesDirectory>
  );
}

function CreateEmployeeModal({
  onClose,
  canCreateSuperAdmin,
}: {
  onClose: () => void;
  canCreateSuperAdmin: boolean;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createEmployee);

  const [local, setLocal] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [showPw, setShowPw] = useState(true);
  const [copied, setCopied] = useState(false);
  const [localHint, setLocalHint] = useState<string | null>(null);
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const localTimer = useRef<number | null>(null);
  const passwordTimer = useRef<number | null>(null);

  const flashLocalHint = (msg: string) => {
    setLocalHint(msg);
    if (localTimer.current) window.clearTimeout(localTimer.current);
    localTimer.current = window.setTimeout(() => setLocalHint(null), 2400);
  };
  const flashPasswordHint = (msg: string) => {
    setPasswordHint(msg);
    if (passwordTimer.current) window.clearTimeout(passwordTimer.current);
    passwordTimer.current = window.setTimeout(() => setPasswordHint(null), 2400);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          local,
          password,
          role,
          fullName: fullName.trim() || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees.list"] });
      onClose();
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : "Failed to create employee."),
  });

  const validateLocal = (v: string) => {
    if (!v) return setLocalError(null);
    const r = localSchema.safeParse(v);
    setLocalError(r.success ? null : r.error.issues[0]?.message ?? null);
  };
  const validatePassword = (v: string) => {
    if (!v) return setPasswordError(null);
    const r = strongPasswordSchema.safeParse(v);
    setPasswordError(r.success ? null : r.error.issues[0]?.message ?? null);
  };

  const onGenerate = () => {
    const pw = generateTempPassword();
    setPassword(pw);
    setPasswordError(null);
    setShowPw(true);
  };

  const onCopyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = password;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const canSubmit = useMemo(
    () =>
      !create.isPending &&
      !localError &&
      !passwordError &&
      local.length >= LOCAL_MIN &&
      password.length === PASSWORD_LEN,
    [create.isPending, localError, passwordError, local, password],
  );

  const roleOptions = canCreateSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((r) => r.value !== "super_admin");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const r = localSchema.safeParse(local);
    if (!r.success) return setLocalError(r.error.issues[0]?.message ?? "Invalid Branta ID.");
    const pr = strongPasswordSchema.safeParse(password);
    if (!pr.success) return setPasswordError(pr.error.issues[0]?.message ?? "Invalid password.");
    create.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[calc(100dvh-0.5rem)] w-full max-w-md flex-col overflow-hidden rounded-t-md border border-border bg-card shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-sm">
        <div className="shrink-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              New employee
            </div>
            <div className="mt-0.5 text-[15px] font-semibold">Create Console access</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5" noValidate>
          {/* Branta ID */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="emp-local" className="block text-[12px] font-medium text-muted-foreground">
                Branta ID
              </label>
              {(local.length > 0 && local.length < LOCAL_MIN) || local.length >= LOCAL_MAX ? (
                <span
                  className={cn(
                    "text-[10px] font-mono tabular-nums",
                    local.length >= LOCAL_MAX ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {local.length}/{LOCAL_MAX}
                </span>
              ) : null}
            </div>
            <div
              className={cn(
                "grid h-10 w-full grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-sm border bg-card transition-colors sm:h-9",
                localError ? "border-rose-500" : localHint ? "border-amber-400" : "border-border",
              )}
            >
              <input
                id="emp-local"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                lang="en"
                maxLength={LOCAL_MAX}
                value={local}
                onBeforeInput={(e) => {
                  const ev = e as unknown as InputEvent;
                  const incoming = ev.data ?? "";
                  if (incoming && /[^\x00-\x7F]/.test(incoming))
                    flashLocalHint("Only english letters (a–z) are allowed.");
                  else if (local.length >= LOCAL_MAX && incoming)
                    flashLocalHint(`Maximum ${LOCAL_MAX} characters.`);
                }}
                onChange={(e) => {
                  const raw = e.target.value;
                  const cleaned = stripToLocal(raw);
                  if (raw !== cleaned && /[^\x00-\x7F]/.test(raw))
                    flashLocalHint("Only english letters (a–z) are allowed.");
                  setLocal(cleaned);
                  validateLocal(cleaned);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text");
                  const cleaned = stripToLocal(local + text);
                  if (/[^\x00-\x7F]/.test(text))
                    flashLocalHint("Only english letters (a–z) are allowed.");
                  setLocal(cleaned);
                  validateLocal(cleaned);
                }}
                onBlur={(e) => validateLocal(e.target.value)}
                aria-invalid={!!localError}
                className={cn(
                  "min-w-0 bg-transparent px-3 font-mono text-[13px] outline-none transition-shadow focus:ring-1 focus:ring-inset",
                  localError ? "focus:ring-rose-500" : "focus:ring-brand",
                )}
              />
              <div
                aria-hidden="true"
                className="grid max-w-[46vw] select-none place-items-center overflow-hidden border-l border-border bg-muted px-2 font-mono text-[12px] font-semibold text-brand sm:max-w-none sm:px-3 sm:text-[13px]"
              >
                {DOMAIN}
              </div>
            </div>
            <div className="mt-1.5 flex min-h-[14px] items-center gap-1 text-[11px]">
              {localError ? (
                <>
                  <AlertCircle className="size-3 text-rose-600" strokeWidth={2} />
                  <span className="text-rose-600">{localError}</span>
                </>
              ) : localHint ? (
                <>
                  <AlertCircle className="size-3 text-amber-700" strokeWidth={2} />
                  <span className="text-amber-700">{localHint}</span>
                </>
              ) : null}
            </div>
          </div>

          {/* Full name (optional) */}
          <div>
            <label htmlFor="emp-name" className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              Full name <span className="text-muted-foreground/70">(optional)</span>
            </label>
            <input
              id="emp-name"
              type="text"
              maxLength={120}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-9 w-full rounded-sm border border-border bg-card px-3 text-[13px] outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="e.g. Sabrina Rahman"
            />
          </div>

          {/* Password */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="emp-pw" className="block text-[12px] font-medium text-muted-foreground">
                Temporary password
              </label>
              <button
                type="button"
                onClick={onGenerate}
                className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground transition-colors hover:bg-muted"
              >
                <RefreshCw className="size-3" strokeWidth={2} />
                Generate
              </button>
            </div>
            <div className="relative">
              <input
                id="emp-pw"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                spellCheck={false}
                lang="en"
                maxLength={PASSWORD_LEN}
                value={password}
                onChange={(e) => {
                  const cleaned = stripToPassword(e.target.value);
                  if (e.target.value !== cleaned && /[^\x20-\x7E]/.test(e.target.value))
                    flashPasswordHint("Only english characters are allowed.");
                  setPassword(cleaned);
                  validatePassword(cleaned);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text");
                  const cleaned = stripToPassword(password + text);
                  if (/[^\x20-\x7E]/.test(text))
                    flashPasswordHint("Only english characters are allowed.");
                  setPassword(cleaned);
                  validatePassword(cleaned);
                }}
                className={cn(
                  "h-9 w-full rounded-sm border bg-card px-3 pr-[70px] font-mono text-[13px] outline-none transition-shadow focus:ring-1",
                  passwordError
                    ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500"
                    : passwordHint
                      ? "border-amber-400 focus:border-amber-400 focus:ring-amber-400"
                      : "border-border focus:border-brand focus:ring-brand",
                )}
                placeholder="Click Generate to create one"
              />
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                <button
                  type="button"
                  onClick={onCopyPassword}
                  disabled={!password}
                  aria-label={copied ? "Copied" : "Copy password"}
                  className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-600" strokeWidth={2.25} />
                  ) : (
                    <Copy className="size-3.5" strokeWidth={1.75} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {showPw ? (
                    <EyeOff className="size-3.5" strokeWidth={1.75} />
                  ) : (
                    <Eye className="size-3.5" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>
            <div className="mt-1.5 flex min-h-[14px] items-center gap-1 text-[11px]">
              {passwordError ? (
                <>
                  <AlertCircle className="size-3 text-rose-600" strokeWidth={2} />
                  <span className="text-rose-600">{passwordError}</span>
                </>
              ) : passwordHint ? (
                <>
                  <AlertCircle className="size-3 text-amber-700" strokeWidth={2} />
                  <span className="text-amber-700">{passwordHint}</span>
                </>
              ) : password ? (
                <span className="text-muted-foreground">
                  Must include lowercase, uppercase, digit and symbol — exactly {PASSWORD_LEN} characters.
                </span>
              ) : null}
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">Role</label>
            <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
              {roleOptions.map((r) => {
                const active = role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={cn(
                      "rounded-sm border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-brand bg-brand/5"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <div className="text-[12.5px] font-semibold text-foreground">{r.label}</div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">{r.note}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {formError && (
            <div className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {formError}
            </div>
          )}

          <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-card px-4 pb-1 pt-3 sm:-mx-5 sm:px-5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-sm border border-border bg-card px-4 text-[13px] font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-9 items-center gap-2 rounded-sm bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {create.isPending ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
