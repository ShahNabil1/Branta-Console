
create table public.fund_transfers (
  id uuid primary key default gen_random_uuid(),
  from_fund_id uuid not null references public.finance_funds(id),
  to_fund_id uuid not null references public.finance_funds(id),
  amount numeric not null check (amount > 0),
  reason text not null,
  linked_expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid, created_at timestamptz not null default now(),
  check (from_fund_id <> to_fund_id)
);
create table public.fund_loans (
  id uuid primary key default gen_random_uuid(),
  from_fund_id uuid not null references public.finance_funds(id),
  to_fund_id uuid not null references public.finance_funds(id),
  principal_amount numeric not null check (principal_amount > 0),
  repaid_amount numeric not null default 0,
  status text not null default 'open' check (status in ('open','partially_repaid','repaid','cancelled')),
  reason text not null,
  linked_expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (from_fund_id <> to_fund_id)
);
create table public.fund_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.fund_loans(id),
  amount numeric not null check (amount > 0),
  notes text, created_by uuid, created_at timestamptz not null default now()
);
create table public.employee_fund_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  payment_type text not null check (payment_type in ('project_payment','salary','bonus','incentive','commission','overtime','adjustment')),
  amount numeric not null check (amount > 0),
  project_id uuid references public.client_projects(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  task_id uuid references public.client_tasks(id) on delete set null,
  salary_slip_id uuid references public.salary_slips(id) on delete set null,
  invoice_payout_id uuid references public.invoice_payouts(id) on delete set null,
  description text, payment_method text, transaction_reference text, notes text,
  status text not null default 'draft' check (status in ('draft','approved','committed','paid','cancelled')),
  cancel_reason text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), paid_at timestamptz
);
create unique index efp_one_payout on public.employee_fund_payments(invoice_payout_id) where invoice_payout_id is not null and status <> 'cancelled';
create unique index efp_one_slip on public.employee_fund_payments(salary_slip_id) where salary_slip_id is not null and status <> 'cancelled';
create table public.owner_withdrawals (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount > 0),
  recipient_name text not null, recipient_user_id uuid,
  payment_method text, transaction_reference text,
  withdrawn_on date not null default current_date,
  reason text not null, notes text, approved_by uuid,
  created_by uuid, created_at timestamptz not null default now()
);
create unique index fund_ledger_one_expense_debit on public.fund_ledger(expense_id) where expense_id is not null and transaction_type = 'expense';

