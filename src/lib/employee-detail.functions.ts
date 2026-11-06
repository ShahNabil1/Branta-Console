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

const ROLE_ENUM = z.enum(["super_admin", "admin", "finance", "manager", "coo", "user"]);
export type EmployeeRole = z.infer<typeof ROLE_ENUM>;

const uuid = z.string().uuid();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assertAdmin = async (supabase: any, userId: string) => {
  const [su, ad, ceo] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "manager" }),
  ]);
  if (su.error || ad.error)
    throw new Error(su.error?.message ?? ad.error?.message ?? "Role check failed");
  if (!su.data && !ad.data && !ceo.data) throw new Error("Forbidden: admin role required");
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
  companies: import("@/lib/company-scope.server").EmployeeCompany[];
  canEditJobRole: boolean;
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
  passwordResetPending: boolean;
  allowedApps: string[];
  workEmailVerified: boolean;
  gmailSource: "google" | "cloudflare" | null;
  socialLinks: { id: string; platform: string; url: string; label: string | null }[];
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



const ROLE_ORDER = ["super_admin", "admin", "finance", "manager", "coo", "user"];
const primaryRole = (roles: string[]): EmployeeRole => {
  for (const r of ROLE_ORDER) if (roles.includes(r)) return r as EmployeeRole;
  return "user";
};

export const getEmployeeDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<EmployeeDetail> => {
    const scope = await import("@/lib/company-scope.server");
    const manages = await scope.managesEmployee(context.supabase, context.userId, data.userId);
    let isSuper = false;
    if (!manages) isSuper = (await assertAdmin(context.supabase, context.userId)).isSuperAdmin;
    else isSuper = !!(await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" })).data;
    const companies = (await scope.employeeCompanies([data.userId])).get(data.userId) ?? [];
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const [{ data: userRes, error: userErr }, roles, prof] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(data.userId),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin
        .from("profiles")
        .select(
          "full_name, legal_full_name, avatar_url, employee_code, job_role, phone_primary, phone_alt, address_line1, address_line2, city, district, division, upazila, post_office, postcode, country, bank_name, bank_account_name, bank_account_number, bank_routing, mfs_provider, mfs_number, payment_methods, nid_url, cv_url, identity_doc_type, nid_front_url, nid_back_url, passport_photo_url, passport_address_url, birth_certificate_url, personal_gmail, kyc_status, must_change_password, must_link_telegram, allowed_apps",
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

    const gmail = ((prof.data as any)?.personal_gmail as string | null)?.toLowerCase() ?? null;
    const meta = u.app_metadata as { gmail_source?: { email: string; via: "google" | "cloudflare" } } | undefined;
    let gmailSource: "google" | "cloudflare" | null = null;
    let workEmailVerified = false;
    const [social, delivered] = await Promise.all([
      supabaseAdmin.from("profile_social_links").select("id, platform, url, label").eq("user_id", data.userId).order("sort_order", { ascending: true }),
      supabaseAdmin.from("email_events").select("id").eq("email", email).eq("event", "delivered").limit(1),
    ]);
    if ((delivered.data ?? []).length) workEmailVerified = true;
    try {
      const cf = await import("@/lib/cloudflare-email.server");
      if (cf.cloudflareConfigured()) {
        const [dests, rules] = await Promise.all([cf.listDestinations(), cf.listForwardRules()]);
        if (!workEmailVerified) workEmailVerified = rules.some((r) => r.from.toLowerCase() === email && r.enabled && r.to.some((t) => dests.some((d) => d.verified && d.email === t.toLowerCase())));
        if (gmail && meta?.gmail_source?.email !== gmail && dests.some((d) => d.email === gmail && d.verified)) gmailSource = "cloudflare";
      }
    } catch { /* Cloudflare unavailable */ }
    if (gmail) gmailSource = meta?.gmail_source?.email === gmail ? meta.gmail_source.via : (gmailSource ?? "google");
    return {
      companies,
      canEditJobRole: isSuper || manages,
      workEmailVerified,
      gmailSource,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socialLinks: ((social.data ?? []) as any[]).map((r) => ({ id: r.id, platform: r.platform, url: r.url, label: r.label ?? null })),
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
      passwordResetPending: u.app_metadata?.password_reset_pending === true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allowedApps: ((prof.data as any)?.allowed_apps as string[] | null) ?? [],
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
    const manages = await (await import("@/lib/company-scope.server")).managesEmployee(context.supabase, context.userId, data.userId);
    if (!manages) {
      const { isSuperAdmin } = await assertAdmin(context.supabase, context.userId);
      if (!isSuperAdmin) throw new Error("Only a Group Admin or this employee's company C.E.O/C.O.O can assign job roles.");
    }
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
    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(data.userId); }
    return { ok: true as const, jobRole: value };
  });

// Admin-only: edit an employee's display and legal names (employees can't edit their own).
export const setEmployeeName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: uuid,
        fullName: z.string().trim().min(2).max(120),
        legalFullName: z.string().trim().min(2).max(160),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("full_name, legal_full_name")
      .eq("user_id", data.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ full_name: data.fullName, legal_full_name: data.legalFullName } as any)
      .eq("user_id", data.userId);
    if (error) throw dbError(error);
    console.info("[audit] employee name changed", {
      actor: context.userId,
      target: data.userId,
      before,
      after: { full_name: data.fullName, legal_full_name: data.legalFullName },
    });
    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(data.userId); }
    return { ok: true as const };
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
    const ins = await supabaseAdmin.from("user_roles").insert(rows as never);
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

    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(data.userId); }
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
    if (!(await (await import("@/lib/company-scope.server")).managesEmployee(context.supabase, context.userId, data.userId))) await assertAdmin(context.supabase, context.userId);
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
    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(data.userId); }
    return { ok: true as const, banned: data.ban };
  });

