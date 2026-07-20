-- Change lead slug format from BT-XX to BTL-XX and backfill all existing rows

CREATE OR REPLACE FUNCTION public.assign_lead_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    n := nextval('public.lead_slug_seq');
    NEW.slug := 'BTL-' || lpad(n::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Rewrite every existing slug to the BTL- prefix, preserving the numeric part.
UPDATE public.leads
SET slug = 'BTL-' || lpad(
  regexp_replace(slug, '^[A-Za-z]+-?', '')::int::text,
  2, '0'
)
WHERE slug !~ '^BTL-';
