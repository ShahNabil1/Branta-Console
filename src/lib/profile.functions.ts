// Profile page server functions: read + update the current user's profile.
// KYC is powered by Didit.me. See src/lib/didit.functions.ts for session
// creation and src/routes/api/public/didit.webhook.ts for webhook ingest.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const nullableString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null));

const UpdateProfileInput = z.object({
  full_name: nullableString(120),
  legal_full_name: nullableString(160),
  phone_primary: nullableString(30),
  phone_alt: nullableString(30),
  address_line1: nullableString(200),
  // Holds the present address as JSON ({ same } or address fields).
  address_line2: nullableString(1000),
  city: nullableString(80),
  district: nullableString(80),
  division: nullableString(80),
  upazila: nullableString(80),
  post_office: nullableString(120),
  postcode: nullableString(20),
  country: nullableString(80),
  bank_name: nullableString(120),
  bank_account_name: nullableString(160),
  bank_account_number: nullableString(40),
  bank_routing: nullableString(40),
  mfs_provider: nullableString(40),
  mfs_number: nullableString(40),
  payment_methods: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["bank", "mfs"]),
        is_primary: z.boolean().default(false),
        bank_name: z.string().nullish(),
        account_holder: z.string().nullish(),
        account_number: z.string().nullish(),
        branch: z.string().nullish(),
        mfs_provider: z.string().nullish(),
        mfs_number: z.string().nullish(),
      }),
    )
    .max(20)
    .nullish(),
  avatar_url: nullableString(500),
  nid_url: nullableString(500),
  cv_url: nullableString(500),
  identity_doc_type: z
    .enum(["nid", "passport", "birth_certificate"])
    .nullish()
    .transform((v) => v ?? null),
  nid_front_url: nullableString(500),
  nid_back_url: nullableString(500),
  passport_photo_url: nullableString(500),
  passport_address_url: nullableString(500),
  birth_certificate_url: nullableString(500),
  personal_gmail: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v.toLowerCase() : null))
    .refine((v) => v === null || /^[a-z0-9._%+-]+@gmail\.com$/i.test(v), {
      message: "Must be a valid @gmail.com address",
    }),
});

export type PaymentMethod = {
  id: string;
  kind: "bank" | "mfs";
  is_primary: boolean;
  bank_name?: string | null;
  account_holder?: string | null;
  account_number?: string | null;
  branch?: string | null;
  mfs_provider?: string | null;
  mfs_number?: string | null;
};

export type ProfileRow = {
  user_id: string;
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
  payment_methods: PaymentMethod[] | null;
  nid_url: string | null;
  cv_url: string | null;
  identity_doc_type: "nid" | "passport" | "birth_certificate" | null;
  nid_front_url: string | null;
  nid_back_url: string | null;
  passport_photo_url: string | null;
  passport_address_url: string | null;
  birth_certificate_url: string | null;
  personal_gmail: string | null;
  kyc_status: string;
  kyc_document_type: string | null;
  kyc_document_number: string | null;
  kyc_document_expiry: string | null;
  kyc_extracted_full_name: string | null;
  kyc_extracted_address: string | null;
  kyc_submitted_at: string | null;
  kyc_verified_at: string | null;
  kyc_rejection_reason: string | null;
  didit_session_id: string | null;
  updated_at: string;
};


export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    profile: ProfileRow;
    email: string;
    gmailSource: "google" | "cloudflare" | null;
  }> => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    let profile = existing;
    if (!profile) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from("profiles")
        .insert({ user_id: context.userId })
        .select("*")
        .single();
      if (createErr) throw new Error(createErr.message);
      profile = created;
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    const gmail = (profile as { personal_gmail?: string | null }).personal_gmail?.toLowerCase() ?? null;
    const meta = userData.user?.app_metadata as { gmail_source?: { email: string; via: "google" | "cloudflare" } } | undefined;
    let gmailSource: "google" | "cloudflare" | null = null;
    if (gmail) {
      if (meta?.gmail_source?.email === gmail) gmailSource = meta.gmail_source.via;
      else {
        try {
          const { cloudflareConfigured, listDestinations } = await import("@/lib/cloudflare-email.server");
          if (cloudflareConfigured() && (await listDestinations()).some((d) => d.email === gmail && d.verified)) gmailSource = "cloudflare";
        } catch { /* Cloudflare unavailable */ }
        gmailSource ??= "google";
      }
    }
    return {
      profile: profile as unknown as ProfileRow,
      email: userData.user?.email ?? "",
      gmailSource,
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Names are admin-managed (Employee detail → Edit name); employees can't change them.
    const payload: Record<string, unknown> = { ...data };
    delete payload.full_name;
    delete payload.legal_full_name;
    const { error } = await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq("user_id", context.userId);
    if (error) throw dbError(error);
    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(context.userId); }
    return { ok: true as const };
  });

/** Instant single-field saves (avatar, personal Gmail) — no global Save needed. */
export const patchMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        avatar_url: z.string().trim().max(500).nullable().optional(),
        personal_gmail: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9._%+-]+@gmail\.com$/, "Must be a @gmail.com address")
          .nullable()
          .optional(),
      })
      .refine((v) => v.avatar_url !== undefined || v.personal_gmail !== undefined, "Nothing to save")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: Record<string, unknown> = {};
    if (data.avatar_url !== undefined) payload.avatar_url = data.avatar_url || null;
    if (data.personal_gmail !== undefined) payload.personal_gmail = data.personal_gmail || null;
    const { error } = await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq("user_id", context.userId);
    if (error) throw dbError(error);
    if (data.personal_gmail !== undefined) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      if (u.user) await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        app_metadata: { ...u.user.app_metadata, gmail_source: data.personal_gmail ? { email: data.personal_gmail, via: "google" } : null },
      });
    }
    { const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server"); await syncEmployeeAppsSafe(context.userId); }
    return { ok: true as const };
  });

