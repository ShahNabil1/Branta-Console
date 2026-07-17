// Server functions for managing a lead's Social Links.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface LeadSocialLinkRow {
  id: string;
  lead_id: string;
  platform: string;
  url: string;
  label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const SOCIAL_PLATFORMS = [
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "youtube",
  "x",
  "tiktok",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const listLeadSocialLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_social_links")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as LeadSocialLinkRow[];
  });

export const addLeadSocialLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        platform: z.string().min(1),
        url: z.string().min(1),
        label: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("lead_social_links")
      .insert({
        lead_id: data.leadId,
        platform: data.platform,
        url: data.url.trim(),
        label: data.label?.trim() || null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as LeadSocialLinkRow;
  });

export const updateLeadSocialLink = createServerFn({ method: "POST" })
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
    const patch: {
      platform?: string;
      url?: string;
      label?: string | null;
    } = {};
    if (data.patch.platform !== undefined) patch.platform = data.patch.platform;
    if (data.patch.url !== undefined) patch.url = data.patch.url.trim();
    if (data.patch.label !== undefined)
      patch.label = data.patch.label?.trim() || null;
    const { data: row, error } = await context.supabase
      .from("lead_social_links")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row as LeadSocialLinkRow;
  });

export const deleteLeadSocialLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("lead_social_links")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
