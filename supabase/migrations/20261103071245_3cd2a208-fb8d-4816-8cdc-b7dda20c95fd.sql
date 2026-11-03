CREATE OR REPLACE FUNCTION public.propagate_holding_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active AND NEW.role = 'super_admin'
     AND EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND is_holding) THEN
    INSERT INTO company_members (company_id, user_id, role, is_active)
    SELECT c.id, NEW.user_id, 'super_admin', true FROM companies c WHERE c.id <> NEW.company_id
    ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'super_admin', is_active = true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_propagate_holding_admin ON public.company_members;
CREATE TRIGGER trg_propagate_holding_admin AFTER INSERT OR UPDATE OF role, is_active ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.propagate_holding_admin();

CREATE OR REPLACE FUNCTION public.company_add_holding_admins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO company_members (company_id, user_id, role, is_active)
  SELECT NEW.id, m.user_id, 'super_admin', true
  FROM company_members m JOIN companies h ON h.id = m.company_id AND h.is_holding
  WHERE m.role = 'super_admin' AND m.is_active AND h.id <> NEW.id
  ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'super_admin', is_active = true;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_company_add_holding_admins ON public.companies;
CREATE TRIGGER trg_company_add_holding_admins AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.company_add_holding_admins();

REVOKE EXECUTE ON FUNCTION public.propagate_holding_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.company_add_holding_admins() FROM PUBLIC, anon, authenticated;

-- backfill existing holding admins
UPDATE public.company_members m SET role = m.role
WHERE m.role = 'super_admin' AND m.is_active
  AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = m.company_id AND c.is_holding);