CREATE OR REPLACE FUNCTION public.wallet_transactions(_user uuid DEFAULT NULL)
RETURNS TABLE(txn_id text, user_id uuid, occurred_at timestamptz, description text, client text, project text, project_id uuid,
  invoice_slug text, installment text, task text, txn_type text, source text, credit numeric, debit numeric, pending numeric,
  status text, reference text, currency text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (_user IS NULL OR _user <> auth.uid()) AND NOT public.is_finance_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT 'PO-'||p.id::text, p.user_id, coalesce(p.unlocked_at, p.created_at),
    coalesce(e.description, p.notes, CASE p.source WHEN 'employee_fund' THEN 'Project earning' WHEN 'invoice' THEN 'Invoice payout ('||replace(p.role::text,'_',' ')||')' ELSE initcap(coalesce(p.kind,'manual'))||' credit' END)::text,
    c.name::text, cp.name::text, i.project_id, i.slug::text,
    CASE WHEN ii.id IS NULL THEN NULL ELSE coalesce(ii.label,'Installment '||ii.sequence) END::text, t.title::text,
    CASE p.source WHEN 'employee_fund' THEN 'Project Earning' WHEN 'invoice' THEN 'Project Earning'
      ELSE initcap(coalesce(p.kind,'adjustment')) END::text,
    CASE p.source WHEN 'employee_fund' THEN 'Employee Fund Payment' WHEN 'invoice' THEN 'Legacy Payout'
      ELSE initcap(coalesce(p.kind,'manual')) END::text,
    CASE WHEN p.status IN ('available','requested','paid') THEN p.amount ELSE 0 END,
    0::numeric,
    CASE WHEN p.status = 'locked' THEN p.amount ELSE 0 END,
    CASE p.status::text WHEN 'locked' THEN 'Pending' WHEN 'available' THEN 'Available' WHEN 'requested' THEN 'Requested' WHEN 'paid' THEN 'Withdrawn' ELSE initcap(p.status::text) END,
    coalesce(e.transaction_reference, 'PO-'||left(p.id::text,8))::text, p.currency
  FROM invoice_payouts p
  LEFT JOIN employee_fund_payments e ON e.invoice_payout_id = p.id
  LEFT JOIN invoices i ON i.id = p.invoice_id
  LEFT JOIN customers c ON c.id = i.customer_id
  LEFT JOIN client_projects cp ON cp.id = coalesce(i.project_id, e.project_id)
  LEFT JOIN invoice_installments ii ON ii.id = p.installment_id
  LEFT JOIN client_tasks t ON t.id = e.task_id
  WHERE p.role IS DISTINCT FROM 'company' AND p.status <> 'cancelled'
    AND (_user IS NULL OR p.user_id = _user)
  UNION ALL
  SELECT 'EFP-'||e.id::text, pr.user_id, e.created_at,
    coalesce(e.description, 'Employee Fund payment (awaiting payment)')::text,
    c.name::text, cp.name::text, coalesce(e.project_id, i.project_id), i.slug::text, NULL::text, t.title::text,
    CASE e.payment_type WHEN 'project_payment' THEN 'Project Earning' ELSE initcap(replace(e.payment_type,'_',' ')) END::text,
    'Employee Fund Payment'::text, 0::numeric, 0::numeric, e.amount,
    ('Committed · '||initcap(e.status))::text, coalesce(e.transaction_reference, 'EFP-'||left(e.id::text,8))::text, 'BDT'::text
  FROM employee_fund_payments e
  JOIN profiles pr ON pr.id = e.employee_id OR pr.user_id = e.employee_id
  LEFT JOIN invoices i ON i.id = e.invoice_id
  LEFT JOIN customers c ON c.id = i.customer_id
  LEFT JOIN client_projects cp ON cp.id = coalesce(e.project_id, i.project_id)
  LEFT JOIN client_tasks t ON t.id = e.task_id
  WHERE e.status IN ('approved','committed') AND e.invoice_payout_id IS NULL AND pr.user_id IS NOT NULL
    AND (_user IS NULL OR pr.user_id = _user)
  UNION ALL
  SELECT 'WD-'||w.id::text, w.user_id, coalesce(w.paid_at, w.requested_at), 'Withdrawal'::text,
    NULL,NULL,NULL,NULL,NULL,NULL,'Withdrawal'::text,'Withdrawal'::text, 0::numeric, w.amount, 0::numeric,
    initcap(w.status::text), coalesce(w.transfer_ref, 'WD-'||left(w.id::text,8))::text, w.currency
  FROM withdrawal_requests w
  WHERE w.status IN ('pending','approved','paid') AND (_user IS NULL OR w.user_id = _user)
  ORDER BY 3, 1
  LIMIT 5000;
END $$;

CREATE OR REPLACE FUNCTION public.employee_fund_project_summary()
RETURNS TABLE(project_id uuid, project text, client text, allocated numeric, assigned numeric, committed numeric, paid numeric, withdrawn numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH alloc AS (
    SELECT a.project_id pid, sum(it.amount) amt FROM installment_allocations a
    JOIN installment_allocation_items it ON it.allocation_id = a.id
    JOIN finance_funds f ON f.id = it.fund_id AND f.code = 'employee'
    WHERE a.reversed_at IS NULL AND coalesce(a.status,'') NOT IN ('reversed','failed')
    GROUP BY 1),
  efp AS (
    SELECT coalesce(e.project_id, i.project_id) pid,
      sum(e.amount) FILTER (WHERE e.status <> 'cancelled') asg,
      sum(e.amount) FILTER (WHERE e.status IN ('approved','committed')) com,
      sum(e.amount) FILTER (WHERE e.status = 'paid') pd,
      sum(e.amount) FILTER (WHERE e.status = 'paid' AND po.status = 'paid') wd
    FROM employee_fund_payments e LEFT JOIN invoices i ON i.id = e.invoice_id
    LEFT JOIN invoice_payouts po ON po.id = e.invoice_payout_id
    WHERE e.payment_type = 'project_payment' GROUP BY 1)
  SELECT coalesce(alloc.pid, efp.pid), cp.name::text, c.name::text,
    coalesce(alloc.amt,0), coalesce(efp.asg,0), coalesce(efp.com,0), coalesce(efp.pd,0), coalesce(efp.wd,0)
  FROM alloc FULL JOIN efp ON efp.pid = alloc.pid
  LEFT JOIN client_projects cp ON cp.id = coalesce(alloc.pid, efp.pid)
  LEFT JOIN customers c ON c.id = cp.customer_id;
END $$;

REVOKE ALL ON FUNCTION public.wallet_transactions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employee_fund_project_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_transactions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_fund_project_summary() TO authenticated, service_role;