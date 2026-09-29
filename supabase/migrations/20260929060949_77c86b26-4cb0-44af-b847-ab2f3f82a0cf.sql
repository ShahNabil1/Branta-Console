ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_idempotency_key_uidx ON public.expenses(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Atomic expense creation: expense + items + receipt rows + fund debit + audit in ONE transaction.
CREATE OR REPLACE FUNCTION public.create_expense_atomic(_expense jsonb, _items jsonb, _attachments jsonb, _fund uuid, _exceptional_reason text, _idem uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
declare eid uuid; cols text; p jsonb;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if _idem is not null then
    perform pg_advisory_xact_lock(hashtext(_idem::text));
    select id into eid from expenses where idempotency_key=_idem;
    if found then return eid; end if;
  end if;
  p := (_expense - array['id','created_at','updated_at','voucher_no','deleted_at','deleted_by','fund_id','idempotency_key'])
       || jsonb_build_object('created_by', auth.uid(), 'idempotency_key', _idem);
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
  return eid;
end $$;
REVOKE EXECUTE ON FUNCTION public.create_expense_atomic(jsonb,jsonb,jsonb,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense_atomic(jsonb,jsonb,jsonb,uuid,text,uuid) TO authenticated;

-- Employee payment: lock financial fields after commit; explicit link audit events.
CREATE OR REPLACE FUNCTION public.efp_guard_and_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if TG_OP = 'UPDATE' and OLD.status in ('committed','paid','cancelled') and (
     NEW.amount is distinct from OLD.amount or NEW.employee_id is distinct from OLD.employee_id or
     NEW.payment_type is distinct from OLD.payment_type or NEW.project_id is distinct from OLD.project_id or
     NEW.invoice_id is distinct from OLD.invoice_id or NEW.task_id is distinct from OLD.task_id or
     NEW.salary_slip_id is distinct from OLD.salary_slip_id or NEW.invoice_payout_id is distinct from OLD.invoice_payout_id) then
    raise exception 'PAYMENT_LOCKED: financial fields cannot change once a payment is %', OLD.status;
  end if;
  if NEW.salary_slip_id is not null and (TG_OP='INSERT' or NEW.salary_slip_id is distinct from OLD.salary_slip_id) then
    insert into fund_audit_logs(user_id,action,record_type,record_id,next) values (auth.uid(),'salary_slip_linked','employee_fund_payment',NEW.id,jsonb_build_object('salary_slip_id',NEW.salary_slip_id,'amount',NEW.amount));
  end if;
  if NEW.invoice_payout_id is not null and (TG_OP='INSERT' or NEW.invoice_payout_id is distinct from OLD.invoice_payout_id) then
    insert into fund_audit_logs(user_id,action,record_type,record_id,next) values (auth.uid(),'invoice_payout_linked','employee_fund_payment',NEW.id,jsonb_build_object('invoice_payout_id',NEW.invoice_payout_id,'amount',NEW.amount));
  end if;
  return NEW;
end $$;
REVOKE ALL ON FUNCTION public.efp_guard_and_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_efp_guard_ins ON public.employee_fund_payments;
DROP TRIGGER IF EXISTS trg_efp_guard_upd ON public.employee_fund_payments;
CREATE TRIGGER trg_efp_guard_ins AFTER INSERT ON public.employee_fund_payments FOR EACH ROW EXECUTE FUNCTION public.efp_guard_and_audit();
CREATE TRIGGER trg_efp_guard_upd BEFORE UPDATE ON public.employee_fund_payments FOR EACH ROW EXECUTE FUNCTION public.efp_guard_and_audit();