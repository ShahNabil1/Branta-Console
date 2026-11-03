ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.customers c SET company_id = l.company_id FROM public.leads l WHERE l.id = c.converted_from_lead_id AND c.company_id IS NULL;
UPDATE public.customers SET company_id = public.holding_company_id() WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS customers_company_idx ON public.customers(company_id);
CREATE OR REPLACE FUNCTION public.customers_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.converted_from_lead_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.leads WHERE id = NEW.converted_from_lead_id;
  END IF;
  IF NEW.company_id IS NULL THEN NEW.company_id := public.holding_company_id(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS customers_company ON public.customers;
CREATE TRIGGER customers_company BEFORE INSERT OR UPDATE OF company_id, converted_from_lead_id ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.customers_company();