export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid, resetTwoFactor: z.boolean().default(false) }).parse(input))
  .handler(async ({ data, context }) => {
    const isSuperAdmin = (await (await import("@/lib/company-scope.server")).managesEmployee(context.supabase, context.userId, data.userId)) ? false : (await assertAdmin(context.supabase, context.userId)).isSuperAdmin;
    const { isStrongSession } = await import("@/lib/session-assurance.server");
    if (!await isStrongSession(context.supabase, context.claims, context.userId))
      throw new Error("Verify your two-factor authentication or passkey before resetting an employee password.");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (uErr || !u.user) throw new Error(uErr?.message ?? "User not found");
    const email = (u.user.email ?? "").toLowerCase();
    if (!email.endsWith(DOMAIN)) throw new Error("Not a Branta employee account.");

    const roleRes = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (roleRes.error) throw dbError(roleRes.error);
    if (!isSuperAdmin && roleRes.data?.some((r) => r.role === "super_admin"))
      throw new Error("Only a Super Admin can reset another Super Admin's password.");
    const role = primaryRole((roleRes.data ?? []).map((r) => r.role));
    const newPassword = generateTempPassword();
    const { hashPassword } = await import("@/lib/password-hash.server");
    const { applyEmployeePasswordReset } = await import("@/lib/employee-password-reset.server");
    const { sendPasswordResetEmail } = await import(
      "@/lib/branta-email.server"
    );
    return applyEmployeePasswordReset({
      admin: supabaseAdmin,
      user: u.user,
      password: newPassword,
      passwordHash: await hashPassword(newPassword),
      resetTwoFactor: data.resetTwoFactor,
      sendEmail: () => sendPasswordResetEmail({
      recipientEmail: email,
      brantaId: email.split("@")[0] ?? "",
      tempPassword: newPassword,
      loginUrl: `${requestOrigin()}/login`,
      role,
      resetTwoFactor: data.resetTwoFactor,
      }),
    });
  });

