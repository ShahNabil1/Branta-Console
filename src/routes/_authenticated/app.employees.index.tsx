import { ROLE_LABEL, ROLE_NOTE } from "@/lib/role-access";
import { toast } from "sonner";
import { TestLoader } from "@/components/ui/test-loader";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import admakaiLogo from "@/assets/apps/admakai.png";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDestinationRoutes, deleteCloudflareRoute } from "@/lib/employee-offboard.functions";
import { Progress } from "@/components/ui/progress";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Trash2, CircleCheck, CircleX, Search } from "lucide-react";
import { GmailMark } from "@/components/company/google-account-card";
import cfRoutingIcon from "@/assets/integrations/cloudflare-email-routing.png.asset.json";

const ROW_DELETE_STYLE = { height: 28, padding: "0 10px", fontSize: 11 } as const;
function RowDeleteButton({
  disabled,
  onClick,
  label,
  ariaLabel,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] bg-destructive font-semibold text-destructive-foreground disabled:opacity-50"
      style={ROW_DELETE_STYLE}
    >
      <Trash2 className="size-3.5" strokeWidth={2} />
      {label}
    </button>
  );
}
function RoutingIcon() {
  return (
    <img
      src={cfRoutingIcon.url}
      alt="Cloudflare Email Routing"
      className="size-5 shrink-0 object-cover"
    />
  );
}
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  AtSign,
  KeyRound,
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
  checkEmailDestination,
  listEmailDestinations,
  prepareEmailRouting,
  deleteEmployee,
  listEmployees,
} from "@/lib/employees.functions";
import { cn } from "@/lib/utils";

import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import { EmployeesDirectory } from "@/components/branta/employees-directory";
import { CloudflareMark, DrawerHero, StepPills } from "@/components/branta/page-hero";
import { Button } from "@/components/ui/button";
import { MailActivity } from "@/components/employee/mail-activity";
import { WorkspaceAccess } from "@/components/employee/workspace-access";
import { CompanyRolePicker, type CompanyRole } from "@/components/employee/company-role-picker";

