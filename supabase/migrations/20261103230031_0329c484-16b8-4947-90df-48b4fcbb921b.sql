ALTER TABLE public.client_projects ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.client_tasks ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
CREATE INDEX IF NOT EXISTS client_projects_company_idx ON public.client_projects(company_id);
CREATE INDEX IF NOT EXISTS client_tasks_company_idx ON public.client_tasks(company_id);

CREATE OR REPLACE FUNCTION public.client_projects_set_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.customers WHERE id = NEW.customer_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    SELECT id INTO NEW.company_id FROM public.companies WHERE is_holding LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_client_projects_set_company ON public.client_projects;
CREATE TRIGGER trg_client_projects_set_company BEFORE INSERT OR UPDATE OF customer_id, company_id
  ON public.client_projects FOR EACH ROW EXECUTE FUNCTION public.client_projects_set_company();

CREATE OR REPLACE FUNCTION public.client_tasks_set_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.client_projects WHERE id = NEW.project_id;
  ELSIF NEW.customer_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.customers WHERE id = NEW.customer_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    SELECT id INTO NEW.company_id FROM public.companies WHERE is_holding LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_client_tasks_set_company ON public.client_tasks;
CREATE TRIGGER trg_client_tasks_set_company BEFORE INSERT OR UPDATE OF project_id, customer_id, company_id
  ON public.client_tasks FOR EACH ROW EXECUTE FUNCTION public.client_tasks_set_company();
REVOKE EXECUTE ON FUNCTION public.client_projects_set_company() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.client_tasks_set_company() FROM PUBLIC, anon, authenticated;

UPDATE public.client_projects p SET company_id = COALESCE((SELECT company_id FROM public.customers c WHERE c.id = p.customer_id), (SELECT id FROM public.companies WHERE is_holding LIMIT 1)) WHERE company_id IS NULL;
UPDATE public.client_tasks t SET company_id = COALESCE((SELECT company_id FROM public.client_projects p WHERE p.id = t.project_id), (SELECT company_id FROM public.customers c WHERE c.id = t.customer_id), (SELECT id FROM public.companies WHERE is_holding LIMIT 1)) WHERE company_id IS NULL;

DROP POLICY IF EXISTS ceo_manage_client_projects ON public.client_projects;
CREATE POLICY ceo_manage_client_projects ON public.client_projects FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()))
  WITH CHECK (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()));
DROP POLICY IF EXISTS ceo_manage_client_tasks ON public.client_tasks;
CREATE POLICY ceo_manage_client_tasks ON public.client_tasks FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()))
  WITH CHECK (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()));