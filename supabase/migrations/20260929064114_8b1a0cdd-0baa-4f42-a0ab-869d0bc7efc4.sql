create or replace view public.fund_ledger_running with (security_invoker=true) as
select l.*,
  case when l.direction='credit' then l.amount else 0 end as credit,
  case when l.direction='debit' then l.amount else 0 end as debit,
  sum(case when l.direction='credit' then l.amount else -l.amount end)
    over (partition by l.fund_id order by l.created_at, l.id rows between unbounded preceding and current row) as running_balance
from public.fund_ledger l;
revoke all on public.fund_ledger_running from anon, public;
grant select on public.fund_ledger_running to authenticated, service_role;

create index if not exists fund_ledger_project_idx on public.fund_ledger(project_id) where project_id is not null;
create index if not exists fund_ledger_type_idx on public.fund_ledger(fund_id, transaction_type);
create index if not exists installment_allocations_project_idx on public.installment_allocations(project_id, status);
create index if not exists installment_allocations_invoice_idx on public.installment_allocations(invoice_id);
create index if not exists efp_employee_idx on public.employee_fund_payments(employee_id, status);
create index if not exists efp_project_idx on public.employee_fund_payments(project_id) where project_id is not null;
create index if not exists idx_invoices_project on public.invoices(project_id) where project_id is not null;