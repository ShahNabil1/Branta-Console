ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.invoices i SET company_id = COALESCE(c.company_id, public.holding_company_id())
  FROM public.customers c WHERE c.id = i.customer_id AND i.company_id IS NULL;
UPDATE public.invoices SET company_id = public.holding_company_id() WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS invoices_company_idx ON public.invoices(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS expenses_company_spent_idx ON public.expenses(company_id, spent_on DESC);

-- An invoice always belongs to its customer's company.
CREATE OR REPLACE FUNCTION public.invoices_set_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.company_id := COALESCE((SELECT company_id FROM customers WHERE id = NEW.customer_id), public.holding_company_id());
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.invoices_set_company() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_invoices_set_company ON public.invoices;
CREATE TRIGGER trg_invoices_set_company BEFORE INSERT OR UPDATE OF customer_id, company_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoices_set_company();

-- Atomic expense creation, now company-aware.
CREATE OR REPLACE FUNCTION public.create_expense_atomic(_expense jsonb, _items jsonb, _attachments jsonb, _fund uuid, _exceptional_reason text, _idem uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
declare eid uuid; cols text; p jsonb; co uuid; sister boolean; wb text;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if _idem is not null then
    perform pg_advisory_xact_lock(hashtext(_idem::text));
    select id into eid from expenses where idempotency_key=_idem;
    if found then return eid; end if;
  end if;
  co := COALESCE(NULLIF(_expense->>'company_id','')::uuid, public.holding_company_id());
  select not is_holding into sister from companies where id = co;
  if sister is null then raise exception 'Company not found'; end if;
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
end $$;
REVOKE EXECUTE ON FUNCTION public.create_expense_atomic(jsonb,jsonb,jsonb,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense_atomic(jsonb,jsonb,jsonb,uuid,text,uuid) TO authenticated;