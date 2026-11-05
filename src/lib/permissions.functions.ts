// Per-user permission toggles that let super admins fine-tune what any
// employee can do with leads. Super admins always have every permission
// implicitly (has_permission short-circuits on is_super_admin).
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const PERMISSION_KEYS = [
  "lead_delete",
  "lead_manage",
  "lead_assign",
  "customer_access",
  "customer_view_all",
  "customer_view_detail",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export interface UserPermissions {
  user_id: string;
  lead_delete: boolean;
  lead_manage: boolean;
  lead_assign: boolean;
  customer_access: boolean;
  customer_view_all: boolean;
  customer_view_detail: boolean;
}

const DEFAULTS: Omit<UserPermissions, "user_id"> = {
  lead_delete: false,
  lead_manage: true,
  lead_assign: false,
  customer_access: true,
  customer_view_all: true,
  customer_view_detail: true,
};



// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw dbError(error);
  if (!data) throw new Error("Forbidden: super_admin required");
}

/**
 * Read a caller's effective toggle honoring the per-user override even for
 * super admins. Role only affects settings access — actions gated by a
 * toggle respect the toggle regardless of role.
 */
export async function callerHasPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  key: keyof Omit<UserPermissions, "user_id">,
): Promise<boolean> {
  const { data: ga } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (ga) return true;
  const { data } = await supabase
    .from("user_permissions")
    .select(key)
    .eq("user_id", userId)
    .maybeSingle();
  if (data && key in data) return !!(data as Record<string, unknown>)[key];
  return DEFAULTS[key];
}

export async function assertCallerPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  key: keyof Omit<UserPermissions, "user_id">,
  label: string,
) {
  const ok = await callerHasPermission(supabase, userId, key);
  if (!ok) throw new Error(`Forbidden: ${label} permission is disabled for your account`);
}


/** Called by any signed-in user to learn their own effective toggles. */
export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserPermissions & { isSuperAdmin: boolean; isAdmin: boolean; isManager: boolean; isFinance: boolean; roles: string[] }> => {
    const [suRes, adRes, managerRes, finRes] = await Promise.all([
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "super_admin",
      }),
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "manager",
      }),
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "finance",
      }),
    ]);
    const isSuperAdmin = !!suRes.data;
    const isAdmin = isSuperAdmin || !!adRes.data;
    const isManager = !!managerRes.data;
    const isFinance = isSuperAdmin || isAdmin || !!finRes.data || isManager;
    // NOTE: toggles apply on top of role. Even super_admins respect their
    // per-user overrides so a super_admin with lead_delete=false cannot
    // delete leads from the UI or server. Role only affects settings access.

    const [{ data }, rolesRes] = await Promise.all([
      context.supabase.from("user_permissions").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const roles = ((rolesRes.data ?? []) as { role: string }[]).map((r) => String(r.role));
    return {
      user_id: context.userId,
      ...DEFAULTS,
      ...(data ?? {}),
      ...(isSuperAdmin ? Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) : {}),
      isSuperAdmin,
      isAdmin,
      isManager: isManager || roles.includes("coo"),
      isFinance,
      roles,
    } as UserPermissions & { isSuperAdmin: boolean; isAdmin: boolean; isManager: boolean; isFinance: boolean; roles: string[] };
  });

export const getUserPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<UserPermissions> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row } = await supabaseAdmin
      .from("user_permissions")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();
    return {
      user_id: data.userId,
      ...DEFAULTS,
      ...(row ?? {}),
    } as UserPermissions;
  });

export const setUserPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; key: PermissionKey; value: boolean }) =>
    z
      .object({
        userId: z.string().uuid(),
        key: z.enum(PERMISSION_KEYS),
        value: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Ensure a row exists with defaults, without clobbering existing values.
    // Insert-if-missing: ignore conflict so an existing row is untouched.
    const { error: insertErr } = await supabaseAdmin
      .from("user_permissions")
      .upsert(
        { user_id: data.userId, ...DEFAULTS },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    if (insertErr) throw new Error(insertErr.message);
    // Then update only the single toggled column.
    const { error } = await supabaseAdmin
      .from("user_permissions")
      .update({ [data.key]: data.value } as never)
      .eq("user_id", data.userId);


    if (error) throw dbError(error);
    try {
      const { notify } = await import("@/lib/notify.server");
      await notify({
        event: "permission.changed",
        recipients: [data.userId],
        vars: { permission: data.key, value: data.value ? "enabled" : "disabled" },
        dedupeKey: `perm:${data.userId}:${data.key}:${data.value ? 1 : 0}:${Date.now()}`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[setUserPermission] notify failed:", e);
    }
    return { ok: true as const };
  });

// ---- Bulk lead operations (super_admin only) ----------------------------

export const bulkAssignLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadIds: string[]; ownerId: string | null }) =>
    z
      .object({
        leadIds: z.array(z.string().uuid()).min(1).max(500),
        ownerId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    await assertCallerPermission(context.supabase, context.userId, "lead_assign", "Reassign leads");
    const { error } = await context.supabase
      .from("leads")
      .update({ owner_id: data.ownerId })
      .in("id", data.leadIds);
    if (error) throw dbError(error);
    return { ok: true as const, count: data.leadIds.length };
  });


export const bulkDeleteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadIds: string[] }) =>
    z.object({ leadIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    await assertCallerPermission(context.supabase, context.userId, "lead_delete", "Delete leads");
    const { error } = await context.supabase
      .from("leads")
      .delete()
      .in("id", data.leadIds);
    if (error) throw dbError(error);
    return { ok: true as const, count: data.leadIds.length };
  });

