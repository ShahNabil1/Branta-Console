ALTER TABLE public.company_fund_buckets ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'percent';
ALTER TABLE public.company_fund_buckets ADD COLUMN IF NOT EXISTS fixed_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.company_fund_buckets DROP CONSTRAINT IF EXISTS company_fund_buckets_mode_check;
ALTER TABLE public.company_fund_buckets ADD CONSTRAINT company_fund_buckets_mode_check CHECK (mode IN ('percent','fixed'));
ALTER TABLE public.company_fund_buckets DROP CONSTRAINT IF EXISTS company_fund_buckets_fixed_check;
ALTER TABLE public.company_fund_buckets ADD CONSTRAINT company_fund_buckets_fixed_check CHECK (fixed_amount >= 0);
ALTER TABLE public.company_fund_buckets DROP CONSTRAINT IF EXISTS company_fund_buckets_kind_check;

CREATE OR REPLACE FUNCTION public.save_company_fund_config(_company uuid, _buckets jsonb, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _v int; _total numeric; _b jsonb; _i int := 0; _mode text;
BEGIN
  IF NOT (public.is_finance_admin(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only finance or group admins can change fund allocation'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN
    RAISE EXCEPTION 'Branta Tech uses the group fund allocation'; END IF;
  IF jsonb_typeof(_buckets) <> 'array' OR jsonb_array_length(_buckets) = 0 THEN
    RAISE EXCEPTION 'At least one fund is required'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_buckets) b WHERE COALESCE(trim(b->>'label'),'') = '') THEN
    RAISE EXCEPTION 'Every fund needs a name'; END IF;
  IF EXISTS (SELECT lower(trim(b->>'label')) FROM jsonb_array_elements(_buckets) b GROUP BY 1 HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Fund names must be unique'; END IF;
  SELECT COALESCE(SUM((b->>'percent')::numeric),0) INTO _total FROM jsonb_array_elements(_buckets) b WHERE COALESCE(b->>'mode','percent')='percent';
  IF _total <> 100 THEN RAISE EXCEPTION 'Percentage funds must total 100%% (now %)', _total; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cfc:'||_company));
  SELECT COALESCE(MAX(version),0)+1 INTO _v FROM company_fund_configs WHERE company_id=_company;
  UPDATE company_fund_configs SET is_active=false WHERE company_id=_company AND is_active;
  INSERT INTO company_fund_configs(company_id, version, note, created_by)
    VALUES (_company, _v, _note, auth.uid()) RETURNING id INTO _id;
  FOR _b IN SELECT * FROM jsonb_array_elements(_buckets) LOOP
    _mode := COALESCE(_b->>'mode','percent');
    INSERT INTO company_fund_buckets(config_id, key, label, kind, mode, percent, fixed_amount, sort)
    VALUES (_id, _b->>'key', trim(_b->>'label'), 'other', _mode,
      CASE WHEN _mode='percent' THEN (_b->>'percent')::numeric ELSE 0 END,
      CASE WHEN _mode='fixed' THEN COALESCE((_b->>'fixed_amount')::numeric,0) ELSE 0 END, _i);
    _i := _i + 1;
  END LOOP;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.company_wallet_credit_installment(_installment uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid; _amount numeric; _cfg uuid; _ref text; _n int := 0; _r record; _share numeric;
  _net numeric; _left numeric; _last uuid;
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
  PERFORM pg_advisory_xact_lock(hashtext('cwl:'||_company));
  _left := _amount;
  -- fixed amounts first, in order, capped at what is left
  FOR _r IN SELECT * FROM company_fund_buckets WHERE config_id=_cfg AND mode='fixed' ORDER BY sort LOOP
    _share := LEAST(_r.fixed_amount, _left);
    _left := _left - _share;
    IF _share > 0 THEN
      INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
      VALUES (_company,_r.key,_r.kind,'in',_share,'revenue_credit','installment',_installment,_ref,'Installment received · '||_r.label,auth.uid())
      ON CONFLICT DO NOTHING;
      IF FOUND THEN _n := _n + 1; END IF;
    END IF;
  END LOOP;
  _net := _left;
  SELECT id INTO _last FROM company_fund_buckets WHERE config_id=_cfg AND mode='percent' AND percent > 0 ORDER BY sort DESC LIMIT 1;
  FOR _r IN SELECT * FROM company_fund_buckets WHERE config_id=_cfg AND mode='percent' AND percent > 0 ORDER BY sort LOOP
    IF _r.id = _last THEN _share := _left; ELSE _share := round(_net * _r.percent / 100, 2); END IF;
    _left := _left - _share;
    IF _share > 0 THEN
      INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
      VALUES (_company,_r.key,_r.kind,'in',_share,'revenue_credit','installment',_installment,_ref,'Installment received · '||_r.label,auth.uid())
      ON CONFLICT DO NOTHING;
      IF FOUND THEN _n := _n + 1; END IF;
    END IF;
  END LOOP;
  RETURN _n;
END $$;