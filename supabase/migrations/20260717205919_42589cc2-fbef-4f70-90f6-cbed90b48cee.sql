
-- citext for case-insensitive emails
CREATE EXTENSION IF NOT EXISTS citext;

-- 1. Sequence + slug column
CREATE SEQUENCE IF NOT EXISTS public.lead_slug_seq START 1;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS slug text;

CREATE OR REPLACE FUNCTION public.assign_lead_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    n := nextval('public.lead_slug_seq');
    NEW.slug := 'BT-' || lpad(n::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_lead_slug ON public.leads;
CREATE TRIGGER trg_assign_lead_slug
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.assign_lead_slug();

-- Backfill existing rows in lead_code order
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT id FROM public.leads WHERE slug IS NULL ORDER BY lead_code LOOP
    n := nextval('public.lead_slug_seq');
    UPDATE public.leads SET slug = 'BT-' || lpad(n::text, 2, '0') WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.leads ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS leads_slug_key ON public.leads (slug);
CREATE INDEX IF NOT EXISTS leads_slug_lower_idx ON public.leads (lower(slug));

-- 2. lead_contacts table
CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  email citext NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contacts TO authenticated;
GRANT ALL ON public.lead_contacts TO service_role;
ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can read all lead contacts"
  ON public.lead_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Employees can insert lead contacts"
  ON public.lead_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Employees can update lead contacts"
  ON public.lead_contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Employees can delete lead contacts"
  ON public.lead_contacts FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS lead_contacts_lead_id_idx ON public.lead_contacts (lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS lead_contacts_one_primary_idx
  ON public.lead_contacts (lead_id) WHERE is_primary;

DROP TRIGGER IF EXISTS trg_lead_contacts_updated ON public.lead_contacts;
CREATE TRIGGER trg_lead_contacts_updated
BEFORE UPDATE ON public.lead_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Migrate existing leads.email into lead_contacts (primary)
INSERT INTO public.lead_contacts (lead_id, email, label, is_primary, created_by)
SELECT id, email, 'Primary', true, created_by
FROM public.leads
WHERE email IS NOT NULL AND btrim(email) <> ''
ON CONFLICT (lead_id, email) DO NOTHING;

-- Drop legacy column
ALTER TABLE public.leads DROP COLUMN IF EXISTS email;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_contacts;
