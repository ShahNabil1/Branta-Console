ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fund_allocation_rules jsonb;

CREATE OR REPLACE FUNCTION public._company_wallet_credit(_installment uuid, _actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid; _amount numeric; _cfg uuid; _ref text; _n int := 0; _r record; _share numeric;
  _net numeric; _left numeric; _last text; _total numeric; _pc numeric; _rules jsonb;
BEGIN
  SELECT cu.company_id, COALESCE(ii.paid_amount, ii.amount), i.slug, COALESCE(i.total_amount,0), COALESCE(i.project_cost_total,0), i.fund_allocation_rules
    INTO _company, _amount, _ref, _total, _pc, _rules
  FROM invoice_installments ii JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN customers cu ON cu.id = i.customer_id
  WHERE ii.id = _installment AND ii.status = 'paid';
  IF _company IS NULL OR EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cwl:'||_company));
  IF EXISTS (SELECT 1 FROM company_wallet_ledger l WHERE l.source_type='installment' AND l.source_id=_installment
             AND l.entry_type='revenue_credit'
             AND NOT EXISTS (SELECT 1 FROM company_wallet_ledger r WHERE r.reverses_id=l.id)) THEN RETURN 0; END IF;
  SELECT id INTO _cfg FROM company_fund_configs WHERE company_id=_company AND is_active;
  IF _cfg IS NULL AND (_rules IS NULL OR jsonb_typeof(_rules) <> 'array' OR jsonb_array_length(_rules)=0) THEN
    RAISE EXCEPTION 'No fund allocation configured for this company'; END IF;
  IF _total > 0 AND _pc > 0 THEN
    _amount := GREATEST(_amount - round(_amount * LEAST(_pc, _total) / _total, 2), 0);
  END IF;
  _left := _amount;
  FOR _r IN
    SELECT x.key, x.label, x.mode, x.percent, x.fixed_amount, x.sort, COALESCE(b.kind, 'other') kind FROM (
      SELECT e->>'key' key, e->>'label' label, COALESCE(e->>'mode','percent') mode,
             COALESCE((e->>'percent')::numeric,0) percent, COALESCE((e->>'fixed_amount')::numeric,0) fixed_amount, o::int sort
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_rules)='array' AND jsonb_array_length(_rules)>0 THEN _rules ELSE '[]'::jsonb END) WITH ORDINALITY t(e,o)
      UNION ALL
      SELECT key, label, mode, percent, fixed_amount, sort FROM company_fund_buckets
      WHERE config_id=_cfg AND NOT (jsonb_typeof(_rules)='array' AND jsonb_array_length(_rules)>0)
    ) x LEFT JOIN company_fund_buckets b ON b.config_id=_cfg AND b.key=x.key
    WHERE x.mode='fixed' ORDER BY x.sort LOOP
    _share := LEAST(_r.fixed_amount, _left); _left := _left - _share;
    IF _share > 0 THEN
      INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
      VALUES (_company,_r.key,_r.kind,'in',_share,'revenue_credit','installment',_installment,_ref,'Installment received · '||_r.label,_actor);
      _n := _n + 1;
    END IF;
  END LOOP;
  _net := _left;
  _last := NULL;
  FOR _r IN
    SELECT x.key, x.label, x.percent, x.sort, COALESCE(b.kind, 'other') kind FROM (
      SELECT e->>'key' key, e->>'label' label, COALESCE(e->>'mode','percent') mode,
             COALESCE((e->>'percent')::numeric,0) percent, o::int sort
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_rules)='array' AND jsonb_array_length(_rules)>0 THEN _rules ELSE '[]'::jsonb END) WITH ORDINALITY t(e,o)
      UNION ALL
      SELECT key, label, mode, percent, sort FROM company_fund_buckets
      WHERE config_id=_cfg AND NOT (jsonb_typeof(_rules)='array' AND jsonb_array_length(_rules)>0)
    ) x LEFT JOIN company_fund_buckets b ON b.config_id=_cfg AND b.key=x.key
    WHERE x.mode='percent' AND x.percent > 0 ORDER BY x.sort DESC LOOP
    IF _last IS NULL THEN _last := _r.key; END IF;
  END LOOP;
  FOR _r IN
    SELECT x.key, x.label, x.percent, x.sort, COALESCE(b.kind, 'other') kind FROM (
      SELECT e->>'key' key, e->>'label' label, COALESCE(e->>'mode','percent') mode,
             COALESCE((e->>'percent')::numeric,0) percent, o::int sort
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_rules)='array' AND jsonb_array_length(_rules)>0 THEN _rules ELSE '[]'::jsonb END) WITH ORDINALITY t(e,o)
      UNION ALL
      SELECT key, label, mode, percent, sort FROM company_fund_buckets
      WHERE config_id=_cfg AND NOT (jsonb_typeof(_rules)='array' AND jsonb_array_length(_rules)>0)
    ) x LEFT JOIN company_fund_buckets b ON b.config_id=_cfg AND b.key=x.key
    WHERE x.mode='percent' AND x.percent > 0 ORDER BY x.sort LOOP
    IF _r.key = _last THEN _share := _left; ELSE _share := round(_net * _r.percent / 100, 2); END IF;
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

