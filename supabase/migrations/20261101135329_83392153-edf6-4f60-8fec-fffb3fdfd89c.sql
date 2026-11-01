-- Helper predicates (SECURITY DEFINER, fixed search_path) -------------------
CREATE OR REPLACE FUNCTION public.is_active_employee(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _user AND p.deactivated_at IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION public.is_ops_viewer(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r
                 WHERE r.user_id = _user AND r.role IN ('super_admin','admin','manager','finance'))
$$;

CREATE OR REPLACE FUNCTION public.can_view_project(_project_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_employee(_user) AND (
    public.is_ops_viewer(_user)
    OR public.has_permission(_user, 'lead_assign')
    OR EXISTS (SELECT 1 FROM public.client_projects p
               LEFT JOIN public.customers c ON c.id = p.customer_id
               WHERE p.id = _project_id
                 AND (p.created_by = _user OR p.assignee_id = _user OR p.client_manager_id = _user OR c.owner_id = _user))
    OR EXISTS (SELECT 1 FROM public.project_members m
               WHERE m.project_id = _project_id AND m.user_id = _user AND m.active)
    OR EXISTS (SELECT 1 FROM public.client_tasks t
               WHERE t.project_id = _project_id AND t.created_by = _user)
    OR EXISTS (SELECT 1 FROM public.client_tasks t
               JOIN public.client_task_assignees a ON a.task_id = t.id
               WHERE t.project_id = _project_id AND a.user_id = _user)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_task(_task_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_employee(_user) AND (
    public.is_ops_viewer(_user)
    OR public.has_permission(_user, 'lead_assign')
    OR EXISTS (SELECT 1 FROM public.client_task_assignees a WHERE a.task_id = _task_id AND a.user_id = _user)
    OR EXISTS (SELECT 1 FROM public.client_tasks t
               LEFT JOIN public.customers c ON c.id = t.customer_id
               WHERE t.id = _task_id
                 AND (t.created_by = _user OR c.owner_id = _user
                      OR (t.project_id IS NOT NULL AND public.can_view_project(t.project_id, _user))))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_customer(_customer_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_employee(_user) AND (
    public.is_ops_viewer(_user)
    OR public.has_permission(_user, 'customer_view_all')
    OR EXISTS (SELECT 1 FROM public.customers c
               WHERE c.id = _customer_id AND (c.owner_id = _user OR c.created_by = _user))
    OR EXISTS (SELECT 1 FROM public.client_projects p
               WHERE p.customer_id = _customer_id AND public.can_view_project(p.id, _user))
    OR EXISTS (SELECT 1 FROM public.client_tasks t
               JOIN public.client_task_assignees a ON a.task_id = t.id
               WHERE t.customer_id = _customer_id AND a.user_id = _user)
  )
$$;

-- Projects / tasks ---------------------------------------------------------
DROP POLICY IF EXISTS cp_select ON public.client_projects;
CREATE POLICY cp_select ON public.client_projects FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR assignee_id = auth.uid() OR client_manager_id = auth.uid()
         OR public.can_view_project(id, auth.uid()));

DROP POLICY IF EXISTS pm_select ON public.project_members;
CREATE POLICY pm_select ON public.project_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_project(project_id, auth.uid()));

DROP POLICY IF EXISTS cpa_select ON public.client_project_activity;
CREATE POLICY cpa_select ON public.client_project_activity FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR public.can_view_project(project_id, auth.uid()));

DROP POLICY IF EXISTS ct_select ON public.client_tasks;
CREATE POLICY ct_select ON public.client_tasks FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.can_view_task(id, auth.uid()));

DROP POLICY IF EXISTS cta_select ON public.client_task_assignees;
CREATE POLICY cta_select ON public.client_task_assignees FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_task(task_id, auth.uid()));

DROP POLICY IF EXISTS cte_select ON public.client_task_events;
CREATE POLICY cte_select ON public.client_task_events FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR public.can_view_task(task_id, auth.uid()));

-- Customers ----------------------------------------------------------------
DROP POLICY IF EXISTS customers_select_authenticated ON public.customers;
CREATE POLICY customers_select_authenticated ON public.customers FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR created_by = auth.uid() OR public.can_view_customer(id, auth.uid()));

-- Profiles: active employees only (self always) ----------------------------
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "Employees can view profiles" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_active_employee(auth.uid()));

-- Notification rules: admins only ------------------------------------------
DROP POLICY IF EXISTS nr_authenticated_read ON public.notification_rules;
CREATE POLICY nr_admin_read ON public.notification_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

-- Integration sync state: admins only (app writes via server) --------------
DROP POLICY IF EXISTS "integration_sync_state write all authed" ON public.integration_sync_state;
DROP POLICY IF EXISTS "integration_sync_state read all authed" ON public.integration_sync_state;
CREATE POLICY iss_admin_read ON public.integration_sync_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

-- Inbox ledger: handler, lead owner, or management -------------------------
DROP POLICY IF EXISTS "Employees can update inbox" ON public.inbox_messages;
DROP POLICY IF EXISTS "Employees can view inbox" ON public.inbox_messages;
CREATE POLICY inbox_select ON public.inbox_messages FOR SELECT TO authenticated
  USING (handled_by = auth.uid()
         OR (lead_id IS NOT NULL AND public.is_lead_owner(lead_id))
         OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
         OR public.is_super_admin(auth.uid()));
CREATE POLICY inbox_update ON public.inbox_messages FOR UPDATE TO authenticated
  USING (handled_by = auth.uid()
         OR (lead_id IS NOT NULL AND public.is_lead_owner(lead_id))
         OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (handled_by = auth.uid()
         OR (lead_id IS NOT NULL AND public.is_lead_owner(lead_id))
         OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
         OR public.is_super_admin(auth.uid()));

-- Invoice line items / project costs: Finance + invoice stakeholders -------
DROP POLICY IF EXISTS "Authenticated can manage invoice line items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Authenticated can view invoice line items" ON public.invoice_line_items;
CREATE POLICY ili_finance_manage ON public.invoice_line_items FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY ili_stakeholder_select ON public.invoice_line_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoice_stakeholders s
                 WHERE s.invoice_id = invoice_line_items.invoice_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read project costs" ON public.invoice_project_costs;
CREATE POLICY ipc_stakeholder_select ON public.invoice_project_costs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoice_stakeholders s
                 WHERE s.invoice_id = invoice_project_costs.invoice_id AND s.user_id = auth.uid()));

-- Invoice PDF / email settings: Finance only -------------------------------
DROP POLICY IF EXISTS ips_read ON public.invoice_pdf_settings;
CREATE POLICY ips_read ON public.invoice_pdf_settings FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));
DROP POLICY IF EXISTS ies_read ON public.invoice_email_settings;
CREATE POLICY ies_read ON public.invoice_email_settings FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));