DROP POLICY IF EXISTS cp_update ON public.client_projects;
CREATE POLICY cp_update ON public.client_projects FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR assignee_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')
  OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.owner_id = auth.uid())
  OR public.can_manage_project(id, auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL);