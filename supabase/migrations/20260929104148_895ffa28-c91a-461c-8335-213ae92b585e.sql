CREATE OR REPLACE FUNCTION public.project_earnings(_user uuid)
RETURNS TABLE(payout_id uuid, earned_at timestamptz, client text, project text, project_id uuid, invoice_slug text, installment text, task text, amount numeric, currency text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> _user AND NOT public.is_finance_admin(auth.uid()) AND NOT public.has_role(auth.uid(),'admin') AND NOT public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, coalesce(p.unlocked_at, p.created_at), c.name::text, cp.name::text, i.project_id, i.slug::text,
         coalesce(ii.label, 'Installment '||ii.sequence)::text, t.title::text, p.amount, p.currency, p.status::text
  FROM invoice_payouts p
  LEFT JOIN employee_fund_payments e ON e.invoice_payout_id = p.id
  LEFT JOIN invoices i ON i.id = p.invoice_id
  LEFT JOIN customers c ON c.id = i.customer_id
  LEFT JOIN client_projects cp ON cp.id = i.project_id
  LEFT JOIN invoice_installments ii ON ii.id = p.installment_id
  LEFT JOIN client_tasks t ON t.id = e.task_id
  WHERE p.user_id = _user AND p.source = 'employee_fund'
  ORDER BY 2 DESC LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION public.project_earnings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_earnings(uuid) TO authenticated, service_role;