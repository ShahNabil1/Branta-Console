// Server functions powering the Employee detail page: profile view, RBAC,
// lead assignment, ban/delete, password reset and one-click impersonation.
//
// All operations require admin. Impersonation and super_admin role writes
// are restricted to super_admin.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DOMAIN,
  generateTempPassword,
} from "@/lib/branta-credentials";

const ROLE_ENUM = z.enum(["super_admin", "admin", "finance", "manager", "user"]);
export type EmployeeRole = z.infer<typeof ROLE_ENUM>;

const uuid = z.string().uuid();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assertAdmin = async (supabase: any, userId: string) => {
  const [su, ad] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (su.error || ad.error)
    throw new Error(su.error?.message ?? ad.error?.message ?? "Role check failed");
  if (!su.data && !ad.data) throw new Error("Forbidden: admin role required");
  return { isSuperAdmin: !!su.data, isAdmin: !!su.data || !!ad.data };
};

const requestOrigin = () => {
  try {
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const host =
      getRequestHeader("x-forwarded-host") ?? getRequestHeader("host");
    if (host) return `${proto}://${host}`;
  } catch {
    /* not in request context */
  }
  return "https://console.brantatech.com";
};

export interface PaymentMethodLite {
  id: string;
  kind: "bank" | "mfs";
  is_primary: boolean;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  branch: string | null;
  mfs_provider: string | null;
  mfs_number: string | null;
}

export interface EmployeeDetail {
  userId: string;
  email: string;
  brantaId: string;
  role: EmployeeRole;
  roles: EmployeeRole[];
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  isBanned: boolean;
  mustChangePassword: boolean;
  mustLinkTelegram: boolean;
  profile: {
    full_name: string | null;
    legal_full_name: string | null;
    avatar_url: string | null;
    employee_code: string | null;
    job_role: string | null;
    phone_primary: string | null;
    phone_alt: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    district: string | null;
    division: string | null;
    upazila: string | null;
    post_office: string | null;
    postcode: string | null;
    country: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_routing: string | null;
    mfs_provider: string | null;
    mfs_number: string | null;
    payment_methods: PaymentMethodLite[] | null;
    nid_url: string | null;
    cv_url: string | null;
    identity_doc_type: string | null;
    nid_front_url: string | null;
    nid_back_url: string | null;
    passport_photo_url: string | null;
    passport_address_url: string | null;
    birth_certificate_url: string | null;
    personal_gmail: string | null;
    kyc_status: string | null;
  };
}



const ROLE_ORDER = ["super_admin", "admin", "finance", "manager", "user"];
const primaryRole = (roles: string[]): EmployeeRole => {
  for (const r of ROLE_ORDER) if (roles.includes(r)) return r as EmployeeRole;
  return "user";
};

export const getEmployeeDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<EmployeeDetail> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const [{ data: userRes, error: userErr }, roles, prof] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(data.userId),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin
        .from("profiles")
        .select(
          "full_name, legal_full_name, avatar_url, employee_code, job_role, phone_primary, phone_alt, address_line1, address_line2, city, district, division, upazila, post_office, postcode, country, bank_name, bank_account_name, bank_account_number, bank_routing, mfs_provider, mfs_number, payment_methods, nid_url, cv_url, identity_doc_type, nid_front_url, nid_back_url, passport_photo_url, passport_address_url, birth_certificate_url, personal_gmail, kyc_status, must_change_password, must_link_telegram",
        )
        .eq("user_id", data.userId)
        .maybeSingle(),
    ]);

    if (userErr || !userRes.user) throw new Error(userErr?.message ?? "User not found");
    const u = userRes.user;
    const email = (u.email ?? "").toLowerCase();
    const rolesArr = (roles.data ?? []).map((r) => r.role as EmployeeRole);
    const bannedUntil =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((u as any).banned_until as string | null | undefined) ?? null;
    const isBanned = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

    return {
      userId: u.id,
      email,
      brantaId: email.split("@")[0] ?? "",
      role: primaryRole(rolesArr),
      roles: rolesArr,
      createdAt: u.created_at ?? "",
      lastSignInAt: u.last_sign_in_at ?? null,
      bannedUntil,
      isBanned,
      mustChangePassword: !!(prof.data as any)?.must_change_password,
      mustLinkTelegram: !!(prof.data as any)?.must_link_telegram,
      profile: (prof.data ?? {
        full_name: null,
        legal_full_name: null,
        avatar_url: null,
        employee_code: null,
        job_role: null,
        phone_primary: null,
        phone_alt: null,
        address_line1: null,
        address_line2: null,
        city: null,
        district: null,
        division: null,
        upazila: null,
        post_office: null,
        postcode: null,
        country: null,
        bank_name: null,
        bank_account_name: null,
        bank_account_number: null,
        bank_routing: null,
        mfs_provider: null,
        mfs_number: null,
        payment_methods: null,
        nid_url: null,
        cv_url: null,
        identity_doc_type: null,
        nid_front_url: null,
        nid_back_url: null,
        passport_photo_url: null,
        passport_address_url: null,
        birth_certificate_url: null,
        personal_gmail: null,
        kyc_status: "not_verified",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    };
  });

