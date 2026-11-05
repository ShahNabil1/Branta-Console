DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.purge_expired_expenses()',
    'public.generate_employee_code()',
    'public.company_wallet_credit_installment(uuid)',
    'public.company_wallet_reverse(uuid, text)',
    'public.company_loan_cancel(uuid)',
    'public.allocate_installment(uuid, uuid, text)',
    'public.historical_allocate(uuid, uuid, jsonb, text, uuid)',
    'public.save_company_deduction_config(uuid, jsonb, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;