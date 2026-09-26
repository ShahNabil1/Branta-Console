ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS requirement text,
  ADD COLUMN IF NOT EXISTS budget numeric,
  ADD COLUMN IF NOT EXISTS timeline text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS created_by_code text;

CREATE INDEX IF NOT EXISTS leads_owner_followup_idx ON public.leads(owner_id, next_follow_up_at);

CREATE OR REPLACE FUNCTION public.validate_lead_priority() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.priority NOT IN ('low','medium','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority %', NEW.priority;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_lead_priority ON public.leads;
CREATE TRIGGER trg_validate_lead_priority BEFORE INSERT OR UPDATE OF priority ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.validate_lead_priority();

CREATE OR REPLACE FUNCTION public.stamp_lead_creator() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    IF NEW.owner_id IS NULL THEN NEW.owner_id := NEW.created_by; END IF;
    SELECT full_name, employee_code INTO p FROM public.profiles WHERE user_id = NEW.created_by LIMIT 1;
    NEW.created_by_name := COALESCE(NEW.created_by_name, p.full_name);
    NEW.created_by_code := COALESCE(NEW.created_by_code, p.employee_code);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stamp_lead_creator ON public.leads;
CREATE TRIGGER trg_stamp_lead_creator BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.stamp_lead_creator();