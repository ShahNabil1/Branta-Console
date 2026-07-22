// Per-user permission toggles that let super admins fine-tune what any
// employee can do with leads. Super admins always have every permission
// implicitly (has_permission short-circuits on is_super_admin).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const PERMISSION_KEYS = [
  "lead_delete",
  "lead_manage",
  "lead_assign",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export interface UserPermissions {
  user_id: string;
  lead_delete: boolean;
  lead_manage: boolean;
  lead_assign: boolean;
}

const DEFAULTS: Omit<UserPermissions, "user_id"> = {
  lead_delete: false,
  lead_manage: true,
  lead_assign: false,
};


// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: super_admin required");
}

/** Called by any signed-in user to learn their own effective toggles. */
export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserPermissions & { isSuperAdmin: boolean }> => {
    const { data: su } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    const isSuperAdmin = !!su;
    if (isSuperAdmin) {
      return {
        user_id: context.userId,
        lead_delete: true,
        lead_manage: true,
        lead_edit: true,
        lead_assign: true,
        isSuperAdmin,
      };
    }
    const { data } = await context.supabase
      .from("user_permissions")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      user_id: context.userId,
      ...DEFAULTS,
      ...(data ?? {}),
      isSuperAdmin,
    } as UserPermissions & { isSuperAdmin: boolean };
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
    const patch: Record<string, boolean> = { [data.key]: data.value };
    const { error } = await supabaseAdmin
      .from("user_permissions")
      .upsert(
        { user_id: data.userId, ...DEFAULTS, ...patch },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
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
    const { error } = await context.supabase
      .from("leads")
      .update({ owner_id: data.ownerId })
      .in("id", data.leadIds);
    if (error) throw new Error(error.message);
    return { ok: true as const, count: data.leadIds.length };
  });

export const bulkDeleteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadIds: string[] }) =>
    z.object({ leadIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("leads")
      .delete()
      .in("id", data.leadIds);
    if (error) throw new Error(error.message);
    return { ok: true as const, count: data.leadIds.length };
  });
