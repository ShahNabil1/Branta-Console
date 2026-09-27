CREATE TABLE public.client_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  instructions text,
  quantity numeric,
  unit text,
  per_unit_output numeric,
  total_output numeric,
  output_unit text,
  priority text NOT NULL DEFAULT 'medium',
  due_on date,
  status text NOT NULL DEFAULT 'created',
  revision_round integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_tasks TO authenticated;
GRANT ALL ON public.client_tasks TO service_role;
ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.client_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  responsibility text,
  quantity numeric,
  done_qty numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started',
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_task_assignees TO authenticated;
GRANT ALL ON public.client_task_assignees TO service_role;
ALTER TABLE public.client_task_assignees ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.client_tasks(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  actor_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.client_task_events TO authenticated;
GRANT ALL ON public.client_task_events TO service_role;
ALTER TABLE public.client_task_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_client_tasks_customer ON public.client_tasks(customer_id);
CREATE INDEX idx_client_tasks_project ON public.client_tasks(project_id);
CREATE INDEX idx_cta_user ON public.client_task_assignees(user_id);
CREATE INDEX idx_cte_task ON public.client_task_events(task_id, created_at);

CREATE OR REPLACE FUNCTION public.validate_client_task() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('created','assigned','started','in_progress','review','revision_requested','revision_completed','approved','delivered','completed') THEN
    RAISE EXCEPTION 'Invalid task status %', NEW.status;
  END IF;
  IF NEW.priority NOT IN ('low','medium','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority %', NEW.priority;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_client_task BEFORE INSERT OR UPDATE ON public.client_tasks FOR EACH ROW EXECUTE FUNCTION public.validate_client_task();
CREATE TRIGGER trg_client_tasks_updated BEFORE UPDATE ON public.client_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cta_updated BEFORE UPDATE ON public.client_task_assignees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_task_assignee(_task_id uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_task_assignees WHERE task_id = _task_id AND user_id = _user)
$$;
CREATE OR REPLACE FUNCTION public.can_manage_task(_task_id uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_tasks t LEFT JOIN public.customers c ON c.id = t.customer_id
    WHERE t.id = _task_id AND (t.created_by = _user OR c.owner_id = _user
      OR public.has_role(_user,'admin') OR public.has_role(_user,'super_admin') OR public.has_role(_user,'manager')
      OR public.has_permission(_user,'lead_assign'))
  )
$$;

CREATE POLICY ct_select ON public.client_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY ct_insert ON public.client_tasks FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY ct_update ON public.client_tasks FOR UPDATE TO authenticated
  USING (public.can_manage_task(id, auth.uid()) OR public.is_task_assignee(id, auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY cta_select ON public.client_task_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY cta_insert ON public.client_task_assignees FOR INSERT TO authenticated WITH CHECK (public.can_manage_task(task_id, auth.uid()));
CREATE POLICY cta_update ON public.client_task_assignees FOR UPDATE TO authenticated
  USING (public.can_manage_task(task_id, auth.uid()) OR user_id = auth.uid()) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY cta_delete ON public.client_task_assignees FOR DELETE TO authenticated USING (public.can_manage_task(task_id, auth.uid()));

CREATE POLICY cte_select ON public.client_task_events FOR SELECT TO authenticated USING (true);
CREATE POLICY cte_insert ON public.client_task_events FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());