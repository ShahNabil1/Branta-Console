ALTER TABLE public.fund_ledger ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.fund_ledger(id);
CREATE UNIQUE INDEX IF NOT EXISTS fund_ledger_one_reversal_per_entry ON public.fund_ledger(reversal_of) WHERE reversal_of IS NOT NULL;

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
    insert into fund_audit_logs(user_id,action,record_type,record_id,prev,next,reason)
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
DROP TRIGGER IF EXISTS trg_expense_fund_guard ON public.expenses;
CREATE TRIGGER trg_expense_fund_guard BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_fund_guard();

CREATE OR REPLACE VIEW public.fund_balances WITH (security_invoker = true) AS
 SELECT f.id AS fund_id, f.code, f.name, f.kind, f.is_active, f.display_order,
    COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'credit'), 0::numeric) AS total_credits,
    COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'debit'), 0::numeric) AS total_debits,
    COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount ELSE -l.amount END), 0::numeric) AS ledger_balance,
    COALESCE(sum(l.amount) FILTER (WHERE l.transaction_type = 'allocation' AND l.direction = 'credit'), 0::numeric)
      - COALESCE(sum(l.amount) FILTER (WHERE l.transaction_type = 'reversal' AND l.direction = 'debit'), 0::numeric) AS allocation_total,
    COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'debit' AND l.transaction_type <> ALL (ARRAY['transfer_out','loan_out','reversal','loan_repayment'])), 0::numeric)
      - COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'credit' AND l.transaction_type = 'expense_reversal'), 0::numeric) AS spent_total,
    CASE WHEN f.code = 'employee' THEN COALESCE((SELECT sum(e.amount) FROM employee_fund_payments e WHERE e.status = 'committed'), 0::numeric) ELSE 0::numeric END AS committed,
    COALESCE((SELECT sum(x.principal_amount - x.repaid_amount) FROM fund_loans x WHERE x.to_fund_id = f.id AND x.status = ANY (ARRAY['open','partially_repaid'])), 0::numeric) AS borrowed,
    COALESCE((SELECT sum(x.principal_amount - x.repaid_amount) FROM fund_loans x WHERE x.from_fund_id = f.id AND x.status = ANY (ARRAY['open','partially_repaid'])), 0::numeric) AS lent,
    COALESCE((SELECT sum(z.amount) FROM fund_ledger z WHERE z.fund_id = f.id AND z.direction = 'debit' AND z.transaction_type = ANY (ARRAY['employee_payment','salary_payment','bonus','incentive','commission','overtime','adjustment'])), 0::numeric) AS paid_total
   FROM finance_funds f LEFT JOIN fund_ledger l ON l.fund_id = f.id
  GROUP BY f.id;

REVOKE EXECUTE ON FUNCTION public.fund_transfer(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fund_loan_create(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fund_loan_repay(uuid,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fund_loan_cancel(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_withdraw(numeric,text,uuid,text,text,date,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.employee_payment_set_status(uuid,text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expense_fund_debit(uuid,uuid,text) FROM PUBLIC, anon;