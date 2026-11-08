ALTER TABLE public.company_task_subtasks ADD COLUMN IF NOT EXISTS description text;
CREATE OR REPLACE FUNCTION public.guard_company_task_subtask() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.title := btrim(coalesce(NEW.title,''));
  IF length(NEW.title) = 0 OR length(NEW.title) > 300 THEN RAISE EXCEPTION 'Subtask title is required (max 300 characters).'; END IF;
  NEW.description := nullif(btrim(coalesce(NEW.description,'')),'');
  IF length(NEW.description) > 2000 THEN RAISE EXCEPTION 'Subtask description is too long (max 2000 characters).'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.task_id <> OLD.task_id THEN RAISE EXCEPTION 'Subtask cannot move.'; END IF;
    IF NOT public.can_manage_company_task(NEW.task_id, auth.uid()) AND auth.uid() IS NOT NULL
       AND (NEW.title <> OLD.title OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.position <> OLD.position OR NEW.description IS DISTINCT FROM OLD.description) THEN
      RAISE EXCEPTION 'Only task managers can edit subtasks.';
    END IF;
    IF NEW.done IS DISTINCT FROM OLD.done THEN
      NEW.done_by := CASE WHEN NEW.done THEN auth.uid() END;
      NEW.done_at := CASE WHEN NEW.done THEN now() END;
    END IF;
  END IF;
  RETURN NEW;
END $$;