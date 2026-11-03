DROP INDEX IF EXISTS public.company_wallet_ledger_source_uniq;
CREATE INDEX IF NOT EXISTS company_wallet_ledger_source_idx ON public.company_wallet_ledger(source_type, source_id);

CREATE OR REPLACE FUNCTION public.invoice_installment_company(_installment uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cu.company_id FROM invoice_installments ii JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN customers cu ON cu.id = i.customer_id WHERE ii.id = _installment
$$;
REVOKE EXECUTE ON FUNCTION public.invoice_installment_company(uuid) FROM PUBLIC, anon;

-- Internal: credit one paid installment (no auth check; callers must gate)
CREATE OR REPLACE FUNCTION public._company_wallet_credit(_installment uuid, _actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid; _amount numeric; _cfg uuid; _ref text; _n int := 0; _r record; _share numeric;
  _net numeric; _left numeric; _last uuid;
BEGIN
  SELECT cu.company_id, COALESCE(ii.paid_amount, ii.amount), i.slug INTO _company, _amount, _ref
  FROM invoice_installments ii JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN customers cu ON cu.id = i.customer_id
  WHERE ii.id = _installment AND ii.status = 'paid';
  IF _company IS NULL OR EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cwl:'||_company));
  -- already credited and not reversed → idempotent no-op
  IF EXISTS (SELECT 1 FROM company_wallet_ledger l WHERE l.source_type='installment' AND l.source_id=_installment
             AND l.entry_type='revenue_credit'
             AND NOT EXISTS (SELECT 1 FROM company_wallet_ledger r WHERE r.reverses_id=l.id)) THEN RETURN 0; END IF;
  SELECT id INTO _cfg FROM company_fund_configs WHERE company_id=_company AND is_active;
  IF _cfg IS NULL THEN RAISE EXCEPTION 'No fund allocation configured for this company'; END IF;
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

-- Internal: reverse every unreversed credit of an installment
CREATE OR REPLACE FUNCTION public._company_wallet_reverse_installment(_installment uuid, _reason text, _actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l record; _n int := 0;
BEGIN
  FOR _l IN SELECT l.* FROM company_wallet_ledger l WHERE l.source_type='installment' AND l.source_id=_installment
            AND l.entry_type='revenue_credit' AND NOT EXISTS (SELECT 1 FROM company_wallet_ledger r WHERE r.reverses_id=l.id) LOOP
    PERFORM pg_advisory_xact_lock(hashtext('cwl:'||_l.company_id));
    INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,reverses_id,created_by)
    VALUES (_l.company_id,_l.bucket_key,_l.bucket_kind,'out',_l.amount,'reversal','installment',_installment,_l.record_ref,
            'Payment reverted · '||COALESCE(_reason,''),_l.id,_actor);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public._company_wallet_reverse_installment(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Public RPC keeps its Finance gate and delegates
CREATE OR REPLACE FUNCTION public.company_wallet_credit_installment(_installment uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN public._company_wallet_credit(_installment, auth.uid());
END $$;

-- Paid trigger: sister-company invoices go to the company wallet, Branta's go to the group fund ledger
CREATE OR REPLACE FUNCTION public.trg_installment_paid_allocate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _co uuid;
begin
  if new.status::text='paid' and (tg_op='INSERT' or old.status::text is distinct from 'paid') then
    _co := public.invoice_installment_company(new.id);
    begin
      if _co is not null and exists (select 1 from companies where id=_co and not is_holding) then
        perform public._company_wallet_credit(new.id, auth.uid());
      else
        perform public.allocate_installment(new.id, null, 'auto');
      end if;
    exception when others then
      insert into installment_allocation_failures(installment_id,error) values (new.id, sqlerrm)
      on conflict (installment_id) do update set error=excluded.error, attempts=installment_allocation_failures.attempts+1, last_attempt_at=now();
    end;
  elsif tg_op='UPDATE' and old.status::text='paid' and new.status::text <> 'paid' then
    perform public._company_wallet_reverse_installment(new.id, 'Installment no longer paid', auth.uid());
  end if;
  return new;
end $function$;