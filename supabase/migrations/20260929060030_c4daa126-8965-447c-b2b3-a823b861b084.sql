CREATE OR REPLACE FUNCTION public.expense_fund_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare net numeric; last_debit uuid;
begin
  if OLD.fund_id is null then return NEW; end if;
  if NEW.amount is distinct from OLD.amount or NEW.currency is distinct from OLD.currency or NEW.fund_id is distinct from OLD.fund_id then
    raise exception 'FUND_EXPENSE_LOCKED: amount, currency and paying fund of a fund-backed expense cannot be edited. Move it to Recycle Bin (auto-reversal) and create a corrected expense.';
  end if;
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into net
    from fund_ledger where expense_id=NEW.id and transaction_type in ('expense','expense_restore','expense_reversal');
  if OLD.deleted_at is null and NEW.deleted_at is not null and net > 0 then
    select id into last_debit from fund_ledger l where expense_id=NEW.id and direction='debit'
      and transaction_type in ('expense','expense_restore')
      and not exists (select 1 from fund_ledger r where r.reversal_of=l.id)
      order by created_at desc limit 1;
    insert into fund_ledger(fund_id,amount,direction,transaction_type,expense_id,reversal_of,reference,description,notes,created_by)
    values (OLD.fund_id,net,'credit','expense_reversal',NEW.id,last_debit,NEW.voucher_no,'Expense reversal · Recycle Bin',NEW.delete_reason,auth.uid());
    insert into fund_audit_logs(user_id,action,record_type,record_id,previous,next,reason)
    values (auth.uid(),'expense_reversal','expense',NEW.id,jsonb_build_object('ledger_entry',last_debit),jsonb_build_object('fund',OLD.fund_id,'amount',net),NEW.delete_reason);
  elsif OLD.deleted_at is not null and NEW.deleted_at is null and net <= 0 then
    perform pg_advisory_xact_lock(hashtext(OLD.fund_id::text));
    perform public._fund_guard(OLD.fund_id, NEW.amount);
    insert into fund_ledger(fund_id,amount,direction,transaction_type,expense_id,reference,description,created_by)
    values (OLD.fund_id,NEW.amount,'debit','expense_restore',NEW.id,NEW.voucher_no,'Expense restored from Recycle Bin',auth.uid());
    insert into fund_audit_logs(user_id,action,record_type,record_id,next)
    values (auth.uid(),'expense_restore','expense',NEW.id,jsonb_build_object('fund',OLD.fund_id,'amount',NEW.amount));
  end if;
  return NEW;
end $$;
REVOKE ALL ON FUNCTION public.expense_fund_guard() FROM PUBLIC, anon, authenticated;