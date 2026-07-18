
CREATE SEQUENCE IF NOT EXISTS public.customer_code_seq START 1;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text UNIQUE NOT NULL DEFAULT ('C-' || lpad(nextval('public.customer_code_seq')::text, 2, '0')),
  name text NOT NULL,
  role text,
  company text,
  email text,
  phone text,
  source text,
  service text,
  currency text NOT NULL DEFAULT 'BDT' CHECK (currency IN ('BDT','USD')),
  notes text,
  owner_id uuid,
  converted_from_lead_id uuid UNIQUE REFERENCES public.leads(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT USAGE ON SEQUENCE public.customer_code_seq TO authenticated, service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_authenticated" ON public.customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "customers_insert_authenticated" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "customers_update_owner_or_admin" ON public.customers
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "customers_delete_admin" ON public.customers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-convert lead → customer when status changes to 'converted'
CREATE OR REPLACE FUNCTION public.convert_lead_to_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_email text;
BEGIN
  IF NEW.status = 'converted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'converted') THEN
    SELECT email INTO primary_email
      FROM public.lead_contacts
     WHERE lead_id = NEW.id
     ORDER BY is_primary DESC, created_at ASC
     LIMIT 1;

    INSERT INTO public.customers (
      name, role, company, email, phone, source, service, currency, notes,
      owner_id, converted_from_lead_id, created_by
    ) VALUES (
      NEW.name, NEW.role, NEW.company, primary_email, NEW.phone, NEW.source, NEW.service,
      COALESCE(NEW.currency, 'BDT'), NEW.notes, NEW.owner_id, NEW.id, NEW.created_by
    )
    ON CONFLICT (converted_from_lead_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_convert_to_customer
  AFTER INSERT OR UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.convert_lead_to_customer();

-- Backfill any existing converted leads
INSERT INTO public.customers (name, role, company, email, phone, source, service, currency, notes, owner_id, converted_from_lead_id, created_by)
SELECT l.name, l.role, l.company,
  (SELECT email FROM public.lead_contacts WHERE lead_id = l.id ORDER BY is_primary DESC, created_at ASC LIMIT 1),
  l.phone, l.source, l.service, COALESCE(l.currency,'BDT'), l.notes, l.owner_id, l.id, l.created_by
FROM public.leads l
WHERE l.status = 'converted'
ON CONFLICT (converted_from_lead_id) DO NOTHING;
