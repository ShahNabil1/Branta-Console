import { WalletLedgerView } from "@/components/finance/wallet-ledger-view";
// Employee detail page: full profile, RBAC, lead assignment, ban / delete,
// password reset, one-click impersonation, wallet + sessions.
import { useEffect, useMemo, useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Ban,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MailPlus,
  MoreHorizontal,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCog,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  assignLeadOwner,
  getEmployeeDetail,
  getEmployeeWallet,
  listAssignedLeads,
  listEmployeeSessions,
  resendOnboardingInstructions,
  resetEmployeePassword,
  revokeEmployeeSession,
  searchLeadsForAssignment,
  setEmployeeBan,
  setEmployeeJobRole,
  startImpersonation,
  updateEmployeeRoles,
  type EmployeeDetail,
  type EmployeeRole,
  type PaymentMethodLite,
} from "@/lib/employee-detail.functions";
import { checkIsAdmin, deleteEmployee } from "@/lib/employees.functions";
import {
  adminUnsubscribeTelegram,
  getEmployeeTelegramStatus,
} from "@/lib/telegram.functions";
import { clearBackup, isImpersonating, readBackup, writeBackup } from "@/lib/impersonation";
import { BarcodeSvg, downloadBarcodePng } from "@/components/employee/BarcodeSvg";
import { TelegramIcon } from "@/components/social/telegram-icon";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/employees/$userId")({
  head: () => ({
    meta: [
      { title: "Employee Profile · Branta Tech" },
      { name: "description", content: "Review and manage an employee profile, access, wallet, sessions, and assigned leads." },
      { property: "og:title", content: "Employee Profile · Branta Tech" },
      { property: "og:description", content: "Review and manage an employee profile, access, wallet, sessions, and assigned leads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeeDetailPage,
});

const ROLE_OPTIONS: { value: EmployeeRole; label: string; note: string }[] = [
  { value: "user", label: "User", note: "Standard operator access" },
  { value: "manager", label: "Manager", note: "Team lead, extended reads" },
  { value: "finance", label: "Finance", note: "Full finance CRUD access" },
  { value: "admin", label: "Admin", note: "Manages employees & settings" },
  { value: "super_admin", label: "Super admin", note: "Full unrestricted access" },
];




function EmployeeDetailPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const isAdminFn = useServerFn(checkIsAdmin);
  const getFn = useServerFn(getEmployeeDetail);
  const updateRolesFn = useServerFn(updateEmployeeRoles);
  const banFn = useServerFn(setEmployeeBan);
  const resetFn = useServerFn(resetEmployeePassword);
  const resendOnboardingFn = useServerFn(resendOnboardingInstructions);
  const startImpFn = useServerFn(startImpersonation);
  const listLeadsFn = useServerFn(listAssignedLeads);
  const searchLeadsFn = useServerFn(searchLeadsForAssignment);
  const assignFn = useServerFn(assignLeadOwner);
  const deleteFn = useServerFn(deleteEmployee);
  const setJobRoleFn = useServerFn(setEmployeeJobRole);
  const tgStatusFn = useServerFn(getEmployeeTelegramStatus);
  const tgUnsubFn = useServerFn(adminUnsubscribeTelegram);
  const walletFn = useServerFn(getEmployeeWallet);
  const sessionsFn = useServerFn(listEmployeeSessions);
  const revokeSessionFn = useServerFn(revokeEmployeeSession);

  const admin = useQuery({
    queryKey: ["employees.admin"],
    queryFn: () => isAdminFn(),
  });

  const detail = useQuery({
    queryKey: ["employee.detail", userId],
    queryFn: () => getFn({ data: { userId } }),
    enabled: !!admin.data?.isAdmin,
  });

  const leads = useQuery({
    queryKey: ["employee.leads", userId],
    queryFn: () => listLeadsFn({ data: { userId } }),
    enabled: !!admin.data?.isAdmin,
  });

  const tgStatus = useQuery({
    queryKey: ["employee.telegram", userId],
    queryFn: () => tgStatusFn({ data: { userId } }),
    enabled: !!admin.data?.isAdmin,
  });

  const tgUnsub = useMutation({
    mutationFn: () => tgUnsubFn({ data: { userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee.telegram", userId] });
      toast.success("Telegram unsubscribed");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Failed to unsubscribe"),
  });

  const onTgUnsub = async () => {
    const ok = await confirm({
      title: "Unsubscribe Telegram?",
      description:
        "This employee will stop receiving all Branta Tech Telegram notifications until they reconnect.",
      confirmLabel: "Unsubscribe",
      tone: "warning",
    });
    if (ok) tgUnsub.mutate();
  };

  const [selectedRoles, setSelectedRoles] = useState<EmployeeRole[] | null>(null);
  const roles = selectedRoles ?? detail.data?.roles ?? [];
  const rolesDirty = useMemo(() => {
    if (!detail.data || !selectedRoles) return false;
    const a = [...detail.data.roles].sort().join(",");
    const b = [...selectedRoles].sort().join(",");
    return a !== b;
  }, [selectedRoles, detail.data]);

  const saveRoles = useMutation({
    mutationFn: () => updateRolesFn({ data: { userId, roles } }),
    onSuccess: () => {
      toast.success("Roles updated");
      setSelectedRoles(null);
      qc.invalidateQueries({ queryKey: ["employee.detail", userId] });
      qc.invalidateQueries({ queryKey: ["employees.list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const banMut = useMutation({
    mutationFn: (ban: boolean) => banFn({ data: { userId, ban } }),
    onSuccess: (_, ban) => {
      toast.success(ban ? "Account banned" : "Account unbanned");
      qc.invalidateQueries({ queryKey: ["employee.detail", userId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { userId } }),
    onSuccess: () => toast.success("New password emailed to the employee"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resendOnboardingMut = useMutation({
    mutationFn: () => resendOnboardingFn({ data: { userId } }),
    onSuccess: () =>
      toast.success("Onboarding instructions re-sent with a new temporary password"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { userId } }),
    onSuccess: (res) => {
      if (res.result === "deleted") toast.success("Employee permanently deleted (no business history)");
      else toast.success(`Employee deactivated — sign-in blocked, history kept (${Object.entries(res.blockers ?? {}).map(([k, v]) => `${v} ${k}`).join(", ") || "no records"}).`);
      navigate({ to: "/app/employees" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const impMut = useMutation({
    mutationFn: () => startImpFn({ data: { userId } }),
    onSuccess: async (res) => {
      try {
        const { data: cur } = await supabase.auth.getSession();
        if (!cur.session)
          throw new Error("No active admin session to preserve.");
        writeBackup({
          access_token: cur.session.access_token,
          refresh_token: cur.session.refresh_token,
          admin_user_id: res.adminUserId,
          admin_email: res.adminEmail,
          target_user_id: res.targetUserId,
          target_email: res.targetEmail,
          started_at: Date.now(),
        });
        window.dispatchEvent(new Event("branta:impersonation-changed"));
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: res.hashedToken,
        });
        if (error) throw error;
        window.location.assign("/app");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Impersonation failed");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [jobRoleDraft, setJobRoleDraft] = useState<string | null>(null);
  const currentJobRole = detail.data?.profile.job_role ?? "";
  const jobRoleValue = jobRoleDraft ?? currentJobRole;
  const jobRoleDirty = jobRoleDraft !== null && jobRoleDraft !== currentJobRole;

  const saveJobRole = useMutation({
    mutationFn: () =>
      setJobRoleFn({ data: { userId, jobRole: jobRoleValue.trim() || null } }),
    onSuccess: () => {
      toast.success("Job role updated");
      setJobRoleDraft(null);
      qc.invalidateQueries({ queryKey: ["employee.detail", userId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [tab, setTab] = useState<"profile" | "wallet" | "permissions">("profile");
  const [avatarOpen, setAvatarOpen] = useState(false);

  if (admin.isLoading || detail.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (!admin.data?.isAdmin) {
    const impersonating = isImpersonating();
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <div className="font-semibold text-foreground">Admin access required</div>
        <p className="max-w-md text-[12.5px]">
          {impersonating
            ? "You're currently impersonating another employee. Exit impersonation from the amber banner at the top to regain admin access."
            : "Your account does not have admin privileges. Sign out and sign back in as an admin, or ask a super-admin to grant you access."}
        </p>
        <button
          onClick={async () => {
            const b = readBackup();
            if (impersonating && b) {
              const { error } = await supabase.auth.setSession({
                access_token: b.access_token,
                refresh_token: b.refresh_token,
              });
              clearBackup();
              window.dispatchEvent(new Event("branta:impersonation-changed"));
              if (error) {
                await supabase.auth.signOut().catch(() => {});
                window.location.assign("/login");
                return;
              }
              window.location.assign("/app/employees");
            } else {
              await supabase.auth.signOut().catch(() => {});
              window.location.assign("/login");
            }
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-brand bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand/90"
        >
          {impersonating ? "Exit impersonation" : "Sign out"}
        </button>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="p-6 text-sm text-rose-600">
        {detail.error instanceof Error ? detail.error.message : "Not found"}
      </div>
    );
  }

  const e = detail.data;
  const p = e.profile;
  const canSuperAdmin = !!admin.data?.isSuperAdmin && !isImpersonating();

  const toggleRole = (r: EmployeeRole) => {
    const base = selectedRoles ?? [...e.roles];
    const next = base.includes(r) ? base.filter((x) => x !== r) : [...base, r];
    if (next.length === 0) return;
    setSelectedRoles(next);
  };

  const onImpersonate = async () => {
    const ok = await confirm({
      title: "Impersonate this employee?",
      description: `You will be signed in as ${e.email}. All actions will be logged. Use the amber banner to exit.`,
      confirmLabel: "Impersonate",
      tone: "warning",
    });
    if (!ok) return;
    impMut.mutate();
  };

  const onBan = async () => {
    const ok = await confirm({
      title: e.isBanned ? "Unban this account?" : "Ban this account?",
      description: e.isBanned
        ? "The employee will be able to sign in again."
        : "The employee will be signed out and blocked from signing in.",
      confirmLabel: e.isBanned ? "Unban" : "Ban",
      tone: e.isBanned ? "info" : "warning",
    });
    if (!ok) return;
    banMut.mutate(!e.isBanned);
  };

  const onReset = async () => {
    const ok = await confirm({
      title: "Reset password?",
      description: `A new temporary password will be emailed to ${e.email}. Their current password will stop working.`,
      confirmLabel: "Reset password",
    });
    if (!ok) return;
    resetMut.mutate();
  };

  const onboardingPending = e.mustChangePassword || e.mustLinkTelegram;
  const pendingSteps = [
    e.mustChangePassword ? "set their personal password" : null,
    e.mustLinkTelegram ? "link Telegram" : null,
  ].filter(Boolean) as string[];

  const onResendOnboarding = async () => {
    const ok = await confirm({
      title: "Re-send onboarding instructions?",
      description: `A fresh temporary password will be emailed to ${e.email}. They still need to ${pendingSteps.join(" and ")} on next sign-in. Their current password will stop working.`,
      confirmLabel: "Re-send instructions",
    });
    if (!ok) return;
    resendOnboardingMut.mutate();
  };


  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this employee?",
      description: `Type ${e.brantaId} to confirm. This removes their account, roles and profile.`,
      confirmLabel: "Delete",
      tone: "danger",
      requireTypedText: e.brantaId,
    });
    if (!ok) return;
    delMut.mutate();
  };

  const initial = (p.full_name ?? e.brantaId).slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-4 p-3 sm:p-5 lg:p-6 2xl:max-w-screen-2xl">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:flex lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate({ to: "/app/employees" })}
            className="grid size-8 place-items-center rounded-sm border border-border bg-card text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Employee · {p.employee_code ?? e.brantaId}
            </div>
            <h1 className="mt-0.5 truncate text-lg font-bold tracking-tight sm:text-xl">
              {p.full_name ?? e.brantaId}
            </h1>
          </div>
        </div>
        <div className="hidden flex-wrap items-center gap-2 lg:flex">
          {onboardingPending && (
            <button
              onClick={onResendOnboarding}
              disabled={resendOnboardingMut.isPending}
              title={`Pending: ${pendingSteps.join(", ")}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-3 text-[12.5px] font-medium text-primary hover:bg-primary/15 disabled:opacity-60"
            >
              {resendOnboardingMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <MailPlus className="size-3.5" strokeWidth={2} />
              )}
              Resend onboarding
            </button>
          )}
          <button
            onClick={onReset}
            disabled={resetMut.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-card px-3 text-[12.5px] font-medium hover:bg-muted disabled:opacity-60"
          >
            {resetMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <KeyRound className="size-3.5" strokeWidth={2} />
            )}
            Reset password
          </button>
          <button
            onClick={onBan}
            disabled={banMut.isPending}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-[12.5px] font-medium disabled:opacity-60",
              e.isBanned
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
            )}
          >
            {banMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : e.isBanned ? (
              <Unlock className="size-3.5" strokeWidth={2} />
            ) : (
              <Ban className="size-3.5" strokeWidth={2} />
            )}
            {e.isBanned ? "Unban" : "Ban"}
          </button>
          <button
            onClick={onTgUnsub}
            disabled={tgUnsub.isPending || !tgStatus.data?.linked}
            title={
              tgStatus.data?.linked
                ? `Linked as ${tgStatus.data.username ? "@" + tgStatus.data.username : (tgStatus.data.firstName ?? "Telegram user")}`
                : "This employee hasn't linked Telegram yet"
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-sky-300 bg-sky-50 px-3 text-[12.5px] font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
          >
            {tgUnsub.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <TelegramIcon className="size-3.5" />
            )}
            {tgStatus.data?.linked ? "Unsubscribe Telegram" : "Telegram not linked"}
          </button>
          {canSuperAdmin && (
            <button
              onClick={onImpersonate}
              disabled={impMut.isPending || e.isBanned}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-brand/40 bg-brand/10 px-3 text-[12.5px] font-semibold text-brand hover:bg-brand/20 disabled:opacity-60"
              title={e.isBanned ? "Unban this employee before impersonating" : "Sign in as this employee"}
            >
              {impMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LogIn className="size-3.5" strokeWidth={2} />
              )}
              Impersonate
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={delMut.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-rose-300 bg-rose-50 px-3 text-[12.5px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
          >
            {delMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" strokeWidth={2} />
            )}
            Delete
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 rounded-sm lg:hidden" aria-label="Employee actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {onboardingPending && (
              <DropdownMenuItem onSelect={onResendOnboarding} disabled={resendOnboardingMut.isPending}>
                <MailPlus /> Re-send onboarding
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onReset} disabled={resetMut.isPending}>
              <KeyRound /> Reset password
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onBan} disabled={banMut.isPending}>
              {e.isBanned ? <Unlock /> : <Ban />} {e.isBanned ? "Unban account" : "Ban account"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onTgUnsub} disabled={tgUnsub.isPending || !tgStatus.data?.linked}>
              <TelegramIcon className="size-4" /> {tgStatus.data?.linked ? "Unsubscribe Telegram" : "Telegram not linked"}
            </DropdownMenuItem>
            {canSuperAdmin && (
              <DropdownMenuItem onSelect={onImpersonate} disabled={impMut.isPending || e.isBanned}>
                <LogIn /> Impersonate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onDelete} disabled={delMut.isPending} className="text-destructive focus:text-destructive">
              <Trash2 /> Delete employee
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Identity strip */}
      <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => p.avatar_url && setAvatarOpen(true)}
            className={cn(
              "group relative grid size-14 place-items-center overflow-hidden rounded-sm border border-border bg-muted text-lg font-semibold text-muted-foreground",
              p.avatar_url && "cursor-pointer",
            )}
            aria-label={p.avatar_url ? "View avatar" : "No avatar"}
          >
            {p.avatar_url ? (
              <>
                <img src={p.avatar_url} alt="" className="size-full object-cover" />
                <span className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/40 text-white group-hover:flex">
                  <Eye className="size-4" />
                </span>
              </>
            ) : (
              initial
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[13px] font-semibold">
              <span>{e.brantaId}</span>
              <span className="text-brand">@brantatech.com</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <RoleBadge role={e.role} />
              <StatusBadge banned={e.isBanned} />
            </div>

          </div>
          <dl className="col-span-2 grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-border pt-3 text-[12px] sm:col-span-1 sm:ml-auto sm:w-auto sm:border-0 sm:pt-0">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="min-w-0 break-words font-mono text-right">{new Date(e.createdAt).toLocaleString()}</dd>
            <dt className="text-muted-foreground">Last sign-in</dt>
            <dd className="min-w-0 break-words font-mono text-right">
              {e.lastSignInAt ? new Date(e.lastSignInAt).toLocaleString() : "Never"}
            </dd>
          </dl>
        </div>
      </section>

      <AvatarDialog
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        url={p.avatar_url}
        name={p.full_name ?? e.brantaId}
      />

      {/* Employee ID + Job Role */}
      <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand" strokeWidth={2} />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Employee ID & Job Role
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(260px,320px)_1fr]">
          <div className="rounded-sm border border-border bg-white p-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Employee Code
            </div>
            {p.employee_code ? (
              <>
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <div className="min-w-0 break-all font-mono text-[18px] font-semibold tracking-[0.08em] text-foreground">
                    {p.employee_code}
                  </div>
                  <CopyBtn value={p.employee_code} />
                </div>
                <div className="w-full overflow-hidden rounded-sm border border-border bg-white">
                  <BarcodeSvg value={p.employee_code} height={70} className="mx-auto block h-auto max-w-full" />
                </div>
                <div className="mt-2">
                  <button
                    onClick={() =>
                      p.employee_code && downloadBarcodePng(p.employee_code, `${p.employee_code}.png`).catch(
                        (err) => toast.error(err instanceof Error ? err.message : "Download failed"),
                      )
                    }
                    className="inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-[12px] font-semibold hover:bg-muted sm:w-auto"
                  >
                    <Download className="size-3.5" strokeWidth={2} />
                    Download barcode (PNG)
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">No employee code assigned yet.</p>
            )}
          </div>
          <div className="rounded-sm border border-border bg-card p-4">
            <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Job Role
              </div>
              {!canSuperAdmin && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <Lock className="size-3" /> Super admin only
                </span>
              )}
            </div>
            <Input
              value={jobRoleValue}
              onChange={(ev) => setJobRoleDraft(ev.target.value)}
              disabled={!canSuperAdmin || saveJobRole.isPending}
              placeholder="e.g. Senior Backend Engineer"
              className="h-9 rounded-sm"
            />
            {canSuperAdmin && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => saveJobRole.mutate()}
                  disabled={!jobRoleDirty || saveJobRole.isPending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saveJobRole.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" strokeWidth={2.5} />
                  )}
                  Save role
                </button>
                {jobRoleDirty && (
                  <button
                    onClick={() => setJobRoleDraft(null)}
                    className="inline-flex h-8 items-center gap-1 rounded-sm border border-border bg-card px-2.5 text-[12px] hover:bg-muted"
                  >
                    <X className="size-3.5" />
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* RBAC */}
      <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-brand" strokeWidth={2} />
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Roles & access (RBAC)
            </h2>
          </div>
          {rolesDirty && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedRoles(null)}
                className="h-7 rounded-sm border border-border bg-card px-2 text-[11.5px] hover:bg-muted"
              >
                Reset
              </button>
              <button
                onClick={() => saveRoles.mutate()}
                disabled={saveRoles.isPending}
                className="inline-flex h-7 items-center gap-1 rounded-sm bg-brand px-2.5 text-[11.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {saveRoles.isPending && <Loader2 className="size-3 animate-spin" />}
                Save
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {ROLE_OPTIONS.map((r) => {
            const active = roles.includes(r.value);
            const disabled = r.value === "super_admin" && !canSuperAdmin;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => !disabled && toggleRole(r.value)}
                disabled={disabled}
                className={cn(
                  "rounded-sm border px-3 py-2.5 text-left transition-colors",
                  active ? "border-brand bg-brand/5" : "border-border bg-card hover:bg-muted",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[12.5px] font-semibold">{r.label}</div>
                  {active && <Check className="size-3.5 text-brand" strokeWidth={2.5} />}
                </div>
                <div className="mt-0.5 text-[10.5px] text-muted-foreground">{r.note}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border whitespace-nowrap">
        <TabBtn active={tab === "profile"} onClick={() => setTab("profile")} icon={UserCog}>
          Profile
        </TabBtn>
        <TabBtn active={tab === "wallet"} onClick={() => setTab("wallet")} icon={Wallet}>
          Wallet &amp; Earnings
        </TabBtn>
        {canSuperAdmin && (
          <TabBtn
            active={tab === "permissions"}
            onClick={() => setTab("permissions")}
            icon={ShieldCheck}
          >
            Permissions
          </TabBtn>
        )}
      </div>

      {tab === "profile" ? (
        <ProfileTab e={e} />
      ) : tab === "wallet" ? (
        <WalletTab userId={userId} walletFn={walletFn} />
      ) : (
        <PermissionsTab userId={userId} />
      )}

      {/* Sessions */}
      <SessionsSection
        userId={userId}
        listFn={sessionsFn}
        revokeFn={revokeSessionFn}
        confirm={confirm}
        qc={qc}
      />

      {/* Assigned leads */}
      <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LinkIcon className="size-4 text-brand" strokeWidth={2} />
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Assigned leads ({leads.data?.length ?? 0})
            </h2>
          </div>
        </div>
        <AssignLeadsPanel
          userId={userId}
          assigned={leads.data ?? []}
          onSearch={(q) => searchLeadsFn({ data: { q } })}
          onAssign={(leadId) =>
            assignFn({ data: { leadId, ownerId: userId } }).then(() => {
              qc.invalidateQueries({ queryKey: ["employee.leads", userId] });
            })
          }
          onUnassign={(leadId) =>
            assignFn({ data: { leadId, ownerId: null } }).then(() => {
              qc.invalidateQueries({ queryKey: ["employee.leads", userId] });
            })
          }
        />
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof UserCog;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors",
        active
          ? "border-brand text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" strokeWidth={2} />
      {children}
    </button>
  );
}

function ProfileTab({ e }: { e: EmployeeDetail }) {
  const p = e.profile;
  const addressLine =
    [p.address_line1, p.address_line2].filter(Boolean).join(", ") || null;
  const region =
    [p.upazila ?? p.city, p.district, p.division].filter(Boolean).join(" · ") || null;
  return (
    <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <UserCog className="size-4 text-brand" strokeWidth={2} />
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Personal details
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Field label="Full name" value={p.full_name} copy />
        <Field label="Legal full name" value={p.legal_full_name} copy />
        <Field label="Work email" value={e.email} copy />
        <Field label="Personal Gmail" value={p.personal_gmail} copy />
        <Field label="Phone" value={p.phone_primary} copy />
        <Field label="Alt. phone" value={p.phone_alt} copy />
        <Field label="Address" value={addressLine} copy />
        <Field label="Area" value={region} copy />
        <Field label="Post office" value={p.post_office} copy />
        <Field label="Postcode" value={p.postcode} copy />
        <Field label="Country" value={p.country} copy />
      </div>

      <div className="mt-5 mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Documents
      </div>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
        <DocLink label="Avatar" url={p.avatar_url} />
        <DocLink label="NID document" url={p.nid_url} />
        <DocLink label="NID front" url={p.nid_front_url} />
        <DocLink label="NID back" url={p.nid_back_url} />
        <DocLink label="Passport photo" url={p.passport_photo_url} />
        <DocLink label="Passport address" url={p.passport_address_url} />
        <DocLink label="Birth certificate" url={p.birth_certificate_url} />
        <DocLink label="CV / Résumé" url={p.cv_url} />
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────

const currencyFmt = (n: number, cur: string) =>
  `${cur === "USD" ? "$" : "৳"} ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function WalletTab({
  userId,
  walletFn,
}: {
  userId: string;
  walletFn: ReturnType<typeof useServerFn<typeof getEmployeeWallet>>;
}) {
  const wallet = useQuery({
    queryKey: ["employee.wallet", userId],
    queryFn: () => walletFn({ data: { userId } }),
  });

  const detail = useQueryClient().getQueryData<EmployeeDetail>([
    "employee.detail",
    userId,
  ]);
  const methods = (detail?.profile.payment_methods ?? []) as PaymentMethodLite[];

  if (wallet.isLoading) {
    return (
      <section className="flex items-center gap-2 rounded-sm border border-border bg-card p-6 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading wallet…
      </section>
    );
  }
  if (wallet.error || !wallet.data) {
    return (
      <section className="rounded-sm border border-rose-200 bg-rose-50 p-4 text-[12.5px] text-rose-700">
        {wallet.error instanceof Error ? wallet.error.message : "Wallet unavailable"}
      </section>
    );
  }

  const { balances, payouts, withdrawals } = wallet.data;

  const lifetimePaid = payouts
    .filter((p) => p.status === "paid")
    .reduce<Record<string, number>>((acc, p) => {
      acc[p.currency] = (acc[p.currency] ?? 0) + Number(p.amount);
      return acc;
    }, {});
  const lifetimeCurrencies = Object.keys(lifetimePaid);

  return (
    <div className="flex flex-col gap-4">
      {/* Balances */}
      <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="size-4 text-brand" strokeWidth={2} />
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Balance
          </h3>
        </div>
        {balances.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No balance yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {balances.flatMap((b) => [
              <BalanceCard key={`${b.currency}-locked`} label="Locked" value={b.locked} currency={b.currency} tone="muted" />,
              <BalanceCard key={`${b.currency}-avail`} label="Available" value={b.available} currency={b.currency} tone="brand" />,
              <BalanceCard key={`${b.currency}-req`} label="Requested" value={b.requested} currency={b.currency} tone="amber" />,
              <BalanceCard key={`${b.currency}-paid`} label="Lifetime paid" value={b.paid} currency={b.currency} tone="emerald" />,
            ])}
          </div>
        )}
        {lifetimeCurrencies.length > 0 && (
          <div className="mt-3 text-[11.5px] text-muted-foreground">
            Lifetime payout total:{" "}
            {lifetimeCurrencies
              .map((c) => currencyFmt(lifetimePaid[c] ?? 0, c))
              .join(" · ")}
          </div>
        )}
      </section>

      <WalletLedgerView userId={userId} admin />
      {/* Payment methods */}
      <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <UserCog className="size-4 text-brand" strokeWidth={2} />
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Payment methods
          </h3>
        </div>
        {methods.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            This employee hasn't saved any bank or MFS account yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {methods.map((m) => (
              <PaymentMethodCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      {/* Payouts */}
      <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Payment history ({payouts.length})
          </h3>
        </div>
        {payouts.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No payouts yet.</p>
        ) : (
          <>
          <div className="divide-y divide-border rounded-sm border border-border sm:hidden">
            {payouts.map((r) => (
              <div key={r.id} className="space-y-2 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-semibold uppercase text-muted-foreground">Invoice</div>
                    {r.invoice_slug ? (
                      <Link to="/app/finance/invoices/$slug" params={{ slug: r.invoice_slug }} className="block truncate font-mono text-[13px] font-semibold text-brand hover:underline">
                        {r.invoice_slug}
                      </Link>
                    ) : <span>—</span>}
                  </div>
                  <div className="shrink-0 text-right font-mono text-[14px] font-bold">{currencyFmt(Number(r.amount), r.currency)}</div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
                  <span className="font-medium">{r.installment_label ?? "No installment label"}</span>
                  <PayoutStatusBadge status={r.status} />
                  <span className="w-full font-mono">{new Date(r.paid_at ?? r.requested_at ?? r.unlocked_at ?? r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-sm border border-border sm:block">
            <table className="min-w-[620px] w-full text-left text-[12.5px]">
              <thead className="bg-muted text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Installment</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payouts.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5 font-mono">
                      {r.invoice_slug ? (
                        <Link
                          to="/app/finance/invoices/$slug"
                          params={{ slug: r.invoice_slug }}
                          className="text-brand hover:underline"
                        >
                          {r.invoice_slug}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-1.5">{r.installment_label ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {currencyFmt(Number(r.amount), r.currency)}
                    </td>
                    <td className="px-3 py-1.5">
                      <PayoutStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground">
                      {new Date(r.paid_at ?? r.requested_at ?? r.unlocked_at ?? r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* Withdrawals */}
      <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Withdrawal requests ({withdrawals.length})
          </h3>
        </div>
        {withdrawals.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No withdrawal requests.</p>
        ) : (
          <>
          <div className="divide-y divide-border rounded-sm border border-border sm:hidden">
            {withdrawals.map((w) => (
              <div key={w.id} className="space-y-2 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0 font-mono text-[11px] font-medium text-muted-foreground">{new Date(w.requested_at).toLocaleString()}</div>
                  <div className="shrink-0 font-mono text-[14px] font-bold">{currencyFmt(Number(w.amount), w.currency)}</div>
                </div>
                <WithdrawStatusBadge status={w.status} />
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px]">
                  <dt className="text-muted-foreground">Transfer ref</dt>
                  <dd className="min-w-0 break-all font-mono font-semibold">{w.transfer_ref ? <span className="inline-flex items-center gap-1">{w.transfer_ref}<CopyBtn value={w.transfer_ref} small /></span> : "—"}</dd>
                  <dt className="text-muted-foreground">Note</dt>
                  <dd className="min-w-0 break-words font-medium">{w.admin_note ?? "—"}</dd>
                </dl>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-sm border border-border sm:block">
            <table className="min-w-[720px] w-full text-left text-[12.5px]">
              <thead className="bg-muted text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Requested</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Transfer ref</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="px-3 py-1.5 font-mono text-[11.5px]">
                      {new Date(w.requested_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {currencyFmt(Number(w.amount), w.currency)}
                    </td>
                    <td className="px-3 py-1.5">
                      <WithdrawStatusBadge status={w.status} />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11.5px]">
                      {w.transfer_ref ? (
                        <span className="inline-flex items-center gap-1">
                          {w.transfer_ref}
                          <CopyBtn value={w.transfer_ref} small />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[11.5px] text-muted-foreground">
                      {w.admin_note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone: "brand" | "muted" | "amber" | "emerald";
}) {
  const cls =
    tone === "brand"
      ? "border-brand/30 bg-brand/5"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50"
          : "border-border bg-muted/40";
  return (
    <div className={cn("rounded-sm border p-3", cls)}>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label} · {currency}
      </div>
      <div className="mt-1 font-mono text-[17px] font-semibold">
        {currencyFmt(Number(value), currency)}
      </div>
    </div>
  );
}

function PayoutStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    locked: "border-border bg-muted text-muted-foreground",
    available: "border-emerald-300 bg-emerald-50 text-emerald-700",
    requested: "border-amber-300 bg-amber-50 text-amber-800",
    paid: "border-brand/40 bg-brand/10 text-brand",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
        map[status] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {status === "locked" && <Lock className="mr-1 size-3" />}
      {status}
    </span>
  );
}

function WithdrawStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "border-amber-300 bg-amber-50 text-amber-800",
    approved: "border-sky-300 bg-sky-50 text-sky-700",
    paid: "border-emerald-300 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-300 bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
        map[status] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function PaymentMethodCard({ m }: { m: PaymentMethodLite }) {
  return (
    <div
      className={cn(
        "rounded-sm border p-3",
        m.is_primary ? "border-brand ring-1 ring-brand/20" : "border-border",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em]">
          {m.kind === "bank" ? "Bank" : "MFS"}
        </span>
        {m.is_primary && (
          <span className="inline-flex items-center rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brand">
            Primary
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {m.kind === "bank" ? (
          <>
            <Field label="Bank" value={m.bank_name} copy />
            <Field label="Account holder" value={m.account_holder} copy />
            <Field label="Account number" value={m.account_number} copy />
            <Field label="Branch" value={m.branch} copy />
          </>
        ) : (
          <>
            <Field label="MFS provider" value={m.mfs_provider} copy />
            <Field label="Account holder" value={m.account_holder} copy />
            <Field label="MFS number" value={m.mfs_number} copy />
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────

function SessionsSection({
  userId,
  listFn,
  revokeFn,
  confirm,
  qc,
}: {
  userId: string;
  listFn: ReturnType<typeof useServerFn<typeof listEmployeeSessions>>;
  revokeFn: ReturnType<typeof useServerFn<typeof revokeEmployeeSession>>;
  confirm: ReturnType<typeof useConfirm>;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const q = useQuery({
    queryKey: ["employee.sessions", userId],
    queryFn: () => listFn({ data: { userId } }),
    refetchInterval: 30_000,
  });

  // Realtime: reflect sign-outs from anywhere immediately.
  useEffect(() => {
    const ch = supabase
      .channel(`admin-sessions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_sessions",
          filter: `user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["employee.sessions", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  const revoke = useMutation({
    mutationFn: (sessionId: string) => revokeFn({ data: { userId, sessionId } }),
    onSuccess: () => {
      toast.success("Session signed out");
      qc.invalidateQueries({ queryKey: ["employee.sessions", userId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const onRevoke = async (id: string, label: string) => {
    const ok = await confirm({
      title: "Sign out this session?",
      description: `${label} will be signed out from this device immediately.`,
      confirmLabel: "Sign out",
      tone: "warning",
    });
    if (ok) revoke.mutate(id);
  };

  const rows = q.data ?? [];
  const active = rows.filter((r) => !r.revoked_at);

  return (
    <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="size-4 text-brand" strokeWidth={2} />
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Sessions ({active.length} active)
        </h2>
      </div>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No sessions recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {rows.map((s) => {
            const label = `${s.browser ?? "Browser"} · ${s.device ?? "Device"}`;
            const geo = [s.city, s.region, s.country].filter(Boolean).join(", ");
            return (
              <li key={s.id} className="flex flex-col items-stretch gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words text-[13px] font-semibold">
                    {label}
                    {s.revoked_at && (
                      <span className="ml-2 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 break-words text-[11.5px] font-medium text-muted-foreground">
                    {s.os ?? "—"} · {s.ip ?? "—"}
                    {geo && ` · ${geo}`} · last seen{" "}
                    {new Date(s.last_seen_at).toLocaleString()}
                  </div>
                </div>
                {!s.revoked_at && (
                  <button
                    onClick={() => onRevoke(s.id, label)}
                    disabled={revoke.isPending}
                    className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-sm border border-rose-300 bg-rose-50 px-2 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 sm:w-auto"
                  >
                    <LogOut className="size-3" />
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────

function AvatarDialog({
  open,
  onOpenChange,
  url,
  name,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string | null;
  name: string;
}) {
  if (!url) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b border-border px-4 py-2.5">
          <DialogTitle className="text-[13px] font-semibold">
            Avatar · {name}
          </DialogTitle>
        </DialogHeader>
        <div className="grid place-items-center bg-muted/40 p-4">
          <img src={url} alt="" className="max-h-[65vh] max-w-full rounded-sm object-contain" />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-[12px] font-medium hover:bg-muted"
          >
            <ExternalLink className="size-3.5" />
            Open
          </a>
          <a
            href={url}
            download
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-700"
          >
            <Download className="size-3.5" />
            Download
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: EmployeeRole }) {
  const cls =
    role === "super_admin"
      ? "border-brand/40 bg-brand/10 text-brand"
      : role === "admin"
        ? "border-violet-300 bg-violet-50 text-violet-700"
        : role === "manager"
          ? "border-sky-300 bg-sky-50 text-sky-700"
          : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
        cls,
      )}
    >
      {role.replace("_", " ")}
    </span>
  );
}

function StatusBadge({ banned }: { banned: boolean }) {
  return banned ? (
    <span className="inline-flex items-center gap-1 rounded-sm border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-rose-700">
      <Lock className="size-3" strokeWidth={2} /> Banned
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-emerald-700">
      Active
    </span>
  );
}

function CopyBtn({ value, small }: { value: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch { /* ignore */ }
      }}
      className={cn(
        "grid place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        small ? "size-5" : "size-6",
      )}
      aria-label="Copy"
    >
      {copied ? (
        <Check className={cn(small ? "size-2.5" : "size-3", "text-emerald-600")} strokeWidth={2.5} />
      ) : (
        <Copy className={cn(small ? "size-2.5" : "size-3")} strokeWidth={1.75} />
      )}
    </button>
  );
}

function Field({
  label,
  value,
  copy,
}: {
  label: string;
  value: string | null | undefined;
  copy?: boolean;
}) {
  const empty = !value;
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          title={empty ? undefined : value}
          className={cn(
            "min-w-0 flex-1 break-words text-[13px]",
            empty ? "italic text-muted-foreground/60" : "font-medium text-foreground",
          )}
        >
          {empty ? "—" : value}
        </span>
        {copy && value && <CopyBtn value={value} />}
      </div>
    </div>
  );
}

function DocLink({ label, url }: { label: string; url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      download
      className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-2 text-[12px] font-semibold hover:bg-muted"
    >
      <Download className="size-3.5" strokeWidth={2} />
      {label}
      <ExternalLink className="size-3 text-muted-foreground" strokeWidth={2} />
    </a>
  );
}

// ────────────────────────────────────────────────────────────────

function AssignLeadsPanel({
  userId: _userId,
  assigned,
  onSearch,
  onAssign,
  onUnassign,
}: {
  userId: string;
  assigned: { id: string; slug: string; lead_code: string; name: string; company: string | null; status: string }[];
  onSearch: (q: string) => Promise<{ id: string; slug: string; lead_code: string; name: string; company: string | null; status: string }[]>;
  onAssign: (leadId: string) => Promise<void>;
  onUnassign: (leadId: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof onSearch>>>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const runSearch = async () => {
    setBusy(true);
    try {
      const r = await onSearch(q);
      setResults(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const doAssign = async (id: string) => {
    setPending(id);
    try {
      await onAssign(id);
      toast.success("Lead assigned");
      setResults((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  };

  const doUnassign = async (id: string) => {
    setPending(id);
    try {
      await onUnassign(id);
      toast.success("Lead unassigned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  };

  const assignedIds = new Set(assigned.map((a) => a.id));

  return (
    <div className="space-y-3">
      {assigned.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">
          No leads assigned to this employee yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {assigned.map((l) => (
            <li key={l.id} className="flex flex-col items-stretch gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link
                  to="/app/leads/$slug"
                  params={{ slug: l.slug }}
                  className="block break-words text-[13px] font-semibold text-foreground hover:text-brand"
                >
                  <span className="font-mono text-[11.5px] text-muted-foreground">{l.slug}</span>{" "}
                  {l.name}
                </Link>
                <div className="text-[11px] text-muted-foreground">
                  {l.company ?? "—"} · {l.status}
                </div>
              </div>
              <button
                onClick={() => doUnassign(l.id)}
                disabled={pending === l.id}
                className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-sm border border-border bg-card px-2 text-[11.5px] font-semibold hover:bg-muted disabled:opacity-60 sm:w-auto"
              >
                {pending === l.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                Unassign
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-sm border border-dashed border-border p-3">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Assign more leads
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-sm border border-border bg-card px-2.5 sm:h-9">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search by name, company or code…"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
          <button
            onClick={runSearch}
            disabled={busy}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-sm border border-border bg-card px-3 text-[12.5px] font-semibold hover:bg-muted disabled:opacity-60 sm:h-9 sm:w-auto"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Search"}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-sm border border-border">
            {results.map((r) => (
              <li key={r.id} className="flex flex-col items-stretch gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words text-[13px] font-semibold">
                    <span className="font-mono text-[11.5px] text-muted-foreground">{r.slug}</span>{" "}
                    {r.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.company ?? "—"} · {r.status}
                  </div>
                </div>
                <button
                  onClick={() => doAssign(r.id)}
                  disabled={pending === r.id || assignedIds.has(r.id)}
                  className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-sm bg-brand px-2 text-[11.5px] font-semibold text-primary-foreground hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
                >
                  {pending === r.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : assignedIds.has(r.id) ? (
                    "Assigned"
                  ) : (
                    "Assign"
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permissions tab — super_admin only. Fine-grained toggles per employee.
// ---------------------------------------------------------------------------
import {
  getUserPermissions,
  setUserPermission,
  type PermissionKey,
  type UserPermissions,
} from "@/lib/permissions.functions";
import { Switch } from "@/components/ui/switch";

const PERMISSION_ROWS: {
  key: PermissionKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "lead_manage",
    label: "Add / Pull / Push leads",
    hint: "Create new leads and sync with the Google Sheet (push & pull).",
  },
  {
    key: "lead_assign",
    label: "Reassign leads",
    hint: "Move leads to another employee without super-admin help.",
  },
  {
    key: "lead_delete",
    label: "Delete leads",
    hint: "Permanently delete leads they own. Off by default.",
  },
  {
    key: "customer_access",
    label: "Access customers page",
    hint: "Show the Customers menu and let them open the customers list.",
  },
  {
    key: "customer_view_all",
    label: "View all customers",
    hint: "Off means they only see customers they created or converted themselves.",
  },
  {
    key: "customer_view_detail",
    label: "Open customer detail page",
    hint: "Off means cards are visible but they cannot open the full customer page.",
  },
];


function PermissionsTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getUserPermissions);
  const setFn = useServerFn(setUserPermission);

  const q = useQuery({
    queryKey: ["employee.permissions", userId],
    queryFn: () => getFn({ data: { userId } }),
    staleTime: 15_000,
  });

  const mut = useMutation({
    mutationFn: (v: { key: PermissionKey; value: boolean }) =>
      setFn({ data: { userId, key: v.key, value: v.value } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["employee.permissions", userId] });
      const prev = qc.getQueryData<UserPermissions>([
        "employee.permissions",
        userId,
      ]);
      if (prev) {
        qc.setQueryData(["employee.permissions", userId], {
          ...prev,
          [v.key]: v.value,
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["employee.permissions", userId], ctx.prev);
      }
      toast.error(e instanceof Error ? e.message : "Failed to update");
    },
    onSuccess: () => toast.success("Permission updated"),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading permissions…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-6 text-sm text-rose-600">
        {q.error instanceof Error ? q.error.message : "Failed to load"}
      </div>
    );
  }

  const perms = q.data;

  return (
    <section className="rounded-sm border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4 text-brand" strokeWidth={2} />
        <h2 className="text-[13px] font-semibold">Lead permissions</h2>
      </div>
      <p className="mb-4 text-[11.5px] text-muted-foreground">
        Only super admins can change these. Toggles apply on top of the
        employee&apos;s existing role and only affect the leads they already
        own.
      </p>

      <ul className="grid grid-cols-1 divide-y divide-border rounded-sm border border-border md:grid-cols-2 md:divide-y-0">
        {PERMISSION_ROWS.map((row) => {
          const dependsOnAccess =
            row.key === "customer_view_all" ||
            row.key === "customer_view_detail";
          const gatedOff = dependsOnAccess && !perms.customer_access;
          const value = gatedOff ? false : perms[row.key];
          const pending =
            mut.isPending && mut.variables?.key === row.key;
          const disabled = mut.isPending || gatedOff;
          return (
            <li
              key={row.key}
              className={`flex items-start justify-between gap-4 border-border px-3 py-3 md:border-b md:odd:border-r ${
                gatedOff ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-foreground">
                  {row.label}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.hint}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {pending && (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                )}
                <Switch
                  checked={value}
                  disabled={disabled}
                  onCheckedChange={(v) => {
                    if (
                      row.key === "customer_access" &&
                      !v &&
                      (perms.customer_view_all || perms.customer_view_detail)
                    ) {
                      if (perms.customer_view_all) {
                        mut.mutate({ key: "customer_view_all", value: false });
                      }
                      if (perms.customer_view_detail) {
                        mut.mutate({ key: "customer_view_detail", value: false });
                      }
                    }
                    mut.mutate({ key: row.key, value: !!v });
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

    </section>
  );
}
