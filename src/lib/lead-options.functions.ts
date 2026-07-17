// Server functions for dynamic Leads dropdowns (status + source).
// Any signed-in employee can read. Super admin panel will manage rows later.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LeadStatusOption {
  key: string;
  label: string;
  sort_order: number;
  color_var: string | null;
  is_active: boolean;
}

export interface LeadSourceOption {
  key: string;
  label: string;
  sort_order: number;
  requires_detail: boolean;
  is_active: boolean;
}

export interface LeadServiceOption {
  key: string;
  label: string;
  sort_order: number;
  requires_detail: boolean;
  is_active: boolean;
}

export const listLeadStatusOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeadStatusOption[]> => {
    const { data, error } = await context.supabase
      .from("lead_status_options")
      .select("key,label,sort_order,color_var,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LeadStatusOption[];
  });

export const listLeadSourceOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeadSourceOption[]> => {
    const { data, error } = await context.supabase
      .from("lead_source_options")
      .select("key,label,sort_order,requires_detail,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LeadSourceOption[];
  });

export const listLeadServiceOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeadServiceOption[]> => {
    const { data, error } = await context.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("lead_service_options" as any)
      .select("key,label,sort_order,requires_detail,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as LeadServiceOption[];
  });


// Fallbacks used when the server hasn't responded yet so the UI never renders empty.
export const STATUS_FALLBACK: LeadStatusOption[] = [
  { key: "new", label: "New", sort_order: 10, color_var: "--color-status-new", is_active: true },
  { key: "contacted", label: "Contacted", sort_order: 20, color_var: "--color-status-contacted", is_active: true },
  { key: "viewed", label: "Viewed", sort_order: 30, color_var: "--color-status-viewed", is_active: true },
  { key: "qualified", label: "Qualified", sort_order: 40, color_var: "--color-status-viewed", is_active: true },
  { key: "meeting", label: "Meeting Scheduled", sort_order: 50, color_var: "--color-status-meeting", is_active: true },
  { key: "proposal_sent", label: "Proposal Sent", sort_order: 60, color_var: "--color-status-meeting", is_active: true },
  { key: "negotiation", label: "Negotiation", sort_order: 70, color_var: "--color-status-meeting", is_active: true },
  { key: "on_hold", label: "On Hold", sort_order: 80, color_var: "--color-status-contacted", is_active: true },
  { key: "converted", label: "Converted", sort_order: 90, color_var: "--color-status-converted", is_active: true },
  { key: "lost", label: "Lost", sort_order: 100, color_var: "--color-status-contacted", is_active: true },
];

export const SOURCE_FALLBACK: LeadSourceOption[] = [
  { key: "facebook", label: "Facebook", sort_order: 10, requires_detail: false, is_active: true },
  { key: "instagram", label: "Instagram", sort_order: 20, requires_detail: false, is_active: true },
  { key: "linkedin", label: "LinkedIn", sort_order: 30, requires_detail: false, is_active: true },
  { key: "tiktok", label: "TikTok", sort_order: 40, requires_detail: false, is_active: true },
  { key: "whatsapp", label: "WhatsApp", sort_order: 50, requires_detail: false, is_active: true },
  { key: "website", label: "Website", sort_order: 60, requires_detail: false, is_active: true },
  { key: "referral", label: "Referral", sort_order: 70, requires_detail: false, is_active: true },
  { key: "direct", label: "Direct", sort_order: 80, requires_detail: false, is_active: true },
  { key: "other", label: "Other", sort_order: 999, requires_detail: true, is_active: true },
];

export function statusLabel(key: string, options: LeadStatusOption[]): string {
  return options.find((o) => o.key === key)?.label ?? key;
}
export function statusColorVar(key: string, options: LeadStatusOption[]): string {
  return options.find((o) => o.key === key)?.color_var ?? "--color-status-contacted";
}