do $$ declare t text; begin
  foreach t in array array['fund_transfers','fund_loans','fund_loan_repayments','employee_fund_payments','owner_withdrawals'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "finance read %1$s" on public.%1$I for select to authenticated using (public.is_finance_admin(auth.uid()))', t);
  end loop;
end $$;
grant insert on public.employee_fund_payments to authenticated;
create policy "finance insert efp" on public.employee_fund_payments for insert to authenticated
  with check (public.is_finance_admin(auth.uid()) and status in ('draft','approved'));
create trigger efp_updated before update on public.employee_fund_payments for each row execute function public.set_updated_at();
create trigger loans_updated before update on public.fund_loans for each row execute function public.set_updated_at();

-- balance helpers
create or replace function public.fund_committed(_fund_id uuid) returns numeric language sql stable security definer set search_path=public as $$
  select case when (select code from finance_funds where id=_fund_id)='employee'
    then coalesce((select sum(amount) from employee_fund_payments where status='committed'),0) else 0 end
$$;
create or replace function public.fund_available(_fund_id uuid) returns numeric language sql stable security definer set search_path=public as $$
  select coalesce((select sum(case when direction='credit' then amount else -amount end) from fund_ledger where fund_id=_fund_id),0) - public.fund_committed(_fund_id)
$$;

create or replace view public.fund_balances with (security_invoker=true) as
select f.id as fund_id, f.code, f.name, f.kind, f.is_active, f.display_order,
  coalesce(sum(l.amount) filter (where l.direction='credit'),0) as total_credits,
  coalesce(sum(l.amount) filter (where l.direction='debit'),0) as total_debits,
  coalesce(sum(case when l.direction='credit' then l.amount else -l.amount end),0) as ledger_balance,
  coalesce(sum(l.amount) filter (where l.transaction_type='allocation' and l.direction='credit'),0)
   - coalesce(sum(l.amount) filter (where l.transaction_type='reversal' and l.direction='debit'),0) as allocation_total,
  coalesce(sum(l.amount) filter (where l.direction='debit' and l.transaction_type not in ('transfer_out','loan_out','reversal','loan_repayment')),0) as spent_total,
  (case when f.code='employee' then coalesce((select sum(amount) from public.employee_fund_payments where status='committed'),0) else 0 end) as committed,
  coalesce((select sum(principal_amount-repaid_amount) from public.fund_loans x where x.to_fund_id=f.id and x.status in ('open','partially_repaid')),0) as borrowed,
  coalesce((select sum(principal_amount-repaid_amount) from public.fund_loans x where x.from_fund_id=f.id and x.status in ('open','partially_repaid')),0) as lent,
  coalesce((select sum(amount) filter (where transaction_type in ('employee_payment','salary_payment','bonus','incentive','commission','overtime','adjustment')) from public.fund_ledger z where z.fund_id=f.id and z.direction='debit'),0) as paid_total
from public.finance_funds f left join public.fund_ledger l on l.fund_id=f.id
group by f.id;
grant select on public.fund_balances to authenticated;

create or replace function public._fund_guard(_fund uuid, _amount numeric) returns void language plpgsql security definer set search_path=public as $$
declare av numeric;
begin
  if not exists (select 1 from finance_funds where id=_fund and is_active) then raise exception 'Fund is inactive or missing'; end if;
  av := public.fund_available(_fund);
  if _amount > av then raise exception 'INSUFFICIENT_FUND: required %, available %, shortfall %', _amount, av, _amount-av; end if;
end $$;

create or replace function public.fund_transfer(_from uuid, _to uuid, _amount numeric, _reason text, _expense uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if _from = _to then raise exception 'Source and destination must differ'; end if;
  if length(coalesce(_reason,'')) < 5 then raise exception 'Reason required (min 5 chars)'; end if;
  perform pg_advisory_xact_lock(hashtext(_from::text));
  perform public._fund_guard(_from, _amount);
  insert into fund_transfers(from_fund_id,to_fund_id,amount,reason,linked_expense_id,created_by) values (_from,_to,_amount,_reason,_expense,auth.uid()) returning id into tid;
  insert into fund_ledger(fund_id,amount,direction,transaction_type,transfer_id,expense_id,description,notes,created_by) values
    (_from,_amount,'debit','transfer_out',tid,null,'Transfer out',_reason,auth.uid()),
    (_to,_amount,'credit','transfer_in',tid,null,'Transfer in',_reason,auth.uid());
  insert into fund_audit_logs(user_id,action,record_type,record_id,next,reason) values (auth.uid(),'transfer','fund_transfer',tid,jsonb_build_object('from',_from,'to',_to,'amount',_amount,'expense',_expense),_reason);
  return tid;
end $$;

create or replace function public.fund_loan_create(_from uuid, _to uuid, _amount numeric, _reason text, _expense uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare lid uuid;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if _from = _to then raise exception 'Source and destination must differ'; end if;
  if length(coalesce(_reason,'')) < 5 then raise exception 'Reason required (min 5 chars)'; end if;
  perform pg_advisory_xact_lock(hashtext(_from::text));
  perform public._fund_guard(_from, _amount);
  insert into fund_loans(from_fund_id,to_fund_id,principal_amount,reason,linked_expense_id,created_by) values (_from,_to,_amount,_reason,_expense,auth.uid()) returning id into lid;
  insert into fund_ledger(fund_id,amount,direction,transaction_type,loan_id,description,notes,created_by) values
    (_from,_amount,'debit','loan_out',lid,'Loan given',_reason,auth.uid()),
    (_to,_amount,'credit','loan_in',lid,'Loan received',_reason,auth.uid());
  insert into fund_audit_logs(user_id,action,record_type,record_id,next,reason) values (auth.uid(),'loan','fund_loan',lid,jsonb_build_object('from',_from,'to',_to,'amount',_amount),_reason);
  return lid;
end $$;

create or replace function public.fund_loan_repay(_loan uuid, _amount numeric, _notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare l record; outst numeric; rid uuid;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  select * into l from fund_loans where id=_loan for update;
  if not found or l.status not in ('open','partially_repaid') then raise exception 'Loan is not open'; end if;
  outst := l.principal_amount - l.repaid_amount;
  if _amount <= 0 or _amount > outst then raise exception 'Repayment must be between 0 and outstanding %', outst; end if;
  perform public._fund_guard(l.to_fund_id, _amount);
  insert into fund_loan_repayments(loan_id,amount,notes,created_by) values (_loan,_amount,_notes,auth.uid()) returning id into rid;
  insert into fund_ledger(fund_id,amount,direction,transaction_type,loan_id,description,notes,created_by) values
    (l.to_fund_id,_amount,'debit','loan_repayment',_loan,'Loan repayment',_notes,auth.uid()),
    (l.from_fund_id,_amount,'credit','loan_repayment',_loan,'Loan repayment received',_notes,auth.uid());
  update fund_loans set repaid_amount=repaid_amount+_amount,
    status = case when repaid_amount+_amount >= principal_amount then 'repaid' else 'partially_repaid' end where id=_loan;
  insert into fund_audit_logs(user_id,action,record_type,record_id,previous,next,reason) values (auth.uid(),'loan_repay','fund_loan',_loan,jsonb_build_object('outstanding',outst),jsonb_build_object('outstanding',outst-_amount,'amount',_amount),_notes);
end $$;

create or replace function public.fund_loan_cancel(_loan uuid, _reason text)
returns void language plpgsql security definer set search_path=public as $$
declare l record;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if length(coalesce(_reason,'')) < 5 then raise exception 'Reason required'; end if;
  select * into l from fund_loans where id=_loan for update;
  if l.repaid_amount > 0 or l.status <> 'open' then raise exception 'Only untouched open loans can be cancelled'; end if;
  perform public._fund_guard(l.to_fund_id, l.principal_amount);
  insert into fund_ledger(fund_id,amount,direction,transaction_type,loan_id,description,notes,created_by) values
    (l.to_fund_id,l.principal_amount,'debit','reversal',_loan,'Loan cancelled',_reason,auth.uid()),
    (l.from_fund_id,l.principal_amount,'credit','correction',_loan,'Loan cancelled',_reason,auth.uid());
  update fund_loans set status='cancelled' where id=_loan;
  insert into fund_audit_logs(user_id,action,record_type,record_id,reason) values (auth.uid(),'loan_cancel','fund_loan',_loan,_reason);
end $$;

create or replace function public.employee_payment_set_status(_id uuid, _status text, _reason text default null, _method text default null, _ref text default null)
returns void language plpgsql security definer set search_path=public as $$
declare p record; emp uuid; av numeric; tx text;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  select * into p from employee_fund_payments where id=_id for update;
  if not found then raise exception 'Payment not found'; end if;
  select id into emp from finance_funds where code='employee';
  if _status='approved' and p.status='draft' then null;
  elsif _status='committed' and p.status in ('draft','approved') then
    perform pg_advisory_xact_lock(hashtext(emp::text));
    perform public._fund_guard(emp, p.amount);
  elsif _status='paid' and p.status in ('approved','committed') then
    perform pg_advisory_xact_lock(hashtext(emp::text));
    av := public.fund_available(emp) + case when p.status='committed' then p.amount else 0 end;
    if p.amount > av then raise exception 'INSUFFICIENT_FUND: required %, available %, shortfall %', p.amount, av, p.amount-av; end if;
    tx := case p.payment_type when 'project_payment' then 'employee_payment' when 'salary' then 'salary_payment' else p.payment_type end;
    insert into fund_ledger(fund_id,amount,direction,transaction_type,employee_id,project_id,invoice_id,salary_slip_id,invoice_payout_id,reference,description,notes,created_by)
    values (emp,p.amount,'debit',tx,p.employee_id,p.project_id,p.invoice_id,p.salary_slip_id,p.invoice_payout_id,coalesce(_ref,p.transaction_reference),coalesce(p.description,'Employee payment'),p.notes,auth.uid());
    update employee_fund_payments set paid_at=now(), payment_method=coalesce(_method,payment_method), transaction_reference=coalesce(_ref,transaction_reference) where id=_id;
  elsif _status='cancelled' and p.status in ('draft','approved','committed') then
    if length(coalesce(_reason,'')) < 5 then raise exception 'Reason required'; end if;
    update employee_fund_payments set cancel_reason=_reason where id=_id;
  else raise exception 'Invalid transition % → %', p.status, _status;
  end if;
  update employee_fund_payments set status=_status where id=_id;
  insert into fund_audit_logs(user_id,action,record_type,record_id,previous,next,reason) values (auth.uid(),'employee_payment_'||_status,'employee_fund_payment',_id,jsonb_build_object('status',p.status),jsonb_build_object('status',_status,'amount',p.amount),_reason);
end $$;

create or replace function public.owner_withdraw(_amount numeric, _name text, _user uuid, _method text, _ref text, _date date, _reason text, _notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare pf uuid; wid uuid;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if length(coalesce(_reason,'')) < 5 then raise exception 'Reason required'; end if;
  select id into pf from finance_funds where code='profit';
  perform pg_advisory_xact_lock(hashtext(pf::text));
  perform public._fund_guard(pf, _amount);
  insert into owner_withdrawals(amount,recipient_name,recipient_user_id,payment_method,transaction_reference,withdrawn_on,reason,notes,approved_by,created_by)
  values (_amount,_name,_user,_method,_ref,coalesce(_date,current_date),_reason,_notes,auth.uid(),auth.uid()) returning id into wid;
  insert into fund_ledger(fund_id,amount,direction,transaction_type,employee_id,reference,description,notes,created_by)
  values (pf,_amount,'debit','owner_withdrawal',_user,_ref,'Owner / Director withdrawal · '||_name,_reason,auth.uid());
  insert into fund_audit_logs(user_id,action,record_type,record_id,next,reason) values (auth.uid(),'owner_withdrawal','owner_withdrawal',wid,jsonb_build_object('amount',_amount,'to',_name),_reason);
  return wid;
end $$;

create or replace function public.expense_fund_debit(_expense uuid, _fund uuid, _exceptional_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare e record; code text;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  select * into e from expenses where id=_expense and deleted_at is null for update;
  if not found then raise exception 'Expense not found'; end if;
  if exists (select 1 from fund_ledger where expense_id=_expense and transaction_type='expense') then raise exception 'Expense already charged to a fund'; end if;
  select f.code into code from finance_funds f where f.id=_fund;
  if code='profit' and length(coalesce(_exceptional_reason,'')) < 5 then raise exception 'PROFIT_FUND_PROTECTED: exceptional reason required'; end if;
  perform pg_advisory_xact_lock(hashtext(_fund::text));
  perform public._fund_guard(_fund, e.amount);
  insert into fund_ledger(fund_id,amount,direction,transaction_type,expense_id,project_id,reference,description,notes,created_by)
  values (_fund,e.amount,'debit','expense',_expense,null,e.voucher_no,'Expense · '||e.category::text,_exceptional_reason,auth.uid());
  update expenses set fund_id=_fund where id=_expense;
  insert into fund_audit_logs(user_id,action,record_type,record_id,next,reason) values (auth.uid(), case when code='profit' then 'profit_exceptional_expense' else 'expense_fund' end,'expense',_expense,jsonb_build_object('fund',_fund,'amount',e.amount),_exceptional_reason);
end $$;

revoke execute on function public._fund_guard(uuid,numeric), public.fund_committed(uuid), public.fund_available(uuid) from public, anon;
revoke execute on function public.fund_transfer(uuid,uuid,numeric,text,uuid), public.fund_loan_create(uuid,uuid,numeric,text,uuid), public.fund_loan_repay(uuid,numeric,text), public.fund_loan_cancel(uuid,text), public.employee_payment_set_status(uuid,text,text,text,text), public.owner_withdraw(numeric,text,uuid,text,text,date,text,text), public.expense_fund_debit(uuid,uuid,text) from public, anon;
revoke execute on function public._fund_guard(uuid,numeric) from authenticated;
