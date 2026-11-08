ALTER TABLE public.company_task_submissions
  ADD COLUMN IF NOT EXISTS subtask_id uuid REFERENCES public.company_task_subtasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.validate_company_task_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f jsonb; prefix text;
BEGIN
  IF NEW.status NOT IN ('pending','approved','revision') THEN RAISE EXCEPTION 'Invalid submission status.'; END IF;
  IF jsonb_typeof(NEW.files) <> 'array' OR jsonb_array_length(NEW.files) > 20 THEN RAISE EXCEPTION 'A submission can hold at most 20 files.'; END IF;
  IF coalesce(btrim(NEW.link),'') = '' AND coalesce(btrim(NEW.note),'') = '' AND jsonb_array_length(NEW.files) = 0 THEN
    RAISE EXCEPTION 'Add a file, a link or a note to submit.';
  END IF;
  IF NEW.asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.company_task_assets a WHERE a.id = NEW.asset_id AND a.task_id = NEW.task_id) THEN
    RAISE EXCEPTION 'Asset belongs to another task.';
  END IF;
  IF NEW.subtask_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_task_subtasks s WHERE s.id = NEW.subtask_id AND s.task_id = NEW.task_id
      AND (s.assignee_id IS NULL OR s.assignee_id = NEW.user_id)) THEN
    RAISE EXCEPTION 'You can only submit subtasks assigned to you.';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.files IS DISTINCT FROM OLD.files THEN
    prefix := 'tasks/' || NEW.task_id::text || '/' || NEW.user_id::text || '/';
    FOR f IN SELECT * FROM jsonb_array_elements(NEW.files) LOOP
      IF coalesce(f->>'key','') NOT LIKE prefix || '%' OR coalesce(btrim(f->>'name'),'') = '' THEN
        RAISE EXCEPTION 'Invalid submission file.';
      END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.validate_company_task_submission() FROM PUBLIC, anon, authenticated;