
-- 1. Extend leads with primary-person extras
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS phone_label text,
  ADD COLUMN IF NOT EXISTS email_label text,
  ADD COLUMN IF NOT EXISTS alt_phone text,
  ADD COLUMN IF NOT EXISTS alt_phone_label text,
  ADD COLUMN IF NOT EXISTS alt_email citext,
  ADD COLUMN IF NOT EXISTS alt_email_label text,
  ADD COLUMN IF NOT EXISTS contact_preference text;

-- 2. Extend lead_contacts to be full "person" records for teammates
ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_label text,
  ADD COLUMN IF NOT EXISTS email_label text,
  ADD COLUMN IF NOT EXISTS alt_phone text,
  ADD COLUMN IF NOT EXISTS alt_phone_label text,
  ADD COLUMN IF NOT EXISTS alt_email citext,
  ADD COLUMN IF NOT EXISTS alt_email_label text,
  ADD COLUMN IF NOT EXISTS contact_preference text;

-- 3. Cap contacts per lead at 10 (primary counts as the lead itself, so 10 rows here = 10 teammates + primary lead person)
CREATE OR REPLACE FUNCTION public.enforce_lead_contact_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM public.lead_contacts WHERE lead_id = NEW.lead_id;
  IF cnt >= 10 THEN
    RAISE EXCEPTION 'A lead can have at most 10 contacts'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_contact_limit ON public.lead_contacts;
CREATE TRIGGER trg_lead_contact_limit
  BEFORE INSERT ON public.lead_contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_contact_limit();