// Super-admin-only: set an employee's Job Role. Employees cannot edit their own.
export const setEmployeeJobRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: uuid,
        jobRole: z.string().trim().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
    if (!isSuperAdmin)
      throw new Error("Only a super_admin can assign job roles.");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const value = data.jobRole && data.jobRole.length > 0 ? data.jobRole : null;
    const { error } = await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ job_role: value } as any)
      .eq("user_id", data.userId);
    if (error) throw dbError(error);
    { const { syncTrackerEmployeeSafe } = await import("@/lib/tracker.server"); await syncTrackerEmployeeSafe(data.userId); }
    return { ok: true as const, jobRole: value };
  });


// Replace the target user's roles atomically. Only super_admin can grant
// super_admin. A super_admin cannot demote themselves (avoid lockout).
export const updateEmployeeRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: uuid,
        roles: z.array(ROLE_ENUM).min(1).max(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
    const wantsSuperAdmin = data.roles.includes("super_admin");
    if (wantsSuperAdmin && !isSuperAdmin) {
      throw new Error("Only a super_admin can grant the super_admin role.");
    }
    if (
      data.userId === context.userId &&
      isSuperAdmin &&
      !data.roles.includes("super_admin")
    ) {
      throw new Error("You cannot remove super_admin from your own account.");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Wipe + reinsert.
    const del = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (del.error) throw new Error(del.error.message);

    const rows = [...new Set(data.roles)].map((role) => ({
      user_id: data.userId,
      role,
    }));
    const ins = await supabaseAdmin.from("user_roles").insert(rows);
    if (ins.error) throw new Error(ins.error.message);

    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "employee.role_changed",
        recipients: [data.userId],
        vars: { roles: data.roles.join(", ") },
        dedupeKey: `role:${data.userId}:${Date.now()}`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[updateEmployeeRoles] notify failed:", e);
    }

    { const { syncTrackerEmployeeSafe } = await import("@/lib/tracker.server"); await syncTrackerEmployeeSafe(data.userId); }
    return { ok: true as const, roles: rows.map((r) => r.role) };
  });

// Ban = set banned_until far into the future. Unban = clear it.
// Uses updateUserById(..., { ban_duration }).
export const setEmployeeBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: uuid, ban: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId)
      throw new Error("You cannot ban your own account.");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      // 100 years ~ permanent ban. "none" clears it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ban_duration: (data.ban ? "876000h" : "none") as any,
    });
    if (error) throw dbError(error);
    { const { syncTrackerEmployeeSafe } = await import("@/lib/tracker.server"); await syncTrackerEmployeeSafe(data.userId); }
    return { ok: true as const, banned: data.ban };
  });

