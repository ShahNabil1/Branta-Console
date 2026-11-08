CREATE OR REPLACE FUNCTION public.assign_lead_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE n bigint; p text; co uuid; holding boolean;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  co := COALESCE(NEW.company_id, public.holding_company_id());
  SELECT is_holding INTO holding FROM public.companies WHERE id = co;
  IF COALESCE(holding, true) THEN
    p := public.company_code_prefix(co, 'lead', 'BTL-');
    LOOP
      n := nextval('public.lead_slug_seq');
      NEW.slug := p || public.code_pad(n, 2);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leads WHERE slug = NEW.slug);
    END LOOP;
    RETURN NEW;
  END IF;
  p := public.company_code_prefix(co, 'lead', 'BTL-');
  PERFORM pg_advisory_xact_lock(hashtext('lead:' || co::text));
  SELECT COALESCE(MAX((substring(slug from length(p) + 1))::bigint), 0) + 1 INTO n
    FROM public.leads WHERE company_id = co AND slug LIKE p || '%' AND substring(slug from length(p) + 1) ~ '^\d+$';
  LOOP
    NEW.slug := p || public.code_pad(n, 2);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leads WHERE slug = NEW.slug);
    n := n + 1;
  END LOOP;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.customers_code_prefix()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p text; co uuid; holding boolean; n bigint;
BEGIN
  co := COALESCE(NEW.company_id, public.holding_company_id());
  SELECT is_holding INTO holding FROM public.companies WHERE id = co;
  IF COALESCE(holding, true) OR NEW.customer_code NOT LIKE 'BTC-%' THEN RETURN NEW; END IF;
  p := public.company_code_prefix(co, 'customer', 'BTC-');
  IF p = 'BTC-' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cust:' || co::text));
  SELECT COALESCE(MAX((substring(customer_code from length(p) + 1))::bigint), 0) + 1 INTO n
    FROM public.customers WHERE company_id = co AND customer_code LIKE p || '%' AND substring(customer_code from length(p) + 1) ~ '^\d+$';
  LOOP
    NEW.customer_code := p || public.code_pad(n, 2);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code = NEW.customer_code);
    n := n + 1;
  END LOOP;
  RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.assign_lead_slug() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.customers_code_prefix() FROM PUBLIC, anon, authenticated;

-- Renumber existing Admakai records from 01 (oldest first)
WITH o AS (
  SELECT l.id, row_number() OVER (ORDER BY l.created_at, l.id) rn, c.code_prefixes->>'lead' p
  FROM public.leads l JOIN public.companies c ON c.id = l.company_id
  WHERE c.slug = 'admakai' AND l.slug LIKE (c.code_prefixes->>'lead') || '%'
)
UPDATE public.leads l SET slug = 'TMP-' || l.id::text FROM o WHERE l.id = o.id;
WITH o AS (
  SELECT l.id, row_number() OVER (ORDER BY l.created_at, l.id) rn, c.code_prefixes->>'lead' p
  FROM public.leads l JOIN public.companies c ON c.id = l.company_id
  WHERE c.slug = 'admakai' AND l.slug LIKE 'TMP-%'
)
UPDATE public.leads l SET slug = o.p || public.code_pad(o.rn, 2) FROM o WHERE l.id = o.id;

WITH o AS (
  SELECT cu.id, row_number() OVER (ORDER BY cu.created_at, cu.id) rn, c.code_prefixes->>'customer' p
  FROM public.customers cu JOIN public.companies c ON c.id = cu.company_id
  WHERE c.slug = 'admakai' AND cu.customer_code LIKE (c.code_prefixes->>'customer') || '%'
)
UPDATE public.customers cu SET customer_code = o.p || public.code_pad(o.rn, 2) FROM o WHERE cu.id = o.id;