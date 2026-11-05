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

const RESERVED_LOCALS = new Set([
  "hello", "admin", "administrator", "root", "postmaster", "abuse",
  "hostmaster", "webmaster", "security", "noreply", "no-reply", "mailer-daemon",
]);

const RoleEnum = z.enum(["super_admin", "admin", "finance", "manager", "coo", "user"]);

const CreateInput = z.object({
  local: z.string(),
  password: z.string(),
  role: RoleEnum,
  fullName: z.string().trim().max(120).optional(),
  personalGmail: z.string().trim().toLowerCase().email().max(200).optional(),
  skipRouting: z.boolean().optional(),
  grantAdmakai: z.boolean().optional(),
  companyId: z.string().uuid(),
  companyRole: z.enum(["member", "manager", "finance", "super_admin"]).optional(),
});

/** Checks/registers the personal Gmail as a Cloudflare destination. */
export const checkEmailDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ gmail: z.string().trim().toLowerCase().email().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { cloudflareConfigured, ensureDestination } = await import("@/lib/cloudflare-email.server");
    if (!cloudflareConfigured()) return { status: "unconfigured" as const };
    await assertGmailFree(data.gmail);
    return { status: await ensureDestination(data.gmail) };
  });

/** Blocks a Gmail already forwarded-to by a Branta address that has a Console account. */
async function assertGmailFree(gmail: string) {
  const { forwardSourcesFor } = await import("@/lib/cloudflare-email.server");
  const sources = await forwardSourcesFor(gmail);
  if (sources.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const taken = sources.find((s) => (data?.users ?? []).some((u) => (u.email ?? "").toLowerCase() === s));
  if (taken) throw new Error(`This Gmail already receives mail for ${taken}, which already has a Console account. Use a different Gmail.`);
}

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
      const order = ["super_admin", "admin", "finance", "manager", "coo", "user"];
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
    // Shared company mailboxes are never employee accounts. "hello" is the
    // owner address the database auto-promotes to super_admin.
    if (RESERVED_LOCALS.has(local.toLowerCase())) {
      throw new Error("This Branta ID is reserved for a company mailbox. Choose another one.");
    }

    // Email routing must be ready before the account exists, so the welcome
    // mail actually reaches the employee.
    const routing = !!data.personalGmail && !data.skipRouting;
    if (routing) {
      const { cloudflareConfigured, ensureDestination } = await import("@/lib/cloudflare-email.server");
      if (!cloudflareConfigured()) throw new Error("Cloudflare Email Routing is not configured. Tick “Set up email routing manually” to continue.");
      await assertGmailFree(data.personalGmail!);
      const st = await ensureDestination(data.personalGmail!);
      if (st !== "verified") throw new Error("The personal Gmail is not verified yet. Ask the employee to click the Cloudflare verification link, then press Check again.");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Creation grants exactly one workspace. Holding (Branta Tech) roles are
    // group-wide; a sister-company employee gets a plain global "user" role and
    // their real role only inside that company.
    const { data: co } = await supabaseAdmin.from("companies").select("id, is_holding, name").eq("id", data.companyId).maybeSingle();
    if (!co) throw new Error("Choose a company for this employee.");
    const globalRole = co.is_holding ? data.role : "user";
    const memberRole = co.is_holding
      ? (data.role === "super_admin" || data.role === "admin" ? "super_admin" : data.role === "finance" ? "finance" : data.role === "manager" || data.role === "coo" ? "manager" : "member")
      : (data.companyRole ?? "member");
    if (!co.is_holding && memberRole === "super_admin" && !isSuperAdmin)
      throw new Error("Only a super_admin can create a company admin.");
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
    let ruleId: string | null = null;

    try {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newUserId, role: globalRole } as never);
      if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
        throw new Error(roleErr.message);
      }

      // Force onboarding on first sign-in: set a personal password AND
      // link Telegram. Both flags self-clear once the employee completes
      // the corresponding step.
      const profilePatch: Record<string, unknown> = {
        must_change_password: true,
        must_link_telegram: false,
      };
      if (data.personalGmail) profilePatch.personal_gmail = data.personalGmail;
      if (data.grantAdmakai) profilePatch.allowed_apps = ["admakai"];
      const { error: profErr } = await supabaseAdmin
        .from("profiles")
        .update(profilePatch as never)
        .eq("user_id", newUserId);
      if (profErr) throw dbError(profErr);

      const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("user_id", newUserId).maybeSingle();
      if (!prof?.id) throw new Error("Employee profile not found.");
      const { error: memErr } = await supabaseAdmin.from("company_members")
        .upsert({ company_id: co.id, user_id: prof.id, role: memberRole, is_active: true } as never, { onConflict: "company_id,user_id" });
      if (memErr) throw dbError(memErr);

      // Cloudflare Email Routing: forward name@brantatech.com -> personal Gmail
      // before the welcome mail goes out.
      if (routing && data.personalGmail) {
        await supabaseAdmin.auth.admin.updateUserById(newUserId, { app_metadata: { gmail_source: { email: data.personalGmail, via: "cloudflare" } } });
        const { upsertForwardRule } = await import("@/lib/cloudflare-email.server");
        ruleId = await upsertForwardRule(email, data.personalGmail);
      }

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

      const { sendWelcomeEmail, unblockBrevoContact } = await import("@/lib/branta-email.server");
      // A brand-new routing rule can take a while to go live; sending to the
      // Branta address immediately hard-bounces and gets it blocklisted.
      // Deliver straight to the verified Gmail instead.
      if (routing) await unblockBrevoContact(email);
      await sendWelcomeEmail({
        deliverTo: routing ? data.personalGmail : undefined,
        recipientEmail: email,
        brantaId: local,
        tempPassword: password,
        loginUrl,
        // Mail shows the role the employee actually holds in their workspace.
        role: co.is_holding
          ? data.role
          : `${({ member: "Member", manager: "Manager", finance: "Finance", super_admin: "Company admin" } as Record<string, string>)[memberRole] ?? memberRole} · ${(co as { name?: string }).name ?? ""}`,
      });
    } catch (err) {
      // Roll back the auth user if role assignment or email send failed —
      // otherwise the admin has to hunt down orphaned accounts by hand.
      if (ruleId) { const { deleteRule } = await import("@/lib/cloudflare-email.server"); await deleteRule(ruleId); }
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw err instanceof Error ? err : new Error(String(err));
    }

    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(newUserId); }
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
      if (!delErr) {
    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(data.userId); }
        return { ok: true as const, result: "deleted" as const, blockers };
      }
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
    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(data.userId); }
    return { ok: true as const, result: "deactivated" as const, blockers };
  });

