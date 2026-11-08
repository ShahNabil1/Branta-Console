ALTER TABLE public.company_tasks
  ADD COLUMN publish_state text NOT NULL DEFAULT 'live',
  ADD COLUMN scheduled_at timestamptz;
ALTER TABLE public.company_tasks ADD CONSTRAINT company_tasks_publish_state_chk
  CHECK (publish_state IN ('draft','scheduled','live') AND (publish_state <> 'scheduled' OR scheduled_at IS NOT NULL));

-- A task is live when published, or when its schedule time has arrived (exact, no cron needed).
CREATE OR REPLACE FUNCTION public.company_task_is_live(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_tasks t WHERE t.id = _task
    AND (t.publish_state = 'live' OR (t.publish_state = 'scheduled' AND t.scheduled_at <= now())))
$$;

CREATE OR REPLACE FUNCTION public.can_view_company_task(_task uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_company_task(_task,_user)
    OR (public.can_view_company_tasks(public.company_task_company(_task), _user) AND public.company_task_is_live(_task))
$$;

CREATE OR REPLACE FUNCTION public.is_company_task_assignee(_task uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_task_assignees a WHERE a.task_id = _task AND a.user_id = _user)
    AND public.is_active_employee(_user) AND public.company_task_is_live(_task)
$$;

DROP POLICY IF EXISTS ctk_select ON public.company_tasks;
CREATE POLICY ctk_select ON public.company_tasks FOR SELECT TO authenticated
  USING (public.can_manage_company_tasks(company_id, auth.uid())
    OR (public.can_view_company_tasks(company_id, auth.uid())
        AND (publish_state = 'live' OR (publish_state = 'scheduled' AND scheduled_at <= now()))));