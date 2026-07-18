// Employee detail page: full profile, RBAC, lead assignment, ban / delete,
// password reset, and one-click impersonation with an exit banner.
import { useMemo, useState } from "react";
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
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Lock,
  LogIn,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCog,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  assignLeadOwner,
  getEmployeeDetail,
  listAssignedLeads,
  resetEmployeePassword,
  searchLeadsForAssignment,
  setEmployeeBan,
  startImpersonation,
  updateEmployeeRoles,
  type EmployeeRole,
} from "@/lib/employee-detail.functions";
import { checkIsAdmin, deleteEmployee } from "@/lib/employees.functions";
import { writeBackup } from "@/lib/impersonation";

export const Route = createFileRoute("/_authenticated/app/employees/$userId")({
  head: () => ({ meta: [{ title: "Employee · Branta Tech" }] }),
  component: EmployeeDetailPage,
});

const ROLE_OPTIONS: { value: EmployeeRole; label: string; note: string }[] = [
  { value: "user", label: "User", note: "Standard operator access" },
  { value: "manager", label: "Manager", note: "Team lead, extended reads" },
  { value: "admin", label: "Admin", note: "Manages employees & settings" },
  { value: "super_admin", label: "Super admin", note: "Full unrestricted access" },
];

const kycBadge = (s?: string | null) => {
  switch (s) {
    case "verified":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "under_review":
      return "border-sky-300 bg-sky-50 text-sky-700";
    case "rejected":
      return "border-rose-300 bg-rose-50 text-rose-700";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
};

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
  const startImpFn = useServerFn(startImpersonation);
  const listLeadsFn = useServerFn(listAssignedLeads);
  const searchLeadsFn = useServerFn(searchLeadsForAssignment);
  const assignFn = useServerFn(assignLeadOwner);
  const deleteFn = useServerFn(deleteEmployee);

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

  const [selectedRoles, setSelectedRoles] = useState<EmployeeRole[] | null>(
    null,
  );
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

  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Employee removed");
      navigate({ to: "/app/employees" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const impMut = useMutation({
    mutationFn: () => startImpFn({ data: { userId } }),
    onSuccess: async (res) => {
      try {
        // 1. Snapshot the current admin session first.
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

        // 2. Swap to the target session via the magic link OTP.
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: res.hashedToken,
        });
        if (error) throw error;

        // 3. Land on the target's dashboard.
        window.location.assign("/app");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Impersonation failed",
        );
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (admin.isLoading || detail.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (!admin.data?.isAdmin) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Admin only.</div>
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
  const isSelf = admin.data?.isAdmin && userId === admin.data && false; // placeholder
  const canSuperAdmin = !!admin.data?.isSuperAdmin;

  const toggleRole = (r: EmployeeRole) => {
    const base = selectedRoles ?? [...e.roles];
    const next = base.includes(r) ? base.filter((x) => x !== r) : [...base, r];
    // Always ensure at least one role.
    if (next.length === 0) return;
    setSelectedRoles(next);
  };

  const onImpersonate = async () => {
    const ok = await confirm({
      title: "Impersonate this employee?",
      description:
        `You will be signed in as ${e.email}. All actions will be logged. Use the amber banner to exit.`,
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
      tone: e.isBanned ? "default" : "warning",
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/app/employees" })}
            className="grid size-8 place-items-center rounded-sm border border-border bg-card text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Employee
            </div>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight">
              {p.full_name ?? e.brantaId}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {canSuperAdmin && (
            <button
              onClick={onImpersonate}
              disabled={impMut.isPending || e.isBanned}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-brand/40 bg-brand/10 px-3 text-[12.5px] font-semibold text-brand hover:bg-brand/20 disabled:opacity-60"
              title={
                e.isBanned
                  ? "Unban this employee before impersonating"
                  : "Sign in as this employee"
              }
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
      </div>

      {/* Identity + status */}
      <section className="rounded-sm border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid size-14 place-items-center overflow-hidden rounded-sm border border-border bg-muted text-lg font-semibold text-muted-foreground">
            {p.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              (p.full_name ?? e.brantaId).slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[13px]">
              <span>{e.brantaId}</span>
              <span className="text-brand">@brantatech.com</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <RoleBadge role={e.role} />
              <StatusBadge banned={e.isBanned} />
              <span
                className={cn(
                  "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
                  kycBadge(p.kyc_status),
                )}
              >
                KYC · {(p.kyc_status ?? "not_verified").replace("_", " ")}
              </span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-mono">{new Date(e.createdAt).toLocaleString()}</dd>
            <dt className="text-muted-foreground">Last sign-in</dt>
            <dd className="font-mono">
              {e.lastSignInAt ? new Date(e.lastSignInAt).toLocaleString() : "Never"}
            </dd>
          </dl>
        </div>
      </section>

      {/* Roles / RBAC */}
      <section className="rounded-sm border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
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
                {saveRoles.isPending && (
                  <Loader2 className="size-3 animate-spin" />
                )}
                Save
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                  active
                    ? "border-brand bg-brand/5"
                    : "border-border bg-card hover:bg-muted",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[12.5px] font-semibold">{r.label}</div>
                  {active && <Check className="size-3.5 text-brand" strokeWidth={2.5} />}
                </div>
                <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {r.note}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Roles map to feature access via the <code className="font-mono">has_role()</code> RLS
          policies. Add multiple roles to combine permissions.
        </p>
      </section>

      {/* Profile details */}
      <section className="rounded-sm border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <UserCog className="size-4 text-brand" strokeWidth={2} />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Profile details
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          <Field label="Full name" value={p.full_name} />
          <Field label="Legal full name" value={p.legal_full_name} />
          <Field label="Work email" value={e.email} copy />
          <Field label="Personal Gmail" value={p.personal_gmail} copy />
          <Field label="Phone" value={p.phone_primary} copy />
          <Field label="Alt. phone" value={p.phone_alt} copy />
          <Field
            label="Address"
            value={[p.address_line1, p.address_line2].filter(Boolean).join(", ") || null}
          />
          <Field
            label="City / District"
            value={[p.city, p.district].filter(Boolean).join(" · ") || null}
          />
          <Field label="Postcode" value={p.postcode} />
          <Field label="Country" value={p.country} />
          <Field label="Bank" value={p.bank_name} />
          <Field label="Account name" value={p.bank_account_name} />
          <Field label="Account number" value={p.bank_account_number} copy />
          <Field label="Routing / IFSC" value={p.bank_routing} />
          <Field label="MFS provider" value={p.mfs_provider} />
          <Field label="MFS number" value={p.mfs_number} copy />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <DocLink label="NID document" url={p.nid_url} />
          <DocLink label="CV / Resume" url={p.cv_url} />
          <DocLink label="Avatar" url={p.avatar_url} />
        </div>
      </section>

      {/* Assigned leads */}
      <section className="rounded-sm border border-border bg-card p-5">
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

      {/* Danger info */}
      {isSelf && (
        <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <ShieldAlert className="mr-1 inline size-3.5" />
          Self-management: some destructive actions are disabled on your own account.
        </div>
      )}
    </div>
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

function Field({
  label,
  value,
  copy,
}: {
  label: string;
  value: string | null | undefined;
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const empty = !value;
  const onCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* ignore */ }
  };
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            empty ? "italic text-muted-foreground/60" : "font-medium text-foreground",
          )}
        >
          {empty ? "—" : value}
        </span>
        {copy && !empty && (
          <button
            onClick={onCopy}
            className="grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Copy"
          >
            {copied ? (
              <Check className="size-3 text-emerald-600" strokeWidth={2.5} />
            ) : (
              <Copy className="size-3" strokeWidth={1.75} />
            )}
          </button>
        )}
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
      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium hover:bg-muted"
    >
      <Download className="size-3.5" strokeWidth={2} />
      {label}
      <ExternalLink className="size-3 text-muted-foreground" strokeWidth={2} />
    </a>
  );
}

// Assigned leads: show current owned leads + search-and-assign combobox.
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
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <Link
                  to="/app/leads/$slug"
                  params={{ slug: l.slug }}
                  className="text-[13px] font-medium text-foreground hover:text-brand"
                >
                  <span className="font-mono text-[11.5px] text-muted-foreground">
                    {l.lead_code}
                  </span>{" "}
                  {l.name}
                </Link>
                <div className="text-[11px] text-muted-foreground">
                  {l.company ?? "—"} · {l.status}
                </div>
              </div>
              <button
                onClick={() => doUnassign(l.id)}
                disabled={pending === l.id}
                className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-card px-2 text-[11.5px] hover:bg-muted disabled:opacity-60"
              >
                {pending === l.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" />
                )}
                Unassign
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-sm border border-dashed border-border p-3">
        <div className="mb-2 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
          Assign more leads
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-sm border border-border bg-card px-2.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search by name, company or code…"
              className="flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
          <button
            onClick={runSearch}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-card px-3 text-[12.5px] font-medium hover:bg-muted disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Search"}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-sm border border-border">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">
                    <span className="font-mono text-[11.5px] text-muted-foreground">
                      {r.lead_code}
                    </span>{" "}
                    {r.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.company ?? "—"} · {r.status}
                  </div>
                </div>
                <button
                  onClick={() => doAssign(r.id)}
                  disabled={pending === r.id || assignedIds.has(r.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-sm bg-brand px-2 text-[11.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
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
