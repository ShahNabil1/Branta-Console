-- Invoices no longer auto-allocate paid installments into funds (Branta fund_ledger or company wallets).
-- Fund settings remain; past allocation history is untouched. Un-paying an installment still reverses any earlier credit.
CREATE OR REPLACE FUNCTION public.trg_installment_paid_allocate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if tg_op='UPDATE' and old.status::text='paid' and new.status::text <> 'paid' then
    perform public._company_wallet_reverse_installment(new.id, 'Installment no longer paid', auth.uid());
  end if;
  return new;
end $function$;

-- Fund Allocation is no longer a prerequisite for creating invoices/expenses.
CREATE OR REPLACE FUNCTION public.company_setup_missing(_company uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN c.id IS NULL OR c.is_holding THEN ARRAY[]::text[] ELSE
    ARRAY(SELECT k FROM unnest(ARRAY['lead','customer','invoice','expense']) k
          WHERE COALESCE(c.code_prefixes->>k, '') = '')
  END
  FROM (SELECT 1) one LEFT JOIN companies c ON c.id = _company;
$$;
