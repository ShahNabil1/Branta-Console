CREATE OR REPLACE FUNCTION public.assign_lead_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n int;
  gap int;
  max_used int;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    -- Find the smallest positive integer not currently used as BTL-XX
    SELECT MIN(t.n) INTO gap
    FROM generate_series(1, COALESCE((
      SELECT MAX((substring(slug from 'BTL-(\d+)'))::int)
      FROM public.leads
      WHERE slug ~ '^BTL-\d+$'
    ), 0) + 1) AS t(n)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.leads
      WHERE slug = 'BTL-' || lpad(t.n::text, 2, '0')
    );

    n := COALESCE(gap, 1);
    NEW.slug := 'BTL-' || lpad(n::text, 2, '0');

    -- Keep sequence ahead of max used code so future fallbacks stay unique
    SELECT COALESCE(MAX((substring(slug from 'BTL-(\d+)'))::int), 0)
    INTO max_used FROM public.leads WHERE slug ~ '^BTL-\d+$';
    PERFORM setval('public.lead_slug_seq', GREATEST(max_used, n));
  END IF;
  RETURN NEW;
END;
$function$;