DO $migration$
DECLARE
  target regprocedure;
  original text;
  corrected text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.wallet_statement_v2(uuid)'::regprocedure,
    'public.wallet_transactions(uuid)'::regprocedure,
    'public.employee_fund_project_summary()'::regprocedure,
    'public.project_earnings(uuid)'::regprocedure
  ] LOOP
    original := pg_get_functiondef(target);
    corrected := replace(replace(original, 'cp.name', 'cp.title'), 'cp2.name', 'cp2.title');
    IF corrected <> original THEN
      EXECUTE corrected;
    END IF;
  END LOOP;
END;
$migration$;