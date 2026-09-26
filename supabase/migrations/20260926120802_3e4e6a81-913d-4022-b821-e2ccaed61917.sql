ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contact_person text, ADD COLUMN IF NOT EXISTS whatsapp text, ADD COLUMN IF NOT EXISTS client_since date NOT NULL DEFAULT current_date;

UPDATE public.customers c SET contact_person = COALESCE(c.contact_person, l.contact_person), whatsapp = COALESCE(c.whatsapp, l.whatsapp), client_since = c.created_at::date
FROM public.leads l WHERE l.id = c.converted_from_lead_id;
UPDATE public.customers SET client_since = created_at::date WHERE converted_from_lead_id IS NULL;

CREATE OR REPLACE FUNCTION public.convert_lead_to_customer()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE primary_email text;
BEGIN
  IF NEW.status = 'converted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'converted') THEN
    SELECT email INTO primary_email FROM public.lead_contacts WHERE lead_id = NEW.id ORDER BY is_primary DESC, created_at ASC LIMIT 1;
    INSERT INTO public.customers (name, role, company, email, phone, source, service, currency, notes, owner_id, converted_from_lead_id, created_by, contact_person, whatsapp, client_since)
    VALUES (NEW.name, NEW.role, NEW.company, primary_email, NEW.phone, NEW.source, NEW.service, COALESCE(NEW.currency, 'BDT'), NEW.notes, NEW.owner_id, NEW.id, NEW.created_by, NEW.contact_person, NEW.whatsapp, current_date)
    ON CONFLICT (converted_from_lead_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;

CREATE TABLE public.client_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  service text,
  status text NOT NULL DEFAULT 'planned',
  starts_on date,
  due_on date,
  budget numeric,
  currency text NOT NULL DEFAULT 'BDT',
  notes text,
  assignee_id uuid,
  archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_projects TO authenticated;
GRANT ALL ON public.client_projects TO service_role;
ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_select ON public.client_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY cp_insert ON public.client_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY cp_update ON public.client_projects FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR assignee_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')
  OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.owner_id = auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_client_projects_customer ON public.client_projects(customer_id);

CREATE OR REPLACE FUNCTION public.validate_client_project_status() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('planned','active','on_hold','completed','cancelled') THEN RAISE EXCEPTION 'Invalid project status %', NEW.status; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_cp_status BEFORE INSERT OR UPDATE ON public.client_projects FOR EACH ROW EXECUTE FUNCTION public.validate_client_project_status();
CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON public.client_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.client_project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  actor_id uuid DEFAULT auth.uid(),
  action text NOT NULL,
  body text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.client_project_activity TO authenticated;
GRANT ALL ON public.client_project_activity TO service_role;
ALTER TABLE public.client_project_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY cpa_select ON public.client_project_activity FOR SELECT TO authenticated USING (true);
CREATE POLICY cpa_insert ON public.client_project_activity FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());
CREATE INDEX idx_cpa_customer ON public.client_project_activity(customer_id, created_at DESC);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL;