CREATE OR REPLACE FUNCTION public.materialize_employee_plan_for(_alloc uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; inv record; pool numeric; emp_pct numeric; expected numeric; p record; amt numeric; used numeric; n int := 0;
BEGIN
  SELECT * INTO a FROM installment_allocations WHERE id = _alloc FOR UPDATE;
  IF NOT FOUND OR a.status <> 'active' THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM invoice_employee_plans WHERE invoice_id = a.invoice_id) THEN RETURN 0; END IF;
  SELECT * INTO inv FROM invoices WHERE id = a.invoice_id;
  SELECT coalesce(sum(it.amount),0) INTO pool FROM installment_allocation_items it JOIN finance_funds f ON f.id=it.fund_id WHERE it.allocation_id=a.id AND f.code='employee';
  IF pool <= 0 THEN RETURN 0; END IF;
  SELECT coalesce(max(vi.percent),0) INTO emp_pct FROM fund_allocation_version_items vi JOIN finance_funds f ON f.id=vi.fund_id WHERE vi.version_id=a.version_id AND f.code='employee';
  expected := greatest(coalesce(inv.total_amount,0) - coalesce(inv.project_cost_total,0), 0) * emp_pct / 100;
  IF expected <= 0 THEN RETURN 0; END IF;
  SELECT coalesce(sum(amount),0) INTO used FROM employee_fund_payments WHERE allocation_id=a.id AND status<>'cancelled';
  FOR p IN SELECT * FROM invoice_employee_plans WHERE invoice_id=a.invoice_id ORDER BY sequence LOOP
    IF EXISTS (SELECT 1 FROM employee_fund_payments WHERE allocation_id=a.id AND plan_id=p.id AND status<>'cancelled') THEN CONTINUE; END IF;
    amt := least(round(pool * p.planned_amount / expected, 2), round(pool - used, 2));
    IF amt IS NULL OR amt <= 0 THEN CONTINUE; END IF;
    INSERT INTO employee_fund_payments(employee_id,payment_type,amount,project_id,invoice_id,task_id,allocation_id,plan_id,description,notes,status,created_by)
    VALUES (p.employee_id,'project_payment',amt,a.project_id,a.invoice_id,p.task_id,a.id,p.id,
            'Project earning · '||coalesce(inv.slug,'')||' (from invoice plan)', p.note, 'draft', coalesce(a.created_by, p.created_by));
    used := used + amt; n := n + 1;
  END LOOP;
  IF n > 0 THEN
    INSERT INTO fund_audit_logs(user_id,action,record_type,record_id,next) VALUES (a.created_by,'employee_plan_materialized','installment_allocation',a.id,jsonb_build_object('pool',pool,'expected_pool',expected,'rows',n));
  END IF;
  RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.materialize_employee_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM public.materialize_employee_plan_for(NEW.id); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.materialize_employee_plan_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_employee_plan_for(uuid) TO service_role;