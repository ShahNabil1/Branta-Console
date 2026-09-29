CREATE OR REPLACE FUNCTION public.employee_delete_blockers(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; r jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Admin access required'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.invoice_delete_blockers(_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'Finance access required'; END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'Paid installments', nullif((SELECT count(*) FROM invoice_installments WHERE invoice_id = _invoice_id AND status = 'paid'), 0),
    'Active fund allocations', nullif((SELECT count(*) FROM installment_allocations WHERE invoice_id = _invoice_id AND status = 'active'), 0),
    'Reversed fund allocations', nullif((SELECT count(*) FROM installment_allocations WHERE invoice_id = _invoice_id AND status <> 'active'), 0),
    'Requested/paid payouts', nullif((SELECT count(*) FROM invoice_payouts WHERE invoice_id = _invoice_id AND status IN ('requested','paid')), 0),
    'Employee payments', nullif((SELECT count(*) FROM employee_fund_payments WHERE invoice_id = _invoice_id), 0),
    'Linked expenses', nullif((SELECT count(*) FROM expenses WHERE linked_invoice_id = _invoice_id), 0),
    'Income vouchers', nullif((SELECT count(*) FROM income_vouchers WHERE invoice_id = _invoice_id), 0),
    'Fund ledger entries', nullif((SELECT count(*) FROM fund_ledger WHERE invoice_id = _invoice_id), 0)
  ));
END $$;

CREATE OR REPLACE FUNCTION public.archive_customer(_customer_id uuid, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) AND NOT public.has_role(auth.uid(), 'manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM invoices WHERE customer_id = _customer_id)
     AND NOT EXISTS (SELECT 1 FROM client_projects WHERE customer_id = _customer_id)
     AND NOT EXISTS (SELECT 1 FROM client_tasks WHERE customer_id = _customer_id)
     AND NOT EXISTS (SELECT 1 FROM income_vouchers WHERE customer_id = _customer_id)
     AND NOT EXISTS (SELECT 1 FROM installment_allocations WHERE customer_id = _customer_id)
     AND NOT EXISTS (SELECT 1 FROM fund_ledger WHERE customer_id = _customer_id) THEN
    DELETE FROM customers WHERE id = _customer_id;
    RETURN 'deleted';
  END IF;
  UPDATE customers SET archived_at = now(), archived_by = auth.uid(), archive_reason = _reason WHERE id = _customer_id;
  RETURN 'archived';
END $$;

CREATE OR REPLACE FUNCTION public.reactivate_employee(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE profiles SET deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE user_id = _user_id;
  INSERT INTO user_roles(user_id, role) VALUES (_user_id, 'user') ON CONFLICT (user_id, role) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.employee_delete_blockers(uuid), public.invoice_delete_blockers(uuid), public.reactivate_employee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_delete_blockers(uuid), public.invoice_delete_blockers(uuid), public.reactivate_employee(uuid) TO authenticated, service_role;