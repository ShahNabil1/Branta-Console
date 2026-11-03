CREATE OR REPLACE FUNCTION public.company_setup_missing(_company uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN c.id IS NULL OR c.is_holding THEN ARRAY[]::text[] ELSE
    ARRAY(SELECT k FROM unnest(ARRAY['lead','customer','invoice','expense']) k
          WHERE COALESCE(c.code_prefixes->>k, '') = '')
    || CASE WHEN EXISTS (SELECT 1 FROM company_fund_configs f WHERE f.company_id = c.id AND f.is_active)
            THEN ARRAY[]::text[] ELSE ARRAY['fund_allocation'] END
  END
  FROM (SELECT 1) one LEFT JOIN companies c ON c.id = _company;
$$;
REVOKE EXECUTE ON FUNCTION public.company_setup_missing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_setup_missing(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.company_gate_check(_company uuid, _kind text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m text[];
BEGIN
  IF _company IS NULL THEN RETURN; END IF;
  m := public.company_setup_missing(_company);
  IF _kind = ANY(m) THEN
    RAISE EXCEPTION 'COMPANY_SETUP_REQUIRED: set the % code prefix for this company first', _kind USING ERRCODE = 'P0001';
  END IF;
  IF _kind IN ('invoice','expense') AND 'fund_allocation' = ANY(m) THEN
    RAISE EXCEPTION 'COMPANY_SETUP_REQUIRED: set up Fund Allocation for this company first' USING ERRCODE = 'P0001';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.company_gate_check(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.company_gate_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE co uuid;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    SELECT company_id INTO co FROM customers WHERE id = NEW.customer_id;
  ELSE
    co := NEW.company_id;
  END IF;
  PERFORM public.company_gate_check(co, TG_ARGV[0]);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.company_gate_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzz_company_gate ON public.leads;
CREATE TRIGGER zzz_company_gate BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.company_gate_trigger('lead');
DROP TRIGGER IF EXISTS zzz_company_gate ON public.customers;
CREATE TRIGGER zzz_company_gate BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.company_gate_trigger('customer');
DROP TRIGGER IF EXISTS zzz_company_gate ON public.invoices;
CREATE TRIGGER zzz_company_gate BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.company_gate_trigger('invoice');
DROP TRIGGER IF EXISTS zzz_company_gate ON public.expenses;
CREATE TRIGGER zzz_company_gate BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.company_gate_trigger('expense');