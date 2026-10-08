// Server functions for the Employees admin page.
// All create/list operations require an authenticated caller AND an
// admin/super_admin role check via the has_role RPC.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DOMAIN,
  localSchema,
  strongPasswordSchema,
} from "@/lib/branta-credentials";
import { z } from "zod";

const RoleEnum = z.enum(["super_admin", "admin", "manager", "user"]);

const CreateInput = z.object({
  local: z.string(),
  password: z.string(),
  role: RoleEnum,
  fullName: z.string().trim().max(120).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assertAdmin = async (supabase: any, userId: string) => {
  const [su, ad] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (su.error || ad.error)
    throw new Error(su.error?.message ?? ad.error?.message ?? "Role check failed");
  if (!su.data && !ad.data) throw new Error("Forbidden: admin role required");
  return { isSuperAdmin: !!su.data };
};

export interface EmployeeRow {
  userId: string;
  email: string;
  brantaId: string;
  fullName: string | null;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
  avatarUrl: string | null;
  employeeCode: string | null;
  jobRole: string | null;
  phone: string | null;
  activeSessions: number;
}

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmployeeRow[]> => {
    await assertAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // page 1, up to 200 users — internal ops app, fine for now.
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw dbError(error);

    const users = data.users ?? [];
    const ids = users.map((u) => u.id);

    const [roles, profiles, sessions] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, deactivated_at, avatar_url, employee_code, job_role, phone_primary")
        .in("user_id", ids),
      supabaseAdmin
        .from("user_sessions")
        .select("user_id, last_seen_at, revoked_at")
        .in("user_id", ids)
        .order("last_seen_at", { ascending: false })
        .limit(1000),
    ]);

    const seenByUser = new Map<string, string>();
    const liveSessions = new Map<string, number>();
    const cutoff = Date.now() - 30 * 86_400_000;
    (sessions.data ?? []).forEach((s) => {
      if (!seenByUser.has(s.user_id)) seenByUser.set(s.user_id, s.last_seen_at);
      if (!s.revoked_at && new Date(s.last_seen_at).getTime() > cutoff)
        liveSessions.set(s.user_id, (liveSessions.get(s.user_id) ?? 0) + 1);
    });
    type Extra = { avatarUrl: string | null; employeeCode: string | null; jobRole: string | null; phone: string | null };
    const extraByUser = new Map<string, Extra>();

    const roleByUser = new Map<string, string>();
    (roles.data ?? []).forEach((r) => {
      // If user has multiple roles, prefer highest privilege for display.
      const order = ["super_admin", "admin", "manager", "user"];
      const existing = roleByUser.get(r.user_id);
      if (!existing || order.indexOf(r.role) < order.indexOf(existing)) {
        roleByUser.set(r.user_id, r.role);
      }
    });

    const nameByUser = new Map<string, string | null>();
    const inactive = new Set<string>();
    (profiles.data ?? []).forEach((p) => {
      nameByUser.set(p.user_id, p.full_name ?? null);
      extraByUser.set(p.user_id, {
        avatarUrl: p.avatar_url ?? null,
        employeeCode: p.employee_code ?? null,
        jobRole: p.job_role ?? null,
        phone: p.phone_primary ?? null,
      });
      if ((p as { deactivated_at?: string | null }).deactivated_at) inactive.add(p.user_id);
    });

    return users
      .filter((u) => (u.email ?? "").toLowerCase().endsWith(DOMAIN) && !inactive.has(u.id))
      .map((u) => {
        const email = (u.email ?? "").toLowerCase();
        return {
          userId: u.id,
          email,
          brantaId: email.split("@")[0] ?? "",
          fullName: nameByUser.get(u.id) ?? null,
          role: roleByUser.get(u.id) ?? "user",
          createdAt: u.created_at ?? "",
          lastSignInAt: u.last_sign_in_at ?? null,
          lastSeenAt: seenByUser.get(u.id) ?? u.last_sign_in_at ?? null,
          avatarUrl: extraByUser.get(u.id)?.avatarUrl ?? null,
          employeeCode: extraByUser.get(u.id)?.employeeCode ?? null,
          jobRole: extraByUser.get(u.id)?.jobRole ?? null,
          phone: extraByUser.get(u.id)?.phone ?? null,
          activeSessions: liveSessions.get(u.id) ?? 0,
        };
      })
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  });

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);

    // Only super_admin can mint another super_admin.
    if (data.role === "super_admin" && !isSuperAdmin) {
      throw new Error("Only a super_admin can create another super_admin.");
    }

    const local = localSchema.parse(data.local);
    const password = strongPasswordSchema.parse(data.password);
    const email = `${local}${DOMAIN}`;

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Create the auth user. email_confirm=true so they can sign in right away.
    const meta: Record<string, unknown> = {};
    if (data.fullName) meta.full_name = data.fullName;

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: meta,
      });

    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create employee.");
    }

    const newUserId = created.user.id;

    try {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newUserId, role: data.role });
      if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
        throw new Error(roleErr.message);
      }

      // Force onboarding on first sign-in: set a personal password AND
      // link Telegram. Both flags self-clear once the employee completes
      // the corresponding step.
      await supabaseAdmin
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          must_change_password: true,
          must_link_telegram: true,
        } as any)
        .eq("user_id", newUserId);

      // Seed the temp password hash into password_history so the onboarding
      // "set initial password" step can reject reuse without asking the
      // employee to retype the temp password.
      try {
        const { hashPassword } = await import("@/lib/password-hash.server");
        const tempHash = await hashPassword(password);
        await supabaseAdmin
          .from("password_history")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ user_id: newUserId, password_hash: tempHash } as any);
      } catch { /* best-effort */ }


      // Best-effort: origin comes from the caller's request so the login URL
      // matches whichever host the operator is using (preview vs. custom).
      const origin = (() => {
        try {
          const proto = getRequestHeader("x-forwarded-proto") ?? "https";
          const host =
            getRequestHeader("x-forwarded-host") ?? getRequestHeader("host");
          if (host) return `${proto}://${host}`;
        } catch {
          /* not in request context */
        }
        return "https://console.brantatech.com";
      })();
      const loginUrl = `${origin}/login`;

      const { sendWelcomeEmail } = await import("@/lib/branta-email.server");
      await sendWelcomeEmail({
        recipientEmail: email,
        brantaId: local,
        tempPassword: password,
        loginUrl,
        role: data.role,
      });
    } catch (err) {
      // Roll back the auth user if role assignment or email send failed —
      // otherwise the admin has to hunt down orphaned accounts by hand.
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw err instanceof Error ? err : new Error(String(err));
    }

    return { ok: true as const, email, userId: newUserId };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) {
      throw new Error("You can't remove your own account.");
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    type Rpc = { rpc: (f: string, a: object) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> };
    const sbr = context.supabase as never as Rpc;
    // Pre-flight: permanent delete only for an employee with no business history.
    const { data: blk, error: bErr } = await sbr.rpc("employee_delete_blockers", { _user_id: data.userId });
    if (bErr) throw dbError(bErr);
    const blockers = (blk ?? {}) as Record<string, number>;
    if (Object.keys(blockers).length === 0) {
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
      if (!delErr) return { ok: true as const, result: "deleted" as const, blockers };
    }
    // Deactivate instead of deleting: finance, payout, task and audit history keep pointing at this person.
    const { error } = await (context.supabase as never as { rpc: (f: string, a: object) => Promise<{ error: { message: string; code?: string } | null }> })
      .rpc("deactivate_employee", { _user_id: data.userId, _reason: "Removed from employee directory" });
    if (error) throw dbError(error);
    // Block sign-in and end sessions (best effort — history is already preserved).
    try {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
      await supabaseAdmin.auth.admin.signOut(data.userId);
    } catch { /* service key missing or auth call failed; roles are already removed */ }
    return { ok: true as const, result: "deactivated" as const, blockers };
  });

export const syncRecentEmailEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { syncRecentBrevoEmailEvents } = await import(
      "@/lib/branta-email-events.server"
    );
    return syncRecentBrevoEmailEvents({ limit: 100 });
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [su, ad] = await Promise.all([
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "super_admin",
      }),
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
    ]);
    return {
      isSuperAdmin: !!su.data,
      isAdmin: !!su.data || !!ad.data,
    };
  });

export const getEmployeeDeleteBlockers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: blk, error } = await (context.supabase as never as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> })
      .rpc("employee_delete_blockers", { _user_id: data.userId });
    if (error) throw dbError(error);
    return (blk ?? {}) as Record<string, number>;
  });

export const reactivateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as never as { rpc: (f: string, a: object) => Promise<{ error: { message: string; code?: string } | null }> })
      .rpc("reactivate_employee", { _user_id: data.userId });
    if (error) throw dbError(error);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "none" });
    } catch { /* ignore */ }
    return { ok: true as const };
  });
