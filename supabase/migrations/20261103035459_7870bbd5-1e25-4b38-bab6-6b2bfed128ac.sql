ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS brand_kit jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS code_prefixes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.company_code_prefix(_company uuid, _kind text, _fallback text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(NULLIF((SELECT code_prefixes->>_kind FROM public.companies
    WHERE id = COALESCE(_company, public.holding_company_id())), ''), _fallback)
$$;
REVOKE EXECUTE ON FUNCTION public.company_code_prefix(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_lead_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE n bigint; p text;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    p := public.company_code_prefix(NEW.company_id, 'lead', 'BTL-');
    LOOP
      n := nextval('public.lead_slug_seq');
      NEW.slug := p || public.code_pad(n, 2);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leads WHERE slug = NEW.slug);
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.customers_code_prefix()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p text;
BEGIN
  IF NEW.customer_code LIKE 'BTC-%' THEN
    p := public.company_code_prefix(NEW.company_id, 'customer', 'BTC-');
    IF p <> 'BTC-' THEN
      NEW.customer_code := p || substring(NEW.customer_code from 5);
    END IF;
  END IF;
  RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.customers_code_prefix() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customers_zcode_prefix ON public.customers;
CREATE TRIGGER customers_zcode_prefix BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_code_prefix();