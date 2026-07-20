ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_doc_type text,
  ADD COLUMN IF NOT EXISTS nid_front_url text,
  ADD COLUMN IF NOT EXISTS nid_back_url text,
  ADD COLUMN IF NOT EXISTS passport_photo_url text,
  ADD COLUMN IF NOT EXISTS passport_address_url text,
  ADD COLUMN IF NOT EXISTS birth_certificate_url text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_identity_doc_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_identity_doc_type_check
  CHECK (identity_doc_type IS NULL OR identity_doc_type IN ('nid','passport','birth_certificate'));