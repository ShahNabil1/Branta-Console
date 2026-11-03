CREATE OR REPLACE FUNCTION public.create_expense_atomic(_expense jsonb, _items jsonb, _attachments jsonb, _fund uuid, _exceptional_reason text, _idem uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare eid uuid; cols text; p jsonb; co uuid; sister boolean; wb text;
begin
  co := COALESCE(NULLIF(_expense->>'company_id','')::uuid, public.holding_company_id());
  select not is_holding into sister from companies where id = co;
  if sister is null then raise exception 'Company not found'; end if;
  -- Finance/Admin everywhere; a sister company's CEO only inside that company.
  if not public.is_finance_admin(auth.uid()) and not (sister and public.can_manage_company(co, auth.uid())) then
    raise exception 'forbidden';
  end if;
  if _idem is not null then
    perform pg_advisory_xact_lock(hashtext(_idem::text));
    select id into eid from expenses where idempotency_key = _idem;
    if found then return eid; end if;
  end if;
  wb := NULLIF(_expense->>'wallet_bucket','');
  if sister and _fund is not null then raise exception 'Sister company expenses cannot use the Branta Tech fund ledger'; end if;
  if not sister and wb is not null then raise exception 'Branta Tech expenses use the group fund ledger'; end if;
  p := (_expense - array['id','created_at','updated_at','voucher_no','deleted_at','deleted_by','fund_id','idempotency_key','wallet_bucket','company_id'])
       || jsonb_build_object('created_by', auth.uid(), 'idempotency_key', _idem, 'company_id', co);
  select string_agg(quote_ident(k), ',') into cols
    from jsonb_object_keys(p) k
    where exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='expenses' and c.column_name=k);
  execute format('insert into expenses(%s) select %s from jsonb_populate_record(null::expenses, $1) returning id', cols, cols) using p into eid;
  insert into expense_items(expense_id,sequence,name,quantity,unit,unit_price,amount,note)
  select eid, ord, x->>'name', coalesce((x->>'quantity')::numeric,1), x->>'unit', coalesce((x->>'unit_price')::numeric,0),
         coalesce((x->>'amount')::numeric, coalesce((x->>'quantity')::numeric,1)*coalesce((x->>'unit_price')::numeric,0)), x->>'note'
  from jsonb_array_elements(coalesce(_items,'[]'::jsonb)) with ordinality t(x,ord);
  insert into expense_attachments(expense_id,sequence,path,caption,mime_type,size_bytes,kind,created_by)
  select eid, ord, x->>'path', x->>'caption', x->>'mime_type', (x->>'size_bytes')::bigint, 'receipt', auth.uid()
  from jsonb_array_elements(coalesce(_attachments,'[]'::jsonb)) with ordinality t(x,ord)
  where coalesce(x->>'kind','receipt')='receipt';
  if _fund is not null then
    perform public.expense_fund_debit(eid, _fund, _exceptional_reason);
  end if;
  if wb is not null then
    perform public.company_wallet_debit_expense(eid, wb);
  end if;
  return eid;
end $function$;

CREATE OR REPLACE FUNCTION public.company_wallet_debit_expense(_expense uuid, _bucket text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _e record; _kind text; _bal numeric; _id uuid;
BEGIN
  SELECT * INTO _e FROM expenses WHERE id=_expense AND deleted_at IS NULL;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF NOT public.is_finance_admin(auth.uid()) AND NOT public.can_manage_company(_e.company_id, auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE id=_e.company_id AND is_holding) THEN
    RAISE EXCEPTION 'Branta Tech expenses use the group fund ledger'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cwl:'||_e.company_id));
  SELECT bucket_kind, balance INTO _kind, _bal FROM company_wallet_balances WHERE company_id=_e.company_id AND bucket_key=COALESCE(_bucket,'free');
  IF _kind IS NULL OR _bal < _e.amount THEN RAISE EXCEPTION 'Insufficient wallet balance in this bucket'; END IF;
  INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
  VALUES (_e.company_id,COALESCE(_bucket,'free'),_kind,'out',_e.amount,'expense_debit','expense',_expense,_e.voucher_no,COALESCE(_e.vendor,'Expense'),auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $function$;