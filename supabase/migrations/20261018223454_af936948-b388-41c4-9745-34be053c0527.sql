ALTER TABLE public.client_tasks ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.client_task_events ALTER COLUMN customer_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_task_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'A task needs a client or a project';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_tasks_validate_owner BEFORE INSERT OR UPDATE ON public.client_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_task_owner();