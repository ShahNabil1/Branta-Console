CREATE OR REPLACE FUNCTION public.sync_company_task_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _cur text; _total int; _review int; _active int; _next text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT status INTO _cur FROM public.company_tasks WHERE id = NEW.task_id;
  IF _cur IS NULL OR _cur = 'done' THEN RETURN NEW; END IF;
  SELECT count(*),
         count(*) FILTER (WHERE status IN ('submitted','approved')),
         count(*) FILTER (WHERE status IN ('doing','revision','submitted','approved'))
    INTO _total, _review, _active
    FROM public.company_task_assignees WHERE task_id = NEW.task_id;
  IF _total = 0 THEN RETURN NEW; END IF;
  _next := CASE WHEN _review = _total THEN 'in_review' WHEN _active > 0 THEN 'doing' ELSE 'todo' END;
  IF _next <> _cur THEN
    UPDATE public.company_tasks SET status = _next, approved_by = NULL, approved_at = NULL WHERE id = NEW.task_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_company_task_status ON public.company_task_assignees;
CREATE TRIGGER trg_sync_company_task_status
AFTER UPDATE OF status ON public.company_task_assignees
FOR EACH ROW EXECUTE FUNCTION public.sync_company_task_status();

UPDATE public.company_tasks t SET status = 'doing'
WHERE t.status = 'todo' AND t.archived_at IS NULL
  AND EXISTS (SELECT 1 FROM public.company_task_assignees a WHERE a.task_id = t.id AND a.status IN ('doing','revision','submitted','approved'));