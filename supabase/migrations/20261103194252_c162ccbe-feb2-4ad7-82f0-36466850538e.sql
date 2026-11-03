CREATE OR REPLACE FUNCTION public.company_wallet_credit_installment(_installment uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid; _amount numeric; _cfg uuid; _ref text; _n int := 0; _r record; _share numeric; _left numeric;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT cu.company_id, COALESCE(ii.paid_amount, ii.amount), i.slug
    INTO _company, _amount, _ref
  FROM invoice_installments ii JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN customers cu ON cu.id = i.customer_id
  WHERE ii.id = _installment AND ii.status = 'paid';
  IF _company IS NULL OR EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN RETURN 0; END IF;
  SELECT id INTO _cfg FROM company_fund_configs WHERE company_id=_company AND is_active;
  IF _cfg IS NULL THEN RAISE EXCEPTION 'No fund allocation configured for this company'; END IF;
  _left := _amount;
  FOR _r IN SELECT * FROM company_fund_buckets WHERE config_id=_cfg ORDER BY (kind='free'), sort LOOP
    IF _r.kind = 'free' THEN _share := _left; ELSE _share := round(_amount * _r.percent / 100, 2); _left := _left - _share; END IF;
    IF _share > 0 THEN
      INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
      VALUES (_company,_r.key,_r.kind,'in',_share,'revenue_credit','installment',_installment,_ref,'Installment received · '||_r.label,auth.uid())
      ON CONFLICT DO NOTHING;
      IF FOUND THEN _n := _n + 1; END IF;
    END IF;
  END LOOP;
  RETURN _n;
END $$;