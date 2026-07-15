
-- === profiles: expand for HR/KYC ===
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_full_name text,
  ADD COLUMN IF NOT EXISTS phone_primary text,
  ADD COLUMN IF NOT EXISTS phone_alt text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Bangladesh',
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_routing text,
  ADD COLUMN IF NOT EXISTS mfs_provider text,
  ADD COLUMN IF NOT EXISTS mfs_number text,
  ADD COLUMN IF NOT EXISTS nid_url text,
  ADD COLUMN IF NOT EXISTS cv_url text,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'not_verified',
  ADD COLUMN IF NOT EXISTS kyc_document_type text,
  ADD COLUMN IF NOT EXISTS kyc_document_number text,
  ADD COLUMN IF NOT EXISTS kyc_document_expiry date,
  ADD COLUMN IF NOT EXISTS kyc_extracted_full_name text,
  ADD COLUMN IF NOT EXISTS kyc_extracted_address text,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason text,
  ADD COLUMN IF NOT EXISTS metamap_identity_id text;

-- Validation trigger (kyc_status enum-ish)
CREATE OR REPLACE FUNCTION public.validate_profile_kyc_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kyc_status NOT IN ('not_verified','under_review','verified','rejected') THEN
    RAISE EXCEPTION 'Invalid kyc_status: %', NEW.kyc_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_validate_kyc_status ON public.profiles;
CREATE TRIGGER trg_profiles_validate_kyc_status
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_kyc_status();

-- updated_at auto-touch
DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- one profile row per user (webhook does .eq(user_id).single())
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key ON public.profiles(user_id);

-- === kyc_documents ===
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  verification_id text,
  document_type text NOT NULL,
  r2_key text,
  r2_url text,
  source_url text,
  mime_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kyc_documents TO authenticated;
GRANT ALL ON public.kyc_documents TO service_role;

ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view own kyc documents"
ON public.kyc_documents FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all kyc documents"
ON public.kyc_documents FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE INDEX IF NOT EXISTS kyc_documents_user_id_idx ON public.kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS kyc_documents_verification_id_idx ON public.kyc_documents(verification_id);