/** Removes an address from Brevo's transactional blocklist; returns the real provider error on failure. */
export const unblockEmployeeMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { callGateway } = await import("@/lib/connector-gateway.server");
    let wasBlocked = true;
    try {
      await callGateway({ connector: "brevo", path: `/smtp/blockedContacts/${encodeURIComponent(data.email)}`, method: "DELETE" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Brevo answers 404 when the address is not on the blocklist — that is a success for the admin.
      if (!/404|not.?found|does not exist/i.test(msg)) throw new Error(`Brevo refused the unblock: ${msg}`);
      wasBlocked = false;
    }
    // Record the outcome so history shows block → unblock and the current state is real.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: me } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
      const byName = (me as any)?.full_name || (me as any)?.email || "Admin";
      await supabaseAdmin.from("email_events").insert({
        event: "unblocked", email: data.email, subject: null,
        reason: wasBlocked ? `Removed from blocklist by ${byName}` : `Checked by ${byName} · address was not blocked`,
        occurred_at: new Date().toISOString(), raw: { source: "console_unblock", by: context.userId, by_name: byName, wasBlocked },
      });
    } catch (e) { console.error("[unblock] history insert failed", e); }
    return { ok: true as const, wasBlocked };
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

/** Lists Cloudflare destination addresses (verified + pending). */
export const listEmailDestinations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { cloudflareConfigured, listDestinations } = await import("@/lib/cloudflare-email.server");
    if (!cloudflareConfigured()) return { configured: false, items: [] as { email: string; verified: boolean; created: string | null }[] };
    return { configured: true, items: await listDestinations() };
  });

/** Step 2: checks Branta ID is free, creates the forward rule and reads it back. */
export const prepareEmailRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ local: z.string(), gmail: z.string().trim().toLowerCase().email().max(200), stage: z.enum(["id", "rule", "verify"]), ruleId: z.string().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const local = localSchema.parse(data.local);
    const email = `${local}${DOMAIN}`;
    const cfm = await import("@/lib/cloudflare-email.server");
    if (!cfm.cloudflareConfigured()) throw new Error("Cloudflare Email Routing is not configured.");
    if (data.stage === "id") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: u } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if ((u?.users ?? []).some((x) => (x.email ?? "").toLowerCase() === email))
        throw new Error(`${email} already has a Console account.`);
      await assertGmailFree(data.gmail);
      if ((await cfm.ensureDestination(data.gmail)) !== "verified") throw new Error("The personal Gmail is not verified yet.");
      return { ok: true, ruleId: null as string | null };
    }
    if (data.stage === "rule") return { ok: true, ruleId: await cfm.upsertForwardRule(email, data.gmail) };
    if (!data.ruleId) throw new Error("Missing rule.");
    return { ok: await cfm.getRuleEnabled(data.ruleId), ruleId: data.ruleId };
  });
