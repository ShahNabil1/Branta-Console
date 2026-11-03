CREATE OR REPLACE FUNCTION public.holding_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.companies WHERE is_holding ORDER BY created_at LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.holding_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.holding_company_id() TO authenticated, service_role;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.lead_meetings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.leads SET company_id = public.holding_company_id() WHERE company_id IS NULL;
UPDATE public.lead_meetings m SET company_id = l.company_id FROM public.leads l WHERE l.id = m.lead_id AND m.company_id IS NULL;
UPDATE public.lead_meetings SET company_id = public.holding_company_id() WHERE company_id IS NULL;
UPDATE public.inbox_messages SET company_id = public.holding_company_id() WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS leads_company_idx ON public.leads(company_id);
CREATE INDEX IF NOT EXISTS lead_meetings_company_idx ON public.lead_meetings(company_id);
CREATE INDEX IF NOT EXISTS inbox_messages_company_idx ON public.inbox_messages(company_id);

-- Leads default to the holding company; meetings always inherit their lead's company.
CREATE OR REPLACE FUNCTION public.leads_default_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN NEW.company_id := public.holding_company_id(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leads_default_company ON public.leads;
CREATE TRIGGER leads_default_company BEFORE INSERT OR UPDATE OF company_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_default_company();

CREATE OR REPLACE FUNCTION public.lead_meetings_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM public.leads WHERE id = NEW.lead_id;
  IF NEW.company_id IS NULL THEN NEW.company_id := public.holding_company_id(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lead_meetings_company ON public.lead_meetings;
CREATE TRIGGER lead_meetings_company BEFORE INSERT OR UPDATE OF lead_id, company_id ON public.lead_meetings
FOR EACH ROW EXECUTE FUNCTION public.lead_meetings_company();

CREATE OR REPLACE FUNCTION public.inbox_messages_default_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN NEW.company_id := public.holding_company_id(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inbox_messages_default_company ON public.inbox_messages;
CREATE TRIGGER inbox_messages_default_company BEFORE INSERT ON public.inbox_messages
FOR EACH ROW EXECUTE FUNCTION public.inbox_messages_default_company();

ALTER TABLE public.leads ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.lead_meetings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.inbox_messages ALTER COLUMN company_id SET NOT NULL;

REVOKE EXECUTE ON FUNCTION public.leads_default_company() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lead_meetings_company() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inbox_messages_default_company() FROM PUBLIC, anon, authenticated;