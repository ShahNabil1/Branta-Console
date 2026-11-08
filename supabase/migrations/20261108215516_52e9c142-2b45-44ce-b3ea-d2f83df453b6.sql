
CREATE OR REPLACE FUNCTION public.can_manage_company_tasks(_company uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND public.is_active_employee(_user) AND (
    public.has_role(_user,'super_admin') OR public.has_role(_user,'admin')
    OR (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company AND c.is_holding)
        AND (public.has_role(_user,'manager') OR public.has_role(_user,'coo')))
    OR EXISTS (
      SELECT 1 FROM public.company_members m JOIN public.profiles p ON p.id = m.user_id
      JOIN public.companies c ON c.id = m.company_id
      WHERE m.company_id = _company AND m.is_active AND NOT c.is_holding
        AND m.role IN ('super_admin','coo','manager') AND p.user_id = _user)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_company_tasks(_company uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_company_tasks(_company,_user)
    OR (public.is_active_employee(_user) AND public.is_company_member(_company,_user))
$$;

CREATE TABLE public.company_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'todo',
  due_on date,
  tags text[] NOT NULL DEFAULT '{}',
  position double precision NOT NULL DEFAULT extract(epoch from now()),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_tasks_company ON public.company_tasks(company_id, status) WHERE archived_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_tasks TO authenticated;
GRANT ALL ON public.company_tasks TO service_role;
ALTER TABLE public.company_tasks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.company_task_company(_task uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.company_tasks WHERE id = _task
$$;

CREATE OR REPLACE FUNCTION public.validate_company_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.title := btrim(coalesce(NEW.title,''));
  IF length(NEW.title) = 0 OR length(NEW.title) > 200 THEN RAISE EXCEPTION 'Task title is required (max 200 characters).'; END IF;
  IF NEW.priority NOT IN ('low','normal','high','urgent') THEN RAISE EXCEPTION 'Invalid priority.'; END IF;
  IF NEW.status NOT IN ('todo','doing','in_review','done') THEN RAISE EXCEPTION 'Invalid status.'; END IF;
  IF coalesce(array_length(NEW.tags,1),0) > 20 THEN RAISE EXCEPTION 'At most 20 tags.'; END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_projects p WHERE p.id = NEW.project_id AND p.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'The project belongs to another company.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'A task cannot move between companies.'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_company_task BEFORE INSERT OR UPDATE ON public.company_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_company_task();

CREATE POLICY ctk_select ON public.company_tasks FOR SELECT TO authenticated
  USING (public.can_view_company_tasks(company_id, auth.uid()));
CREATE POLICY ctk_insert ON public.company_tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_manage_company_tasks(company_id, auth.uid()));
CREATE POLICY ctk_update ON public.company_tasks FOR UPDATE TO authenticated
  USING (public.can_manage_company_tasks(company_id, auth.uid()))
  WITH CHECK (public.can_manage_company_tasks(company_id, auth.uid()));
CREATE POLICY ctk_delete ON public.company_tasks FOR DELETE TO authenticated
  USING (public.can_manage_company_tasks(company_id, auth.uid()));

CREATE TABLE public.company_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.company_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'todo',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_task_assignees TO authenticated;
GRANT ALL ON public.company_task_assignees TO service_role;
ALTER TABLE public.company_task_assignees ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_company_task_assignee(_task uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_task_assignees a WHERE a.task_id = _task AND a.user_id = _user)
    AND public.is_active_employee(_user)
$$;
CREATE OR REPLACE FUNCTION public.can_manage_company_task(_task uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_company_tasks(public.company_task_company(_task), _user)
$$;
CREATE OR REPLACE FUNCTION public.can_view_company_task(_task uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_view_company_tasks(public.company_task_company(_task), _user)
$$;
CREATE OR REPLACE FUNCTION public.can_work_company_task(_task uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_company_task(_task,_user) OR public.is_company_task_assignee(_task,_user)
$$;

CREATE OR REPLACE FUNCTION public.validate_company_task_assignee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c uuid;
BEGIN
  IF NEW.status NOT IN ('todo','doing','submitted','approved','revision') THEN RAISE EXCEPTION 'Invalid assignee status.'; END IF;
  _c := public.company_task_company(NEW.task_id);
  IF NOT (public.is_company_member(_c, NEW.user_id) OR public.can_manage_company_tasks(_c, NEW.user_id)) THEN
    RAISE EXCEPTION 'Assignee must belong to this company.';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.user_id <> OLD.user_id OR NEW.task_id <> OLD.task_id) THEN RAISE EXCEPTION 'Assignment cannot be moved.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_company_task_assignee BEFORE INSERT OR UPDATE ON public.company_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.validate_company_task_assignee();

CREATE POLICY ctka_select ON public.company_task_assignees FOR SELECT TO authenticated USING (public.can_view_company_task(task_id, auth.uid()));
CREATE POLICY ctka_insert ON public.company_task_assignees FOR INSERT TO authenticated WITH CHECK (public.can_manage_company_task(task_id, auth.uid()));
CREATE POLICY ctka_update ON public.company_task_assignees FOR UPDATE TO authenticated
  USING (public.can_manage_company_task(task_id, auth.uid()) OR user_id = auth.uid())
  WITH CHECK (public.can_manage_company_task(task_id, auth.uid()) OR (user_id = auth.uid() AND status IN ('todo','doing','submitted')));
CREATE POLICY ctka_delete ON public.company_task_assignees FOR DELETE TO authenticated USING (public.can_manage_company_task(task_id, auth.uid()));

CREATE TABLE public.company_task_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.company_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  assignee_id uuid,
  done boolean NOT NULL DEFAULT false,
  done_by uuid,
  done_at timestamptz,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_task_subtasks_task ON public.company_task_subtasks(task_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_task_subtasks TO authenticated;
GRANT ALL ON public.company_task_subtasks TO service_role;
ALTER TABLE public.company_task_subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctks_select ON public.company_task_subtasks FOR SELECT TO authenticated USING (public.can_view_company_task(task_id, auth.uid()));
CREATE POLICY ctks_insert ON public.company_task_subtasks FOR INSERT TO authenticated WITH CHECK (public.can_manage_company_task(task_id, auth.uid()));
CREATE POLICY ctks_update ON public.company_task_subtasks FOR UPDATE TO authenticated
  USING (public.can_work_company_task(task_id, auth.uid())) WITH CHECK (public.can_work_company_task(task_id, auth.uid()));
CREATE POLICY ctks_delete ON public.company_task_subtasks FOR DELETE TO authenticated USING (public.can_manage_company_task(task_id, auth.uid()));

-- Assignees may only tick/untick; everything else on a subtask is manager-only.
CREATE OR REPLACE FUNCTION public.guard_company_task_subtask() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.title := btrim(coalesce(NEW.title,''));
  IF length(NEW.title) = 0 OR length(NEW.title) > 300 THEN RAISE EXCEPTION 'Subtask title is required (max 300 characters).'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.task_id <> OLD.task_id THEN RAISE EXCEPTION 'Subtask cannot move.'; END IF;
    IF NOT public.can_manage_company_task(NEW.task_id, auth.uid()) AND auth.uid() IS NOT NULL
       AND (NEW.title <> OLD.title OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.position <> OLD.position) THEN
      RAISE EXCEPTION 'Only task managers can edit subtasks.';
    END IF;
    IF NEW.done IS DISTINCT FROM OLD.done THEN
      NEW.done_by := CASE WHEN NEW.done THEN auth.uid() END;
      NEW.done_at := CASE WHEN NEW.done THEN now() END;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_company_task_subtask BEFORE INSERT OR UPDATE ON public.company_task_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_task_subtask();

CREATE TABLE public.company_task_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.company_tasks(id) ON DELETE CASCADE,
  title text,
  url text NOT NULL,
  assignee_id uuid,
  position integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_task_assets_task ON public.company_task_assets(task_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_task_assets TO authenticated;
GRANT ALL ON public.company_task_assets TO service_role;
ALTER TABLE public.company_task_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctkx_select ON public.company_task_assets FOR SELECT TO authenticated USING (public.can_view_company_task(task_id, auth.uid()));
CREATE POLICY ctkx_insert ON public.company_task_assets FOR INSERT TO authenticated WITH CHECK (public.can_manage_company_task(task_id, auth.uid()));
CREATE POLICY ctkx_update ON public.company_task_assets FOR UPDATE TO authenticated USING (public.can_manage_company_task(task_id, auth.uid())) WITH CHECK (public.can_manage_company_task(task_id, auth.uid()));
CREATE POLICY ctkx_delete ON public.company_task_assets FOR DELETE TO authenticated USING (public.can_manage_company_task(task_id, auth.uid()));

CREATE TABLE public.company_task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.company_tasks(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.company_task_assets(id) ON DELETE SET NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  link text,
  note text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_task_submissions_task ON public.company_task_submissions(task_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_task_submissions TO authenticated;
GRANT ALL ON public.company_task_submissions TO service_role;
ALTER TABLE public.company_task_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctksub_select ON public.company_task_submissions FOR SELECT TO authenticated USING (public.can_view_company_task(task_id, auth.uid()));
CREATE POLICY ctksub_insert ON public.company_task_submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND public.can_work_company_task(task_id, auth.uid()));
CREATE POLICY ctksub_update ON public.company_task_submissions FOR UPDATE TO authenticated
  USING (public.can_manage_company_task(task_id, auth.uid())) WITH CHECK (public.can_manage_company_task(task_id, auth.uid()));
CREATE POLICY ctksub_delete ON public.company_task_submissions FOR DELETE TO authenticated
  USING (public.can_manage_company_task(task_id, auth.uid()) OR (user_id = auth.uid() AND status = 'pending'));

CREATE OR REPLACE FUNCTION public.validate_company_task_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','revision') THEN RAISE EXCEPTION 'Invalid submission status.'; END IF;
  IF coalesce(btrim(NEW.link),'') = '' AND coalesce(btrim(NEW.note),'') = '' THEN RAISE EXCEPTION 'Add a link or a note to submit.'; END IF;
  IF NEW.asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.company_task_assets a WHERE a.id = NEW.asset_id AND a.task_id = NEW.task_id) THEN
    RAISE EXCEPTION 'Asset belongs to another task.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_company_task_submission BEFORE INSERT OR UPDATE ON public.company_task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_company_task_submission();

CREATE TABLE public.company_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.company_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_task_comments_task ON public.company_task_comments(task_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_task_comments TO authenticated;
GRANT ALL ON public.company_task_comments TO service_role;
ALTER TABLE public.company_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctkc_select ON public.company_task_comments FOR SELECT TO authenticated USING (public.can_view_company_task(task_id, auth.uid()));
CREATE POLICY ctkc_insert ON public.company_task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND length(btrim(body)) BETWEEN 1 AND 4000 AND public.can_work_company_task(task_id, auth.uid()));
CREATE POLICY ctkc_delete ON public.company_task_comments FOR DELETE TO authenticated
  USING (public.can_manage_company_task(task_id, auth.uid()) OR user_id = auth.uid());

CREATE TABLE public.company_task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.company_tasks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_task_activity_task ON public.company_task_activity(task_id, created_at);
GRANT SELECT, INSERT ON public.company_task_activity TO authenticated;
GRANT ALL ON public.company_task_activity TO service_role;
ALTER TABLE public.company_task_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctkact_select ON public.company_task_activity FOR SELECT TO authenticated USING (public.can_view_company_task(task_id, auth.uid()));
CREATE POLICY ctkact_insert ON public.company_task_activity FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.can_work_company_task(task_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.company_task_activity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Task activity is append-only.'; END $$;
CREATE TRIGGER trg_company_task_activity_immutable BEFORE UPDATE ON public.company_task_activity
  FOR EACH ROW EXECUTE FUNCTION public.company_task_activity_immutable();

ALTER PUBLICATION supabase_realtime ADD TABLE public.company_tasks;
