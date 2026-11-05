DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['assign_employee_code','assign_expense_voucher_no','assign_income_voucher_no','assign_invoice_slug','assign_lead_slug','assign_salary_slip_no','convert_lead_to_customer','recompute_invoice_totals','sync_payouts_on_invoice_status'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;