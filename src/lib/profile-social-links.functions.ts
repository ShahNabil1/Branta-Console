// Server functions for managing an employee's Profile Social Links.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface ProfileSocialLinkRow {
  id: string;
  user_id: string;
  platform: string;
  url: string;
  label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const listMyProfileSocialLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("profile_social_links")
      .select("*")
      .eq("user_id", context.userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as ProfileSocialLinkRow[];
  });

export const addMyProfileSocialLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        platform: z.string().min(1),
        url: z.string().min(1),
        label: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("profile_social_links")
      .insert({
        user_id: context.userId,
        platform: data.platform,
        url: data.url.trim(),
        label: data.label?.trim() || null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as ProfileSocialLinkRow;
  });

export const updateMyProfileSocialLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          platform: z.string().min(1).optional(),
          url: z.string().min(1).optional(),
          label: z.string().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: { platform?: string; url?: string; label?: string | null } = {};
    if (data.patch.platform !== undefined) patch.platform = data.patch.platform;
    if (data.patch.url !== undefined) patch.url = data.patch.url.trim();
    if (data.patch.label !== undefined)
      patch.label = data.patch.label?.trim() || null;
    const { data: row, error } = await context.supabase
      .from("profile_social_links")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw error;
    return row as ProfileSocialLinkRow;
  });

export const deleteMyProfileSocialLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("profile_social_links")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true as const };
  });