export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (uErr || !u.user) throw new Error(uErr?.message ?? "User not found");
    const email = (u.user.email ?? "").toLowerCase();
    if (!email.endsWith(DOMAIN)) throw new Error("Not a Branta employee account.");

    const newPassword = generateTempPassword();

    const upd = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: newPassword,
    });
    if (upd.error) throw new Error(upd.error.message);

    // Force the employee to set their own password on next sign-in.
    await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ must_change_password: true } as any)
      .eq("user_id", data.userId);

    try {
      const { hashPassword } = await import("@/lib/password-hash.server");
      const tempHash = await hashPassword(newPassword);
      await supabaseAdmin
        .from("password_history")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ user_id: data.userId, password_hash: tempHash } as any);
    } catch { /* best-effort */ }


    const roleRes = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const role = primaryRole((roleRes.data ?? []).map((r) => r.role));

    const { sendPasswordResetEmail } = await import(
      "@/lib/branta-email.server"
    );
    await sendPasswordResetEmail({
      recipientEmail: email,
      brantaId: email.split("@")[0] ?? "",
      tempPassword: newPassword,
      loginUrl: `${requestOrigin()}/login`,
      role,
    });

    return { ok: true as const };
  });

// Re-send onboarding instructions to an employee who hasn't yet set their
// personal password and/or linked Telegram. Mints a fresh temporary
// password, re-asserts both onboarding flags, and emails the welcome
// credentials again.
export const resendOnboardingInstructions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (uErr || !u.user) throw new Error(uErr?.message ?? "User not found");
    const email = (u.user.email ?? "").toLowerCase();
    if (!email.endsWith(DOMAIN))
      throw new Error("Not a Branta employee account.");

    const prof = await supabaseAdmin
      .from("profiles")
      .select("must_change_password, must_link_telegram")
      .eq("user_id", data.userId)
      .maybeSingle();
    const mustPwd = !!(prof.data as any)?.must_change_password;
    const mustTg = !!(prof.data as any)?.must_link_telegram;
    if (!mustPwd && !mustTg) {
      throw new Error(
        "This employee has already completed onboarding. Use Reset password instead.",
      );
    }

    const newPassword = generateTempPassword();
    const upd = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: newPassword,
    });
    if (upd.error) throw new Error(upd.error.message);

    // Re-assert both onboarding gates so the flow runs cleanly on next login.
    await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        must_change_password: true,
        must_link_telegram: mustTg || true,
      } as any)
      .eq("user_id", data.userId);

    try {
      const { hashPassword } = await import("@/lib/password-hash.server");
      const tempHash = await hashPassword(newPassword);
      await supabaseAdmin
        .from("password_history")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ user_id: data.userId, password_hash: tempHash } as any);
    } catch { /* best-effort */ }

    const roleRes = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const role = primaryRole((roleRes.data ?? []).map((r) => r.role));

    const { sendWelcomeEmail } = await import("@/lib/branta-email.server");
    await sendWelcomeEmail({
      recipientEmail: email,
      brantaId: email.split("@")[0] ?? "",
      tempPassword: newPassword,
      loginUrl: `${requestOrigin()}/login`,
      role,
    });

    return { ok: true as const, pendingPassword: mustPwd, pendingTelegram: mustTg };
  });

// magic link via admin.generateLink and return its hashed_token; the client
// then calls supabase.auth.verifyOtp() to swap into the target session.
export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
    if (!isSuperAdmin)
      throw new Error("Only a super_admin can impersonate other employees.");
    if (data.userId === context.userId)
      throw new Error("You are already signed in as this account.");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const [targetRes, adminRes] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(data.userId),
      supabaseAdmin.auth.admin.getUserById(context.userId),
    ]);
    if (targetRes.error || !targetRes.data.user)
      throw new Error(targetRes.error?.message ?? "Target user not found");
    if (adminRes.error || !adminRes.data.user)
      throw new Error(adminRes.error?.message ?? "Admin user not found");

    const targetEmail = (targetRes.data.user.email ?? "").toLowerCase();
    const adminEmail = (adminRes.data.user.email ?? "").toLowerCase();
    if (!targetEmail.endsWith(DOMAIN))
      throw new Error("Cannot impersonate non-Branta accounts.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bannedUntil = ((targetRes.data.user as any).banned_until as string | null) ?? null;
    if (bannedUntil && new Date(bannedUntil).getTime() > Date.now())
      throw new Error("This employee is banned. Unban before impersonating.");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password, must_link_telegram")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (prof?.must_change_password || prof?.must_link_telegram)
      throw new Error(
        "This employee hasn't completed onboarding yet (personal password / Telegram). Impersonation is available only after onboarding is complete.",
      );

    const { data: link, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      });
    if (linkErr || !link.properties?.hashed_token) {
      throw new Error(linkErr?.message ?? "Failed to mint impersonation token.");
    }

    await supabaseAdmin.from("impersonation_events").insert({
      admin_user_id: context.userId,
      admin_email: adminEmail,
      target_user_id: data.userId,
      target_email: targetEmail,
      action: "start",
    });

    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "auth.impersonation.started",
        recipients: [data.userId],
        vars: { admin: adminEmail },
        dedupeKey: `imp:${data.userId}:${context.userId}:start:${Date.now()}`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[startImpersonation] notify failed:", e);
    }

    return {
      hashedToken: link.properties.hashed_token,
      targetEmail,
      targetUserId: data.userId,
      adminEmail,
      adminUserId: context.userId,
    };
  });