export const Route = createFileRoute("/_authenticated/app/employees/")({
  head: () => ({
    meta: [
      { title: "Employee Directory · Branta Tech" },
      {
        name: "description",
        content: "Manage Branta Tech employee accounts, roles, access, and onboarding.",
      },
      { property: "og:title", content: "Employee Directory · Branta Tech" },
      {
        property: "og:description",
        content: "Manage Branta Tech employee accounts, roles, access, and onboarding.",
      },
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

type Role = "super_admin" | "admin" | "finance" | "manager" | "coo" | "user";
const ROLE_OPTIONS: { value: Role; label: string; note: string }[] = (["user", "manager", "coo", "admin", "finance", "super_admin"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r], note: ROLE_NOTE[r] }));

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
  delivered: {
    label: "Delivered",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700",
    tone: "ok",
  },
  opened: { label: "Opened", className: "border-sky-300 bg-sky-50 text-sky-700", tone: "ok" },
  clicked: {
    label: "Clicked",
    className: "border-indigo-300 bg-indigo-50 text-indigo-700",
    tone: "ok",
  },
  deferred: {
    label: "Deferred",
    className: "border-amber-300 bg-amber-50 text-amber-700",
    tone: "warn",
  },
  soft_bounce: {
    label: "Soft bounce",
    className: "border-amber-300 bg-amber-50 text-amber-700",
    tone: "warn",
  },
  hard_bounce: {
    label: "Hard bounce",
    className: "border-rose-300 bg-rose-50 text-rose-700",
    tone: "bad",
  },
  blocked: { label: "Blocked", className: "border-rose-300 bg-rose-50 text-rose-700", tone: "bad" },
  spam: {
    label: "Marked spam",
    className: "border-rose-300 bg-rose-50 text-rose-700",
    tone: "bad",
  },
  invalid_email: {
    label: "Invalid",
    className: "border-rose-300 bg-rose-50 text-rose-700",
    tone: "bad",
  },
  error: { label: "Error", className: "border-rose-300 bg-rose-50 text-rose-700", tone: "bad" },
  unsubscribed: {
    label: "Unsubscribed",
    className: "border-violet-300 bg-violet-50 text-violet-700",
    tone: "warn",
  },
};

export function EmployeesPage({ companySlug }: { companySlug?: string } = {}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const isAdminFn = useServerFn(checkIsAdmin);
  const listFn = useServerFn(listEmployees);
  const deleteFn = useServerFn(deleteEmployee);

  const admin = useQuery({
    queryKey: ["employees.admin", companySlug ?? "all"],
    queryFn: () => isAdminFn({ data: { companySlug } }),
  });

  const employees = useQuery({
    queryKey: ["employees.list", companySlug ?? "all"],
    queryFn: () => listFn({ data: { companySlug } }),
    enabled: !!admin.data?.isAdmin,
  });

  const del = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: (res) => {
      if (res.result === "deleted")
        toast.success("Employee permanently deleted (no business history)");
      else
        toast.success(
          `This employee has business history and cannot be permanently deleted, so they were deactivated (${Object.entries(
            res.blockers ?? {},
          )
            .map(([k, v]) => `${v} ${k}`)
            .join(", ")}).`,
        );
      void qc.invalidateQueries({ queryKey: ["employees.list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [startDest, setStartDest] = useState(false);

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
      onOpen={(userId) => navigate({ to: "/app/employees/$userId", params: { userId } })}
      onCreate={() => {
        setStartDest(false);
        setOpen(true);
      }}
      onRouting={() => {
        setStartDest(true);
        setOpen(true);
      }}
    >
      {del.isError && (
        <div className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {del.error instanceof Error ? del.error.message : "Failed to remove employee."}
        </div>
      )}

      <CreateEmployeeModal
        key={formKey}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          setFormKey((k) => k + 1);
        }}
        canCreateSuperAdmin={!!admin.data?.isSuperAdmin}
        startInDest={startDest}
      />
    </EmployeesDirectory>
  );
}

function CreateEmployeeModal({
  open,
  onClose,
  onCreated,
  canCreateSuperAdmin,
  startInDest = false,
}: {
  startInDest?: boolean;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  canCreateSuperAdmin: boolean;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createEmployee);

  const [local, setLocal] = useState("");
  const [created, setCreated] = useState<{
    email: string;
    gmail: string;
    password: string;
    userId: string;
  } | null>(null);
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
  const [gmail, setGmail] = useState("");
  const [gmailStatus, setGmailStatus] = useState<
    "idle" | "checking" | "verified" | "pending" | "unconfigured" | "error"
  >("idle");
  const [gmailMsg, setGmailMsg] = useState<string | null>(null);
  const manualRouting = false as boolean;
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyIsHolding, setCompanyIsHolding] = useState(true);
  const [companyRole, setCompanyRole] = useState<CompanyRole>("member");
  const [generating, setGenerating] = useState(false);
  const checkFn = useServerFn(checkEmailDestination);
  const prepFn = useServerFn(prepareEmailRouting);
  const [step, setStep] = useState(1);
  const [showDest, setShowDest] = useState(startInDest);
  useEffect(() => {
    if (open) setShowDest(startInDest);
  }, [open, startInDest]);
  const [routeStage, setRouteStage] = useState<RouteStage>("idle");
  const [routeMsg, setRouteMsg] = useState<string | null>(null);
  const routeBusy = ["checking", "creating", "verifying"].includes(routeStage);
  useEffect(() => {
    setRouteStage("idle");
    setRouteMsg(null);
  }, [local, gmail]);
  const runRouting = async () => {
    const g = gmail.trim().toLowerCase();
    setRouteMsg(null);
    try {
      setRouteStage("checking");
      await prepFn({ data: { local, gmail: g, stage: "id" } });
      setRouteStage("creating");
      const r = await prepFn({ data: { local, gmail: g, stage: "rule" } });
      setRouteStage("verifying");
      for (let i = 0; i < 6; i++) {
        const v = await prepFn({
          data: { local, gmail: g, stage: "verify", ruleId: r.ruleId ?? undefined },
        });
        if (v.ok) {
          setRouteStage("active");
          return;
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
      throw new Error("Cloudflare has not activated the rule yet. Try again in a moment.");
    } catch (e) {
      setRouteStage("error");
      setRouteMsg(e instanceof Error ? e.message : "Routing failed.");
    }
  };
  const gmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail.trim());
  const onCheckGmail = async () => {
    if (!gmailOk) return;
    setGmailStatus("checking");
    setGmailMsg(null);
    try {
      const r = await checkFn({ data: { gmail: gmail.trim().toLowerCase() } });
      setGmailStatus(r.status);
    } catch (e) {
      setGmailStatus("error");
      setGmailMsg(e instanceof Error ? e.message : "Check failed.");
    }
  };
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

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          local,
          password,
          fullName: fullName.trim() || undefined,
          personalGmail: gmailOk ? gmail.trim().toLowerCase() : undefined,
          skipRouting: manualRouting,
          companyId: companyId!,
          role: companyIsHolding ? role : "user",
          companyRole: companyIsHolding ? undefined : companyRole,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["employees.list"] });
      qc.invalidateQueries({ queryKey: ["cf.destinations"] });
      toast.success("Employee created — welcome email handed to Brevo.");
      setCreated({
        email: `${local}${DOMAIN}`,
        gmail: gmailOk ? gmail.trim().toLowerCase() : "",
        password,
        userId: res.userId,
      });
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : "Failed to create employee."),
  });

  const validateLocal = (v: string) => {
    if (!v) return setLocalError(null);
    const r = localSchema.safeParse(v);
    setLocalError(r.success ? null : (r.error.issues[0]?.message ?? null));
  };
  const validatePassword = (v: string) => {
    if (!v) return setPasswordError(null);
    const r = strongPasswordSchema.safeParse(v);
    setPasswordError(r.success ? null : (r.error.issues[0]?.message ?? null));
  };

  const onGenerate = () => {
    if (generating) return;
    setGenerating(true);
    window.setTimeout(() => {
      setPassword(generateTempPassword());
      setPasswordError(null);
      setShowPw(true);
      setGenerating(false);
    }, 450);
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
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
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
      password.length === PASSWORD_LEN &&
      !!companyId &&
      (manualRouting || gmailStatus === "verified"),
    [companyId, create.isPending, localError, passwordError, local, password, manualRouting, gmailStatus],
  );

  const roleOptions = canCreateSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((r) => r.value !== "super_admin");

  const onSubmit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (step !== 3) return;
    setFormError(null);
    const r = localSchema.safeParse(local);
    if (!r.success) return setLocalError(r.error.issues[0]?.message ?? "Invalid Branta ID.");
    const pr = strongPasswordSchema.safeParse(password);
    if (!pr.success) return setPasswordError(pr.error.issues[0]?.message ?? "Invalid password.");
    create.mutate();
  };

  const step1Done = manualRouting || gmailStatus === "verified";
  const step2Done =
    !localError && local.length >= LOCAL_MIN && (manualRouting || routeStage === "active");

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          if (created) onCreated();
          else onClose();
        }
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        {created && (
          <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-card p-4 pr-12 sm:p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Account ready · 100%
            </div>
            <SheetTitle className="mt-0.5 text-[15px] font-semibold">
              Console access created
            </SheetTitle>
            <div className="mt-2 h-1 rounded-full bg-emerald-500" />
            <p className="mt-3 break-all font-mono text-[12px]">{created.email}</p>
            <div className="mt-3 rounded-sm border border-border p-3">
              <div className="text-[11px] font-semibold text-muted-foreground">
                Temporary password (fallback if the mail does not arrive)
              </div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 select-all break-all rounded-sm bg-muted px-2 py-1.5 font-mono text-[14px]">
                  {created.password}
                </code>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-sm border border-border px-2 text-[12px] font-semibold hover:bg-muted"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `Login: ${created.email}\nTemporary password: ${created.password}`,
                      );
                      toast.success("Credentials copied");
                    } catch {
                      toast.error("Copy unavailable. Select the password manually.");
                    }
                  }}
                >
                  <Copy className="size-3.5" /> Copy
                </button>
              </div>
            </div>
            <div className="mt-3">
              <WorkspaceAccess userId={created.userId} compact />
            </div>
            <div className="mt-3">
              <MailActivity emails={[created.email, created.gmail]} />
            </div>
            <button
              type="button"
              onClick={onCreated}
              className="mt-4 inline-flex h-9 shrink-0 items-center justify-center rounded-sm bg-brand px-4 text-[13px] font-semibold text-primary-foreground hover:bg-brand-700"
            >
              Done
            </button>
          </div>
        )}
        <DrawerHero
          title={showDest ? "Email Routing" : "Create employee"}
          subtitle={
            showDest
              ? "Cloudflare destinations and forwarding rules for Branta addresses."
              : "Set up Console access, a Branta address and mail forwarding."
          }
          aside={
            showDest ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDest(false)}
                className="gap-1 active:scale-95"
              >
                <Plus className="size-3.5" /> Create employee
              </Button>
            ) : (
              <CloudflareMark className="mt-1 size-6 shrink-0" />
            )
          }
        >
          {!showDest && (
            <StepPills
              steps={[
                { label: "Destination", icon: Mail },
                { label: "Branta ID", icon: AtSign },
                { label: "Access", icon: KeyRound },
              ]}
              step={step - 1}
              isDone={(i) =>
                i === 0 ? step1Done && step > 1 : i === 1 ? step2Done && step > 2 : false
              }
              canGo={(i) =>
                i === 0 || (i === 1 && step1Done) || (i === 2 && step1Done && step2Done)
              }
              onGo={(i) => setStep(i + 1)}
            />
          )}
        </DrawerHero>

        {showDest ? (
          <DestinationsPanel />
        ) : (
          <form onSubmit={onSubmit} className="min-h-0 flex-1 overflow-y-auto" noValidate>
            <div
              key={step}
              className="space-y-4 px-6 py-5 animate-in fade-in-0 slide-in-from-right-4 duration-300"
            >
              {step === 1 && (
                <>
                  <StepGuide
                    title="Step 1 · Check the destination Gmail"
                    items={[
                      "Enter the employee's personal Gmail and press Verify. Console checks it in Cloudflare.",
                      "Already verified → you can continue right away.",
                      "New Gmail → Cloudflare emails the employee a verification link. You can close this drawer and work on other accounts; your progress stays here. Press Check again once they click it.",
                      "If this Gmail already forwards for an existing Console account, creation is blocked.",
                    ]}
                  />
                  {/* Personal Gmail + Cloudflare routing */}
                  <div>
                    <label
                      htmlFor="emp-gmail"
                      className="mb-1.5 block text-[12px] font-medium text-muted-foreground"
                    >
                      Personal Gmail{" "}
                      <span className="text-muted-foreground/70">(mail forwarding)</span>
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        id="emp-gmail"
                        type="email"
                        autoComplete="off"
                        maxLength={200}
                        value={gmail}
                        disabled={manualRouting}
                        onChange={(e) => {
                          setGmail(e.target.value);
                          setGmailStatus("idle");
                          setGmailMsg(null);
                        }}
                        className="h-9 min-w-0 flex-1 rounded-sm border border-border bg-card px-3 text-[13px] outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
                        placeholder="e.g. sabrina@gmail.com"
                      />
                      <button
                        type="button"
                        onClick={onCheckGmail}
                        disabled={manualRouting || !gmailOk || gmailStatus === "checking"}
                        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-sm border border-border bg-card px-3 text-[12px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <TestLoader tone="verify" active={gmailStatus === "checking"} />
                        {gmailStatus === "pending" ? "Check again" : "Verify"}
                      </button>
                    </div>
                    <div className="mt-1.5 flex min-h-[14px] items-center gap-1 text-[11px]">
                      {manualRouting ? (
                        <span className="text-muted-foreground">
                          Routing skipped — set it up in Cloudflare yourself.
                        </span>
                      ) : gmailStatus === "verified" ? (
                        <>
                          <Check className="size-3 text-emerald-600" strokeWidth={2.25} />
                          <span className="text-emerald-700">
                            Verified — forwarding will be created automatically.
                          </span>
                        </>
                      ) : gmailStatus === "pending" ? (
                        <>
                          <AlertCircle className="size-3 text-amber-700" strokeWidth={2} />
                          <span className="text-amber-700">
                            Verification email sent by Cloudflare. Ask the employee to click it,
                            then Check again.
                          </span>
                        </>
                      ) : gmailStatus === "unconfigured" ? (
                        <span className="text-rose-600">
                          Cloudflare is not configured — use manual routing.
                        </span>
                      ) : gmailStatus === "error" ? (
                        <span className="text-rose-600">{gmailMsg}</span>
                      ) : gmailOk ? (
                        <span className="text-muted-foreground">
                          Press Verify to check this Gmail in Cloudflare.
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <StepGuide
                    title="Step 2 · Set the Branta ID & email routing"
                    items={[
                      "Choose the Branta ID — it becomes the employee's @brantatech.com address.",
                      "Press Set up routing: Console checks the ID is free, creates the Cloudflare forwarding rule to the verified Gmail, then reads it back to confirm it is active.",
                      "Step 3 unlocks only when the rule is confirmed active.",
                    ]}
                  />
                  {/* Branta ID */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label
                        htmlFor="emp-local"
                        className="block text-[12px] font-medium text-muted-foreground"
                      >
                        Branta ID
                      </label>
                      {(local.length > 0 && local.length < LOCAL_MIN) ||
                      local.length >= LOCAL_MAX ? (
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
                        localError
                          ? "border-rose-500"
                          : localHint
                            ? "border-amber-400"
                            : "border-border",
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
                    <label
                      htmlFor="emp-name"
                      className="mb-1.5 block text-[12px] font-medium text-muted-foreground"
                    >
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

                  {!manualRouting && (
                    <div className="rounded-sm border border-border p-3">
                      <div className="mb-2 flex items-center justify-between text-[11.5px]">
                        <span className="font-semibold text-foreground">
                          {ROUTE_LABEL[routeStage]}
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {ROUTE_PCT[routeStage]}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-700 ease-out",
                            routeStage === "error"
                              ? "bg-rose-500"
                              : routeStage === "active"
                                ? "bg-emerald-500"
                                : "bg-brand",
                          )}
                          style={{ width: `${ROUTE_PCT[routeStage]}%` }}
                        />
                      </div>
                      {routeMsg && <div className="mt-2 text-[11px] text-rose-600">{routeMsg}</div>}
                      {routeStage !== "active" && (
                        <button
                          type="button"
                          onClick={runRouting}
                          disabled={routeBusy || !!localError || local.length < LOCAL_MIN}
                          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-sm bg-brand px-3 text-[12px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                        >
                          <TestLoader tone="white" active={routeBusy} />
                          {routeStage === "error" ? "Try again" : "Set up routing"}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <StepGuide
                    title="Step 3 · Password, role & app access"
                    items={[
                      "Generate a temporary password — the employee must change it on first sign-in.",
                      "Pick the company, then the role — it applies only inside that company (Branta Tech admins & finance cover every company).",
                      "Create user sends the welcome email with the Branta ID and temporary password to the verified Gmail.",
                    ]}
                  />
                  {/* Password */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label
                        htmlFor="emp-pw"
                        className="block text-[12px] font-medium text-muted-foreground"
                      >
                        Temporary password
                      </label>
                      <button
                        type="button"
                        onClick={onGenerate}
                        disabled={generating}
                        className="group inline-flex h-7 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 pl-2 pr-3 text-[11.5px] font-semibold text-brand shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-brand/60 hover:bg-brand/10 hover:shadow-md active:scale-95 disabled:pointer-events-none"
                      >
                        <TestLoader tone="refresh" active={generating} className="size-3.5" />
                        {generating ? "Generating…" : password ? "Regenerate" : "Generate"}
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
                          onPointerDown={(e) => e.preventDefault()}
                          onMouseDown={(e) => e.preventDefault()}
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
                          Must include lowercase, uppercase, digit and symbol — exactly{" "}
                          {PASSWORD_LEN} characters.
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <CompanyRolePicker
                    companyId={companyId}
                    onCompany={(id, h) => { setCompanyId(id); setCompanyIsHolding(h); }}
                    holdingRole={role}
                    onHoldingRole={setRole}
                    companyRole={companyRole}
                    onCompanyRole={setCompanyRole}
                    canSuperAdmin={canCreateSuperAdmin}
                  />

                  {formError && (
                    <div className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                      {formError}
                    </div>
                  )}
                </>
              )}
            </div>
          </form>
        )}

        {!showDest && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-6 py-4">
            <button
              type="button"
              onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
              className="h-9 rounded-sm border border-border bg-card px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              {step === 1 ? "Close" : "Back"}
            </button>
            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 ? !step1Done : !step2Done}
                onClick={() => setStep(step + 1)}
                className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-brand px-4 text-[13px] font-semibold text-white transition-all hover:bg-brand-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="inline-flex h-9 items-center gap-2 rounded-sm bg-brand px-4 text-[13px] font-semibold text-white transition-all hover:bg-brand-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
                {create.isPending ? "Creating…" : "Create user"}
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type RouteStage = "idle" | "checking" | "creating" | "verifying" | "active" | "error";
const ROUTE_PCT: Record<RouteStage, number> = {
  idle: 0,
  checking: 20,
  creating: 55,
  verifying: 85,
  active: 100,
  error: 100,
};
const ROUTE_LABEL: Record<RouteStage, string> = {
  idle: "Routing not set up yet",
  checking: "Checking Branta ID & Gmail in Cloudflare…",
  creating: "Creating forwarding rule…",
  verifying: "Confirming the rule is active…",
  active: "Routing active — mail forwards to the Gmail",
  error: "Routing failed",
};

function StepGuide({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-sm border border-brand/20 bg-brand/5 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        <Info className="size-3.5 text-brand" />
        {title}
      </div>
      <ul className="mt-1.5 space-y-1 pl-5 text-[11.5px] leading-relaxed text-muted-foreground [list-style:disc]">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

const EMPTY_COPY = {
  all: {
    title: "No destinations yet",
    body: "Gmail destinations appear here once they're added in Cloudflare Email Routing.",
  },
  verified: {
    title: "No verified destinations",
    body: "Destinations show up here after the owner confirms Cloudflare's verification email.",
  },
  unrouted: {
    title: "Every address is routed",
    body: "All verified destinations already have a forwarding rule. Nothing needs attention.",
  },
  pending: {
    title: "Nothing pending",
    body: "Every destination has confirmed Cloudflare's verification email.",
  },
} as const;

function RoutingEmpty({
  tone,
  title,
  body,
  action,
}: {
  tone: "empty" | "error" | "setup";
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  const ring =
    tone === "error"
      ? "bg-rose-500/10 text-rose-600"
      : tone === "setup"
        ? "bg-brand/10 text-brand"
        : "bg-emerald-500/10 text-emerald-600";
  return (
    <div className="relative my-4 overflow-hidden rounded-lg border border-border bg-card px-6 py-10 text-center shadow-sm animate-in fade-in-0 zoom-in-95 duration-300">
      <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 size-44 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative mx-auto flex w-fit items-center">
        <div className="grid size-11 place-items-center rounded-xl border border-border bg-card shadow-sm">
          <GmailMark className="size-5" />
        </div>
        <div className="h-px w-8 bg-gradient-to-r from-border via-brand/50 to-border" />
        <div
          className={cn(
            "grid size-11 place-items-center rounded-xl border border-border shadow-sm",
            ring,
          )}
        >
          {tone === "error" ? (
            <X className="size-5" />
          ) : tone === "setup" ? (
            <CloudflareMark className="size-6" />
          ) : (
            <Search className="size-5" />
          )}
        </div>
      </div>
      <div className="relative mt-4 text-[14px] font-bold tracking-tight text-foreground">
        {title}
      </div>
      <p className="relative mx-auto mt-1 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="relative mt-4 inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-[12px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:bg-muted active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function DestinationsPanel() {
  const listFn = useServerFn(listDestinationRoutes);
  const delFn = useServerFn(deleteCloudflareRoute);
  const confirmDlg = useConfirm();
  const qcd = useQueryClient();
  const [busy, setBusy] = useState<{ key: string; pct: number; label: string } | null>(null);
  const remove = async (kind: "rule" | "destination", value: string, rules: string[]) => {
    const ok = await confirmDlg({
      title: kind === "rule" ? "Delete routing rule?" : "Delete destination address?",
      description:
        kind === "rule"
          ? `Mail to ${value} will stop forwarding. This deletes the rule in Cloudflare.`
          : `Deletes the destination address ${value} from Cloudflare and every routing rule that forwards to it.`,
      points:
        kind === "rule"
          ? undefined
          : [
              `Remove destination ${value}`,
              ...(rules.length
                ? rules.map((r) => `Delete routing rule ${r}`)
                : ["No routing rules point at this address"]),
            ],
      safeLast: false,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const jobs: { kind: "rule" | "destination"; value: string }[] =
      kind === "rule"
        ? [{ kind, value }]
        : [...rules.map((r) => ({ kind: "rule" as const, value: r })), { kind, value }];
    const errs: string[] = [];
    for (let i = 0; i < jobs.length; i++) {
      setBusy({
        key: value,
        pct: Math.round((i / jobs.length) * 100),
        label: `Deleting ${jobs[i].kind === "rule" ? "rule " + jobs[i].value : "destination"}…`,
      });
      const r = await delFn({ data: jobs[i] }).catch((e) => ({
        status: "failed" as const,
        detail: e instanceof Error ? e.message : String(e),
      }));
      if (r.status === "failed") errs.push(r.detail);
      else if (r.status === "already") toast.info(r.detail);
    }
    setBusy({ key: value, pct: 100, label: "Done" });
    if (errs.length) toast.error(`Cloudflare: ${errs.join(" · ")}`);
    else
      toast.success(
        kind === "rule"
          ? `Routing rule for ${value} deleted`
          : `Destination ${value} deleted from Cloudflare`,
      );
    await qcd.invalidateQueries({ queryKey: ["cf.destinations"] });
    setBusy(null);
  };
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "verified" | "unrouted" | "pending">("all");
  const dest = useQuery({
    queryKey: ["cf.destinations"],
    queryFn: () => listFn(),
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const items = (dest.data?.items ?? []).filter(
    (d) =>
      (filter === "all" ||
        (filter === "verified" && d.verified) ||
        (filter === "pending" && !d.verified) ||
        (filter === "unrouted" && d.verified && d.rules.length === 0)) &&
      d.email.includes(q.trim().toLowerCase()),
  );
  const counts = {
    all: dest.data?.items.length ?? 0,
    verified: dest.data?.items.filter((d) => d.verified).length ?? 0,
    pending: dest.data?.items.filter((d) => !d.verified).length ?? 0,
    unrouted: dest.data?.items.filter((d) => d.verified && d.rules.length === 0).length ?? 0,
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 duration-300">
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex gap-1.5">
          <label className="group relative flex h-9 min-w-0 flex-1 items-center rounded-md border border-border bg-card shadow-sm transition-all focus-within:border-brand focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_14%,transparent)]">
            <Search className="pointer-events-none ml-3 size-3.5 shrink-0 text-muted-foreground transition-colors group-focus-within:text-brand" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Gmail destinations…"
              aria-label="Search Gmail destinations"
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground/70"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="mr-1.5 grid size-6 place-items-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-90"
              >
                <X className="size-3.5" />
              </button>
            ) : (
              <kbd className="mr-2 hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">
                {counts.all}
              </kbd>
            )}
          </label>
          <button
            type="button"
            onClick={() => dest.refetch()}
            aria-label="Refresh"
            className="grid size-9 shrink-0 place-items-center rounded-sm border border-border transition-colors hover:bg-muted"
          >
            <TestLoader tone="refresh" active={dest.isFetching} />
          </button>
        </div>
        <UnderlineTabs
          className="-mb-3"
          size="sm"
          ariaLabel="Destination filter"
          value={filter}
          onChange={setFilter}
          items={[
            { id: "all", label: "All", count: counts.all },
            {
              id: "verified",
              label: "Verified",
              count: counts.verified,
              lead: <span className="size-1.5 rounded-full bg-emerald-500" />,
            },
            {
              id: "unrouted",
              label: "Unrouted",
              count: counts.unrouted,
              lead: <span className="size-1.5 rounded-full bg-amber-500" />,
            },
            {
              id: "pending",
              label: "Pending",
              count: counts.pending,
              lead: <span className="size-1.5 rounded-full bg-rose-500" />,
            },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5">
        {dest.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading from Cloudflare…
          </div>
        ) : dest.isError ? (
          <RoutingEmpty
            tone="error"
            title="Couldn't reach Cloudflare"
            body={dest.error instanceof Error ? dest.error.message : "Failed to load."}
            action={{ label: "Try again", onClick: () => dest.refetch() }}
          />
        ) : dest.data && !dest.data.configured ? (
          <RoutingEmpty
            tone="setup"
            title="Email Routing isn't connected"
            body="Connect Cloudflare Email Routing to manage Gmail destinations and forwarding rules here."
          />
        ) : items.length === 0 ? (
          <RoutingEmpty
            tone="empty"
            title={q.trim() ? `No match for “${q.trim()}”` : EMPTY_COPY[filter].title}
            body={
              q.trim()
                ? "Try a different Gmail address, or clear the search to see every destination."
                : EMPTY_COPY[filter].body
            }
            action={
              q.trim()
                ? { label: "Clear search", onClick: () => setQ("") }
                : filter !== "all"
                  ? { label: "Show all destinations", onClick: () => setFilter("all") }
                  : undefined
            }
          />
        ) : (
          <ul className="space-y-2.5 py-1">
            {items.map((d) => {
              const working = busy?.key === d.email || d.rules.some((r) => r.from === busy?.key);
              return (
                <li
                  key={d.email}
                  className={cn(
                    "overflow-hidden rounded-md border bg-card shadow-sm transition-colors",
                    d.verified
                      ? d.rules.length
                        ? "border-border"
                        : "border-amber-200"
                      : "border-amber-300",
                  )}
                >
                  <div className="flex items-start gap-3 p-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card">
                      <GmailMark className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 self-center">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-mono text-[12.5px] font-semibold text-foreground">
                          {d.email}
                        </span>
                        {d.verified ? (
                          <CircleCheck
                            className="size-4 shrink-0 text-emerald-600"
                            aria-label="Verified"
                          />
                        ) : (
                          <CircleX
                            className="size-4 shrink-0 text-rose-600"
                            aria-label="Pending verification"
                          />
                        )}
                      </div>
                    </div>
                    <RowDeleteButton
                      disabled={!!busy}
                      onClick={() =>
                        remove(
                          "destination",
                          d.email,
                          d.rules.map((r) => r.from),
                        )
                      }
                      label="Remove"
                    />
                  </div>
                  <div className="border-t border-border bg-muted/30 px-3 py-2">
                    {d.rules.length === 0 ? (
                      <div
                        className="flex items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5"
                        title="No Branta address forwards here"
                      >
                        <RoutingIcon />
                        <span className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-brand via-amber-400 to-rose-500" />
                        <CircleX
                          className="size-4 shrink-0 text-rose-600"
                          aria-label="Not routed"
                        />
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {d.rules.map((r) => (
                          <li
                            key={r.id}
                            className="group flex items-center justify-between gap-2 rounded-sm border border-border bg-card px-2 py-1.5 text-[11.5px]"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <RoutingIcon />
                              <span className="truncate font-mono font-semibold">{r.from}</span>
                              {r.enabled ? (
                                <CircleCheck
                                  className="size-4 shrink-0 text-emerald-600"
                                  aria-label="Forwarding active"
                                />
                              ) : (
                                <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold">
                                  Disabled
                                </span>
                              )}
                            </span>
                            <RowDeleteButton
                              disabled={!!busy}
                              onClick={() => remove("rule", r.from, [])}
                              label="Delete"
                              ariaLabel={`Delete rule ${r.from}`}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                    {working ? (
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>{busy?.label}</span>
                          <span className="font-mono">{busy?.pct}%</span>
                        </div>
                        <Progress value={busy?.pct ?? 0} />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