// Re-send onboarding instructions to an employee who hasn't yet set their
// personal password and/or linked Telegram. Mints a fresh temporary
// password, re-asserts both onboarding flags, and emails the welcome
// credentials again.
export const resendOnboardingInstructions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await (await import("@/lib/company-scope.server")).managesEmployee(context.supabase, context.userId, data.userId))) await assertAdmin(context.supabase, context.userId);
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

    if (u.user.app_metadata?.password_reset_pending === true)
      throw new Error("This employee is awaiting a password change, not onboarding. Use Reset password instead.");

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
        must_link_telegram: false,
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
// The end record is only written when this admin has an open, recent
// "start" record for the same target; target identity comes from that
// server-written record, never from the caller.
export const logImpersonationEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetUserId: uuid,
        targetEmail: z.string().email().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // caller now has the admin session again.
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: evErr } = await supabaseAdmin
      .from("impersonation_events")
      .select("action, admin_email, target_email, created_at")
      .eq("admin_user_id", context.userId)
      .eq("target_user_id", data.targetUserId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (evErr) throw dbError(evErr);
    const last = events?.[0] as
      | { action: string; admin_email: string; target_email: string }
      | undefined;
    // Nothing open to close (never started, or already ended): no-op.
    if (!last || last.action !== "start") return { ok: true as const };

    await supabaseAdmin.from("impersonation_events").insert({
      admin_user_id: context.userId,
      admin_email: last.admin_email,
      target_user_id: data.targetUserId,
      target_email: last.target_email,
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
    if (!(await (await import("@/lib/company-scope.server")).managesEmployee(context.supabase, context.userId, data.userId))) await assertAdmin(context.supabase, context.userId);
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
    // Strip PostgREST filter syntax (, . ( ) : " \) and LIKE wildcards so the
    // search text can only ever be a literal substring match.
    const term = data.q.replace(/[,.():"\\%_*]/g, " ").replace(/\s+/g, " ").trim();
    if (term) {
      const like = `%${term}%`;
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
      if (!(await (await import("@/lib/company-scope.server")).managesEmployee(context.supabase, context.userId, data.userId))) await assertAdmin(context.supabase, context.userId);
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { expireStaleSessions } = await import("@/lib/user-sessions.functions");
    await expireStaleSessions(supabaseAdmin, data.userId);
    const admin = supabaseAdmin; const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
    void admin.from("user_sessions").delete().not("revoked_at", "is", null).lt("revoked_at", cutoff).then(() => {});
    const { data: rows, error } = await supabaseAdmin
      .from("user_sessions")
      .select(
        "id, session_key, device, browser, os, ip, country, city, region, created_at, last_seen_at, revoked_at, logout_reason",
      )
      .eq("user_id", data.userId)
      .or(`revoked_at.is.null,revoked_at.gte.${cutoff}`)
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
      if (!(await (await import("@/lib/company-scope.server")).managesEmployee(context.supabase, context.userId, data.userId))) await assertAdmin(context.supabase, context.userId);
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

/** Resolve a friendly employee URL segment (Branta ID, e.g. "md-shahi") or a legacy UUID to the user id. */
export const resolveEmployeeSlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ userId: string; slug: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = data.slug.toLowerCase();
    if (/^[0-9a-f-]{36}$/.test(slug)) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(slug);
      if (!u.user) throw new Error("Employee not found");
      return { userId: u.user.id, slug: (u.user.email ?? "").toLowerCase().split("@")[0] || u.user.id };
    }
    for (let page = 1; page <= 20; page++) {
      const { data: res, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const hit = res.users.find((u) => (u.email ?? "").toLowerCase().split("@")[0] === slug);
      if (hit) return { userId: hit.id, slug };
      if (res.users.length < 200) break;
    }
    throw new Error("Employee not found");
  });

// Admin-only: grant/revoke sister-concern app access (e.g. Admakai).
export const updateEmployeeAllowedApps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: uuid, allowedApps: z.array(z.enum(["admakai"])).max(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const allowed = [...new Set(data.allowedApps)];
    const { error } = await supabaseAdmin.from("profiles").update({ allowed_apps: allowed } as never).eq("user_id", data.userId);
    if (error) throw dbError(error);
    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(data.userId); }
    return { ok: true as const, allowedApps: allowed };
  });

/** Mail delivery events for one employee's addresses — Branta admins or the employee's company CEO/COO. */
export const listEmployeeMailEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const manages = await (await import("@/lib/company-scope.server")).managesEmployee(context.supabase, context.userId, data.userId);
    if (!manages) await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("profiles").select("email, personal_gmail").eq("user_id", data.userId).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = [...new Set([(p as any)?.email, (p as any)?.personal_gmail].filter(Boolean).map((e: string) => e.toLowerCase()))];
    if (!list.length) return [];
    const { data: rows, error } = await supabaseAdmin.from("email_events")
      .select("id, event, email, subject, reason, message_id, occurred_at, raw")
      .in("email", list).order("occurred_at", { ascending: false }).limit(200);
    if (error) throw dbError(error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (rows ?? []) as any[];
    const ids = [...new Set(out.filter((r) => r.event === "unblocked" && r.raw?.by && !r.raw.by_name).map((r) => r.raw.by as string))];
    if (ids.length) {
      const { data: ps } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nm = new Map((ps ?? []).map((x: any) => [x.id, x.full_name || x.email]));
      out.forEach((r) => { if (r.raw?.by && !r.raw.by_name) r.raw.by_name = nm.get(r.raw.by) ?? undefined; });
    }
    return out;
  });
