ALTER TABLE public.client_projects ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.client_project_activity ALTER COLUMN customer_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_project_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category NOT IN ('client','internal') THEN RAISE EXCEPTION 'Invalid project category'; END IF;
  IF NEW.category = 'client' AND NEW.customer_id IS NULL THEN RAISE EXCEPTION 'Client projects need a client'; END IF;
  IF NEW.service_track IS NOT NULL AND NEW.service_track NOT IN ('web_dev','ai_video','ai_automation','social_media','other') THEN
    RAISE EXCEPTION 'Invalid service track'; END IF;
  RETURN NEW;
END $$;