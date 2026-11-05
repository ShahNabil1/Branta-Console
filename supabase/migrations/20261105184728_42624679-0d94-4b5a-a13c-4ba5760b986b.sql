CREATE OR REPLACE FUNCTION public._company_wallet_credit(_installment uuid, _actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid; _amount numeric; _cfg uuid; _ref text; _n int := 0; _r record; _share numeric;
  _net numeric; _left numeric; _last uuid; _total numeric; _pc numeric;
BEGIN
  SELECT cu.company_id, COALESCE(ii.paid_amount, ii.amount), i.slug, COALESCE(i.total_amount,0), COALESCE(i.project_cost_total,0)
    INTO _company, _amount, _ref, _total, _pc
  FROM invoice_installments ii JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN customers cu ON cu.id = i.customer_id
  WHERE ii.id = _installment AND ii.status = 'paid';
  IF _company IS NULL OR EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cwl:'||_company));
  IF EXISTS (SELECT 1 FROM company_wallet_ledger l WHERE l.source_type='installment' AND l.source_id=_installment
             AND l.entry_type='revenue_credit'
             AND NOT EXISTS (SELECT 1 FROM company_wallet_ledger r WHERE r.reverses_id=l.id)) THEN RETURN 0; END IF;
  SELECT id INTO _cfg FROM company_fund_configs WHERE company_id=_company AND is_active;
  IF _cfg IS NULL THEN RAISE EXCEPTION 'No fund allocation configured for this company'; END IF;
  IF _total > 0 AND _pc > 0 THEN
    _amount := GREATEST(_amount - round(_amount * LEAST(_pc, _total) / _total, 2), 0);
  END IF;
  _left := _amount;
  FOR _r IN SELECT * FROM company_fund_buckets WHERE config_id=_cfg AND mode='fixed' ORDER BY sort LOOP
    _share := LEAST(_r.fixed_amount, _left); _left := _left - _share;
    IF _share > 0 THEN
      INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
      VALUES (_company,_r.key,_r.kind,'in',_share,'revenue_credit','installment',_installment,_ref,'Installment received · '||_r.label,_actor);
      _n := _n + 1;
    END IF;
  END LOOP;
  _net := _left;
  SELECT id INTO _last FROM company_fund_buckets WHERE config_id=_cfg AND mode='percent' AND percent > 0 ORDER BY sort DESC LIMIT 1;
  FOR _r IN SELECT * FROM company_fund_buckets WHERE config_id=_cfg AND mode='percent' AND percent > 0 ORDER BY sort LOOP
    IF _r.id = _last THEN _share := _left; ELSE _share := round(_net * _r.percent / 100, 2); END IF;
    _left := _left - _share;
    IF _share > 0 THEN
      INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
      VALUES (_company,_r.key,_r.kind,'in',_share,'revenue_credit','installment',_installment,_ref,'Installment received · '||_r.label,_actor);
      _n := _n + 1;
    END IF;
  END LOOP;
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public._company_wallet_credit(uuid, uuid) FROM PUBLIC, anon, authenticated;