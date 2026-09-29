-- 1. Purge: finance users (Recycle Bin page) or internal/scheduled (no user) only.
CREATE OR REPLACE FUNCTION public.purge_expired_expenses()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; n int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR r IN SELECT id, voucher_no FROM public.expenses
    WHERE deleted_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= now()
  LOOP
    INSERT INTO public.expense_activity_logs (expense_id, voucher_no, actor_id, action, title, metadata)
    VALUES (NULL, r.voucher_no, NULL, 'purged', 'Permanently deleted automatically after 30 days in Recycle Bin', jsonb_build_object('expense_id', r.id));
    DELETE FROM public.expenses WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;
REVOKE EXECUTE ON FUNCTION public.purge_expired_expenses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_expenses() TO authenticated, service_role;

-- 2. Helper functions: no anonymous execution (all RLS policies using them are TO authenticated).
REVOKE EXECUTE ON FUNCTION public.is_finance_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_lead_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_employee_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_finance_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_lead_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_employee_code() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.retry_installment_allocation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_installment_allocation(uuid, text) FROM PUBLIC, anon;

-- 4. Wallet view: run with the reader's permissions (own payouts, or finance sees all).
ALTER VIEW public.v_wallet_balances SET (security_invoker = true);

-- 7. Orphan receipt finder: only new expense-form uploads under 'exp/', older than threshold, not referenced anywhere.
CREATE OR REPLACE FUNCTION public.orphan_expense_receipts(_older_hours int DEFAULT 24)
RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return query
  select o.name from storage.objects o
  where o.bucket_id='expense-receipts' and o.name like 'exp/%'
    and o.created_at < now() - make_interval(hours => greatest(_older_hours, 6))
    and not exists (select 1 from public.expense_attachments a where a.path=o.name)
    and not exists (select 1 from public.expenses e where e.receipt_url=o.name or e.signed_voucher_url=o.name)
  limit 200;
end $$;
REVOKE EXECUTE ON FUNCTION public.orphan_expense_receipts(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_expense_receipts(int) TO authenticated;

-- Daily scheduled purge (runs internally, no user) so the 30-day rule no longer depends on someone opening the Recycle Bin.
SELECT cron.schedule('purge-expired-expenses-daily', '30 20 * * *', $$select public.purge_expired_expenses()$$);