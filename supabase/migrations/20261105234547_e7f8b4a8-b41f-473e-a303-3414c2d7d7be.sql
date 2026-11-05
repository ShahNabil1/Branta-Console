CREATE OR REPLACE FUNCTION public.company_head_can_remove(_caller uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _caller IS NOT NULL AND _caller <> _target
    AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _target AND role IN ('super_admin','admin','finance'))
    AND EXISTS (SELECT 1 FROM company_members m JOIN profiles p ON p.id = m.user_id JOIN companies c ON c.id = m.company_id
                WHERE p.user_id = _target AND NOT c.is_holding)
    AND NOT EXISTS (SELECT 1 FROM company_members m JOIN profiles p ON p.id = m.user_id JOIN companies c ON c.id = m.company_id
                WHERE p.user_id = _target AND (c.is_holding OR NOT public.can_manage_company(c.id, _caller)))
$$;
REVOKE ALL ON FUNCTION public.company_head_can_remove(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_head_can_remove(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.employee_delete_blockers(_user_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE pid uuid; r jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()) OR public.company_head_can_remove(auth.uid(), _user_id)) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT id INTO pid FROM profiles WHERE user_id = _user_id;
  r := jsonb_strip_nulls(jsonb_build_object(
    'Revenue split entries', nullif((SELECT count(*) FROM invoice_stakeholders WHERE user_id = _user_id), 0),
    'Payouts', nullif((SELECT count(*) FROM invoice_payouts WHERE user_id = _user_id), 0),
    'Employee payments', nullif((SELECT count(*) FROM employee_fund_payments WHERE employee_id IN (_user_id, pid)), 0),
    'Salary slips', nullif((SELECT count(*) FROM salary_slips WHERE user_id = _user_id OR created_by = _user_id), 0),
    'Expenses', nullif((SELECT count(*) FROM expenses WHERE requested_by = _user_id OR created_by = _user_id OR paid_by = _user_id), 0),
    'Withdrawals', nullif((SELECT count(*) FROM withdrawal_requests WHERE user_id = _user_id), 0),
    'Task assignments', nullif((SELECT count(*) FROM client_task_assignees WHERE user_id = _user_id), 0),
    'Tasks created', nullif((SELECT count(*) FROM client_tasks WHERE created_by = _user_id), 0),
    'Projects created', nullif((SELECT count(*) FROM client_projects WHERE created_by = _user_id), 0),
    'Leads', nullif((SELECT count(*) FROM leads WHERE owner_id = _user_id OR created_by = _user_id), 0),
    'Customers', nullif((SELECT count(*) FROM customers WHERE owner_id = _user_id OR created_by = _user_id), 0),
    'Lead activity', nullif((SELECT count(*) FROM lead_activities WHERE actor_id = _user_id), 0),
    'Invoices created', nullif((SELECT count(*) FROM invoices WHERE created_by = _user_id), 0)
  ));
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.deactivate_employee(_user_id uuid, _reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()) OR public.company_head_can_remove(auth.uid(), _user_id)) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot deactivate your own account.'; END IF;
  UPDATE profiles SET deactivated_at = now(), deactivated_by = auth.uid(), deactivation_reason = _reason WHERE user_id = _user_id;
  DELETE FROM user_roles WHERE user_id = _user_id;
  DELETE FROM user_permissions WHERE user_id = _user_id;
END $function$;