CREATE OR REPLACE FUNCTION public.allocate_installment(_installment_id uuid, _actor uuid DEFAULT NULL::uuid, _source text DEFAULT 'auto'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  inst record; inv record; v_id uuid; alloc_id uuid; recv numeric; ded numeric := 0; dist numeric; pc numeric;
  r record; amt numeric; running numeric := 0; last_item uuid; use_rules boolean;
begin
  if _actor is not null and not public.is_finance_admin(_actor) then raise exception 'forbidden'; end if;
  select id into alloc_id from installment_allocations where installment_id=_installment_id and status='active';
  if alloc_id is not null then return alloc_id; end if;
  select * into inst from invoice_installments where id=_installment_id for update;
  if not found or inst.status::text <> 'paid' then raise exception 'installment not paid'; end if;
  select * into inv from invoices where id=inst.invoice_id;
  use_rules := jsonb_typeof(inv.fund_allocation_rules)='array' and jsonb_array_length(inv.fund_allocation_rules)>0;
  recv := coalesce(nullif(inst.paid_amount,0), inst.amount);
  select id into v_id from fund_allocation_versions where effective_from <= coalesce(inst.paid_at, now())::date order by effective_from desc, created_at desc limit 1;
  if v_id is null then raise exception 'no allocation version'; end if;
  insert into installment_allocations(installment_id, invoice_id, customer_id, project_id, version_id, received_amount, distributable_amount, source, created_by)
  values (_installment_id, inv.id, inv.customer_id, inv.project_id, v_id, recv, 0, _source, _actor) returning id into alloc_id;
  pc := public.installment_project_cost_share(_installment_id, recv, alloc_id);
  if pc > 0 then
    ded := pc;
    insert into installment_allocation_deductions(allocation_id,name,amount_type,value,amount) values (alloc_id,'Project cost share','project_cost',inv.project_cost_total,pc);
  end if;
  for r in select name, amount_type, value from fund_deduction_rules where is_active
           union all select coalesce(description, deduction_type), amount_type, value from installment_deductions where installment_id=_installment_id loop
    amt := round(case when r.amount_type='percent' then recv*r.value/100 else r.value end, 2);
    ded := ded + amt;
    insert into installment_allocation_deductions(allocation_id,name,amount_type,value,amount) values (alloc_id,r.name,r.amount_type,r.value,amt);
  end loop;
  dist := greatest(recv - ded, 0);
  update installment_allocations set deduction_total=ded, distributable_amount=dist where id=alloc_id;
  for r in
    select i.fund_id, f.name, i.percent from fund_allocation_version_items i join finance_funds f on f.id=i.fund_id
      where not use_rules and i.version_id=v_id and i.percent>0
    union all
    select f.id, f.name, (e->>'percent')::numeric from jsonb_array_elements(case when use_rules then inv.fund_allocation_rules else '[]'::jsonb end) with ordinality t(e,o)
      join finance_funds f on f.id = (e->>'fund_id')::uuid where coalesce((e->>'percent')::numeric,0) > 0
  loop
    amt := round(dist*r.percent/100, 2); running := running + amt;
    insert into installment_allocation_items(allocation_id,fund_id,fund_name,percent,amount) values (alloc_id,r.fund_id,r.name,r.percent,amt) returning id into last_item;
  end loop;
  if last_item is not null and running <> dist then
    update installment_allocation_items set amount = amount + (dist - running) where id=last_item;
  end if;
  insert into fund_ledger(fund_id,amount,direction,transaction_type,allocation_id,customer_id,project_id,invoice_id,installment_id,reference,description,created_by)
  select fund_id, amount, 'credit','allocation', alloc_id, inv.customer_id, inv.project_id, inv.id, _installment_id, inv.slug, 'Allocation · '||coalesce(inst.label,'Installment '||inst.sequence), _actor
  from installment_allocation_items where allocation_id=alloc_id and amount>0;
  delete from installment_allocation_failures where installment_id=_installment_id;
  insert into fund_audit_logs(user_id,action,record_type,record_id,next) values (_actor,'allocate','installment_allocation',alloc_id,jsonb_build_object('received',recv,'project_cost_share',pc,'deductions',ded,'distributable',dist,'source',_source,'invoice_rules',use_rules));
  return alloc_id;
end $function$;