// Called from the exit banner after we restore the admin's session.
export const logImpersonationEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetUserId: uuid,
        targetEmail: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // caller now has the admin session again.
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    await supabaseAdmin.from("impersonation_events").insert({
      admin_user_id: context.userId,
      admin_email: (adminUser.user?.email ?? "").toLowerCase(),
      target_user_id: data.targetUserId,
      target_email: data.targetEmail,
      action: "end",
    });
    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "auth.impersonation.stopped",
        recipients: [data.targetUserId],
        vars: {},
        dedupeKey: `imp:${data.targetUserId}:${context.userId}:stop:${Date.now()}`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[logImpersonationEnd] notify failed:", e);
    }
    return { ok: true as const };
  });

// ─── Lead assignment ───────────────────────────────────────────────────────

export interface AssignedLead {
  id: string;
  slug: string;
  lead_code: string;
  name: string;
  company: string | null;
  status: string;
}

export const listAssignedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<AssignedLead[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rows, error } = await supabaseAdmin
      .from("leads")
      .select("id, slug, lead_code, name, company, status")
      .eq("owner_id", data.userId)
      .order("last_activity_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
    return (rows ?? []) as AssignedLead[];
  });

export const searchLeadsForAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().trim().max(120).default("") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AssignedLead[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    let q = supabaseAdmin
      .from("leads")
      .select("id, slug, lead_code, name, company, status")
      .order("last_activity_at", { ascending: false })
      .limit(20);
    if (data.q) {
      const like = `%${data.q}%`;
      q = q.or(
        `name.ilike.${like},company.ilike.${like},lead_code.ilike.${like},slug.ilike.${like}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw dbError(error);
    return (rows ?? []) as AssignedLead[];
  });

export const assignLeadOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        leadId: uuid,
        ownerId: uuid.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("leads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ owner_id: data.ownerId } as any)
      .eq("id", data.leadId);
    if (error) throw dbError(error);
    return { ok: true as const };
  });

// ─── Wallet (admin view of another employee) ───────────────────────────────

export interface EmployeeWalletBalance {
  currency: string;
  locked: number;
  available: number;
  requested: number;
  paid: number;
}

export interface EmployeePayoutRow {
  id: string;
  invoice_id: string;
  invoice_slug: string | null;
  installment_id: string;
  installment_label: string | null;
  installment_due: string | null;
  amount: number;
  currency: string;
  status: string;
  unlocked_at: string | null;
  requested_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface EmployeeWithdrawalRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  paid_at: string | null;
  transfer_ref: string | null;
  admin_note: string | null;
}

export const getEmployeeWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(
    async ({ data, context }): Promise<{
      balances: EmployeeWalletBalance[];
      payouts: EmployeePayoutRow[];
      withdrawals: EmployeeWithdrawalRow[];
    }> => {
      await assertAdmin(context.supabase, context.userId);
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const [balRes, poRes, wdRes] = await Promise.all([
        supabaseAdmin.from("v_wallet_balances").select("*").eq("user_id", data.userId),
        supabaseAdmin
          .from("invoice_payouts")
          .select("*")
          .eq("user_id", data.userId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabaseAdmin
          .from("withdrawal_requests")
          .select("id, amount, currency, status, requested_at, decided_at, paid_at, transfer_ref, admin_note")
          .eq("user_id", data.userId)
          .order("requested_at", { ascending: false })
          .limit(200),
      ]);
      if (balRes.error) throw new Error(balRes.error.message);
      if (poRes.error) throw new Error(poRes.error.message);
      if (wdRes.error) throw new Error(wdRes.error.message);

      const rows = (poRes.data ?? []) as unknown as EmployeePayoutRow[];
      const invIds = Array.from(new Set(rows.map((r) => r.invoice_id))).filter(Boolean);
      const instIds = Array.from(new Set(rows.map((r) => r.installment_id))).filter(Boolean);
      const [invs, insts] = await Promise.all([
        invIds.length
          ? supabaseAdmin.from("invoices").select("id, slug").in("id", invIds)
          : Promise.resolve({ data: [] as { id: string; slug: string | null }[] }),
        instIds.length
          ? supabaseAdmin
              .from("invoice_installments")
              .select("id, label, due_date")
              .in("id", instIds)
          : Promise.resolve({
              data: [] as { id: string; label: string; due_date: string }[],
            }),
      ]);
      const invMap = new Map<string, string | null>();
      (invs.data ?? []).forEach((i: { id: string; slug: string | null }) =>
        invMap.set(i.id, i.slug),
      );
      const instMap = new Map<string, { label: string; due_date: string }>();
      (insts.data ?? []).forEach(
        (i: { id: string; label: string; due_date: string }) =>
          instMap.set(i.id, { label: i.label, due_date: i.due_date }),
      );

      return {
        balances: (balRes.data ?? []) as unknown as EmployeeWalletBalance[],
        payouts: rows.map((r) => ({
          ...r,
          invoice_slug: invMap.get(r.invoice_id) ?? null,
          installment_label: instMap.get(r.installment_id)?.label ?? null,
          installment_due: instMap.get(r.installment_id)?.due_date ?? null,
        })),
        withdrawals: (wdRes.data ?? []) as unknown as EmployeeWithdrawalRow[],
      };
    },
  );

// ─── Sessions (admin view of another employee) ─────────────────────────────

export interface EmployeeSessionRow {
  id: string;
  session_key: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  logout_reason?: string | null;
}

export const listEmployeeSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<EmployeeSessionRow[]> => {
    if (data.userId !== context.userId) {
      await assertAdmin(context.supabase, context.userId);
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { expireStaleSessions } = await import("@/lib/user-sessions.functions");
    await expireStaleSessions(supabaseAdmin, data.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("user_sessions")
      .select(
        "id, session_key, device, browser, os, ip, country, city, region, created_at, last_seen_at, revoked_at, logout_reason",
      )
      .eq("user_id", data.userId)
      .order("last_seen_at", { ascending: false })
      .limit(50);
    if (error) throw dbError(error);
    return (rows ?? []) as EmployeeSessionRow[];
  });

export const revokeEmployeeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: uuid, sessionId: uuid }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.userId !== context.userId) {
      await assertAdmin(context.supabase, context.userId);
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Update triggers realtime → target device's session-watcher signs out.
    const { data: sess } = await supabaseAdmin
      .from("user_sessions")
      .select("device, browser")
      .eq("id", data.sessionId)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("user_sessions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ revoked_at: new Date().toISOString(), logout_reason: "revoked_by_admin" } as any)
      .eq("user_id", data.userId)
      .eq("id", data.sessionId)
      .is("revoked_at", null);
    if (error) throw dbError(error);
    if (data.userId !== context.userId) {
      try {
        const { notify } = await import("@/lib/notify.server");
        const s = sess as { device?: string; browser?: string } | null;
        const device = [s?.device, s?.browser].filter(Boolean).join(" · ") || "a device";
        await notify({
          event: "auth.session.revoked_by_admin",
          recipients: [data.userId],
          vars: { device },
          dedupeKey: `session:${data.sessionId}:revoked`,
          actorId: context.userId,
        });
      } catch (e) {
        console.error("[revokeEmployeeSession] notify failed:", e);
      }
    }
    return { ok: true as const };
  });
