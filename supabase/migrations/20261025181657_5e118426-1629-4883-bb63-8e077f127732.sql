ALTER TABLE public.leads ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.customers ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS leads_insert_authenticated ON public.leads;
CREATE POLICY leads_insert_authenticated ON public.leads FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS customers_insert_authenticated ON public.customers;
CREATE POLICY customers_insert_authenticated ON public.customers FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS cp_insert ON public.client_projects;
CREATE POLICY cp_insert ON public.client_projects FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS cp_update ON public.client_projects;
CREATE POLICY cp_update ON public.client_projects FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()) OR (assignee_id = auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = client_projects.customer_id AND c.owner_id = auth.uid())
    OR can_manage_project(id, auth.uid()))
  WITH CHECK ((created_by = auth.uid()) OR (assignee_id = auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = client_projects.customer_id AND c.owner_id = auth.uid())
    OR can_manage_project(id, auth.uid()));

DROP POLICY IF EXISTS ct_update ON public.client_tasks;
CREATE POLICY ct_update ON public.client_tasks FOR UPDATE TO authenticated
  USING (can_manage_task(id, auth.uid()) OR is_task_assignee(id, auth.uid()))
  WITH CHECK (can_manage_task(id, auth.uid()) OR is_task_assignee(id, auth.uid()));

DROP POLICY IF EXISTS cta_update ON public.client_task_assignees;
CREATE POLICY cta_update ON public.client_task_assignees FOR UPDATE TO authenticated
  USING (can_manage_task(task_id, auth.uid()) OR user_id = auth.uid())
  WITH CHECK (can_manage_task(task_id, auth.uid()) OR user_id = auth.uid());

-- Assignees (non-managers) may update their own row but never move it to another task or user.
CREATE OR REPLACE FUNCTION public.cta_guard_reassign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.task_id IS DISTINCT FROM OLD.task_id OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND auth.uid() IS NOT NULL
     AND NOT (public.can_manage_task(OLD.task_id, auth.uid()) AND public.can_manage_task(NEW.task_id, auth.uid()))
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only task managers can reassign work' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cta_guard_reassign ON public.client_task_assignees;
CREATE TRIGGER trg_cta_guard_reassign BEFORE UPDATE ON public.client_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.cta_guard_reassign();