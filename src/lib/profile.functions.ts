// Profile page server functions: read + update the current user's profile.
// KYC is powered by Didit.me. See src/lib/didit.functions.ts for session
// creation and src/routes/api/public/didit.webhook.ts for webhook ingest.
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
  address_line2: nullableString(200),
  city: nullableString(80),
  district: nullableString(80),
  postcode: nullableString(20),
  country: nullableString(80),
  bank_name: nullableString(120),
  bank_account_name: nullableString(160),
  bank_account_number: nullableString(40),
  bank_routing: nullableString(40),
  mfs_provider: nullableString(40),
  mfs_number: nullableString(40),
  avatar_url: nullableString(500),
  nid_url: nullableString(500),
  cv_url: nullableString(500),
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

export type ProfileRow = {
  user_id: string;
  full_name: string | null;
  legal_full_name: string | null;
  avatar_url: string | null;
  phone_primary: string | null;
  phone_alt: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  district: string | null;
  postcode: string | null;
  country: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_routing: string | null;
  mfs_provider: string | null;
  mfs_number: string | null;
  nid_url: string | null;
  cv_url: string | null;
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
    return {
      profile: profile as unknown as ProfileRow,
      email: userData.user?.email ?? "",
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(data as any)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Flip KYC status to "under_review" the instant the user finishes the Didit
 * flow client-side, so the badge doesn't sit on "Not Verified" while we wait
 * for the webhook.
 */
export const markKycSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        kyc_status: "under_review",
        kyc_submitted_at: new Date().toISOString(),
      } as any)
      .eq("user_id", context.userId)
      .in("kyc_status", ["not_verified", "rejected", "under_review"]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Re-submit updated NID/CV documents after a rejection.
 */
export const requestKycReupload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        note: z.string().trim().max(500).nullish(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: profile, error: readErr } = await supabaseAdmin
      .from("profiles")
      .select("kyc_status, nid_url, cv_url, didit_session_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!profile) throw new Error("Profile not found");

    if (profile.kyc_status !== "rejected") {
      throw new Error(
        "Re-upload is only available after a rejected verification.",
      );
    }
    if (!profile.nid_url && !profile.cv_url) {
      throw new Error(
        "Upload an updated NID or CV in the Documents section first.",
      );
    }

    const now = new Date().toISOString();
    const rows: Array<Record<string, unknown>> = [];
    if (profile.nid_url) {
      rows.push({
        user_id: context.userId,
        verification_id: null,
        document_type: "nid_reupload",
        r2_key: null,
        r2_url: profile.nid_url,
        source_url: profile.nid_url,
        mime_type: null,
        payload: {
          reason: "user_reupload",
          note: data.note ?? null,
          submitted_at: now,
          previous_session_id: profile.didit_session_id,
        },
      });
    }
    if (profile.cv_url) {
      rows.push({
        user_id: context.userId,
        verification_id: null,
        document_type: "cv_reupload",
        r2_key: null,
        r2_url: profile.cv_url,
        source_url: profile.cv_url,
        mime_type: null,
        payload: {
          reason: "user_reupload",
          note: data.note ?? null,
          submitted_at: now,
          previous_session_id: profile.didit_session_id,
        },
      });
    }

    if (rows.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from("kyc_documents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(rows as any);
      if (insertErr) throw new Error(insertErr.message);
    }

    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        kyc_status: "under_review",
        kyc_submitted_at: now,
        kyc_rejection_reason: null,
        updated_at: now,
      } as any)
      .eq("user_id", context.userId)
      .eq("kyc_status", "rejected");
    if (updateErr) throw new Error(updateErr.message);

    return { ok: true as const, submitted: rows.length };
  });
