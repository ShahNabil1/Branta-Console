
create table public.finance_funds (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  kind text not null default 'operating',
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.fund_allocation_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  effective_from date not null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table public.fund_allocation_version_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.fund_allocation_versions(id) on delete restrict,
  fund_id uuid not null references public.finance_funds(id) on delete restrict,
  percent numeric(6,3) not null check (percent >= 0 and percent <= 100),
  unique (version_id, fund_id)
);
create table public.fund_deduction_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount_type text not null check (amount_type in ('percent','fixed')),
  value numeric not null check (value >= 0),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.installment_deductions (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.invoice_installments(id) on delete restrict,
  deduction_type text not null default 'other',
  description text,
  amount_type text not null check (amount_type in ('percent','fixed')),
  value numeric not null check (value >= 0),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table public.installment_allocations (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.invoice_installments(id) on delete restrict,
  invoice_id uuid not null,
  customer_id uuid,
  project_id uuid,
  version_id uuid references public.fund_allocation_versions(id),
  received_amount numeric not null,
  deduction_total numeric not null default 0,
  distributable_amount numeric not null,
  status text not null default 'active' check (status in ('active','reversed','failed')),
  error text,
  source text not null default 'auto',
  replaces_allocation_id uuid references public.installment_allocations(id),
  reversed_at timestamptz, reversed_by uuid, reversal_reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index installment_allocations_one_active on public.installment_allocations(installment_id) where status='active';
create table public.installment_allocation_deductions (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.installment_allocations(id) on delete restrict,
  name text not null, amount_type text not null, value numeric not null, amount numeric not null
);
create table public.installment_allocation_items (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.installment_allocations(id) on delete restrict,
  fund_id uuid not null references public.finance_funds(id),
  fund_name text not null, percent numeric not null, amount numeric not null
);
create table public.fund_ledger (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.finance_funds(id),
  amount numeric not null check (amount > 0),
  direction text not null check (direction in ('credit','debit')),
  transaction_type text not null,
  allocation_id uuid references public.installment_allocations(id),
  customer_id uuid, project_id uuid, invoice_id uuid, installment_id uuid,
  employee_id uuid, salary_slip_id uuid, invoice_payout_id uuid, expense_id uuid,
  transfer_id uuid, loan_id uuid,
  reference text, description text, notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index fund_ledger_fund_idx on public.fund_ledger(fund_id, created_at);
create table public.installment_allocation_failures (
  installment_id uuid primary key references public.invoice_installments(id) on delete cascade,
  error text, attempts int not null default 1, last_attempt_at timestamptz not null default now()
);
create table public.fund_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, action text not null, record_type text, record_id uuid,
  previous jsonb, next jsonb, reason text,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['finance_funds','fund_allocation_versions','fund_allocation_version_items','fund_deduction_rules','installment_deductions','installment_allocations','installment_allocation_deductions','installment_allocation_items','fund_ledger','installment_allocation_failures','fund_audit_logs'] loop
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "finance read %1$s" on public.%1$I for select to authenticated using (public.is_finance_admin(auth.uid()))', t);
  end loop;
end $$;
grant update on public.finance_funds, public.fund_deduction_rules to authenticated;
create policy "finance write funds" on public.finance_funds for all to authenticated using (public.is_finance_admin(auth.uid())) with check (public.is_finance_admin(auth.uid()));
create policy "finance write rules" on public.fund_deduction_rules for all to authenticated using (public.is_finance_admin(auth.uid())) with check (public.is_finance_admin(auth.uid()));
create policy "finance insert deductions" on public.installment_deductions for insert to authenticated with check (public.is_finance_admin(auth.uid()));
create policy "finance insert versions" on public.fund_allocation_versions for insert to authenticated with check (public.is_finance_admin(auth.uid()));
create policy "finance insert version items" on public.fund_allocation_version_items for insert to authenticated with check (public.is_finance_admin(auth.uid()));
create policy "finance insert audit" on public.fund_audit_logs for insert to authenticated with check (public.is_finance_admin(auth.uid()));

create trigger finance_funds_updated before update on public.finance_funds for each row execute function public.set_updated_at();
create trigger fund_rules_updated before update on public.fund_deduction_rules for each row execute function public.set_updated_at();

create or replace function public.fund_ledger_immutable() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'fund_ledger is append-only; use a reversal entry'; end $$;
create trigger fund_ledger_no_update before update or delete on public.fund_ledger for each row execute function public.fund_ledger_immutable();

-- expenses: nullable fund link (additive)
alter table public.expenses add column if not exists fund_id uuid references public.finance_funds(id);

-- derived balances
create or replace view public.fund_balances with (security_invoker=true) as
select f.id as fund_id, f.code, f.name, f.kind, f.is_active, f.display_order,
  coalesce(sum(l.amount) filter (where l.direction='credit'),0) as total_credits,
  coalesce(sum(l.amount) filter (where l.direction='debit'),0) as total_debits,
  coalesce(sum(case when l.direction='credit' then l.amount else -l.amount end),0) as ledger_balance,
  coalesce(sum(l.amount) filter (where l.transaction_type='allocation' and l.direction='credit'),0)
   - coalesce(sum(l.amount) filter (where l.transaction_type='reversal' and l.direction='debit'),0) as allocation_total,
  coalesce(sum(l.amount) filter (where l.direction='debit' and l.transaction_type not in ('transfer_out','loan_out','reversal','loan_repayment')),0) as spent_total
from public.finance_funds f left join public.fund_ledger l on l.fund_id=f.id
group by f.id;
grant select on public.fund_balances to authenticated;

-- core allocation
create or replace function public.allocate_installment(_installment_id uuid, _actor uuid default null, _source text default 'auto')
returns uuid language plpgsql security definer set search_path=public as $$
declare
  inst record; inv record; v_id uuid; alloc_id uuid; recv numeric; ded numeric := 0; dist numeric;
  r record; amt numeric; running numeric := 0; last_item uuid; n int;
begin
  if _actor is not null and not public.is_finance_admin(_actor) then raise exception 'forbidden'; end if;
  select id into alloc_id from installment_allocations where installment_id=_installment_id and status='active';
  if alloc_id is not null then return alloc_id; end if;
  select * into inst from invoice_installments where id=_installment_id for update;
  if not found or inst.status::text <> 'paid' then raise exception 'installment not paid'; end if;
  select * into inv from invoices where id=inst.invoice_id;
  recv := coalesce(nullif(inst.paid_amount,0), inst.amount);
  select id into v_id from fund_allocation_versions where effective_from <= coalesce(inst.paid_at, now())::date order by effective_from desc, created_at desc limit 1;
  if v_id is null then raise exception 'no allocation version'; end if;
  insert into installment_allocations(installment_id, invoice_id, customer_id, project_id, version_id, received_amount, distributable_amount, source, created_by)
  values (_installment_id, inv.id, inv.customer_id, inv.project_id, v_id, recv, 0, _source, _actor) returning id into alloc_id;
  for r in select name, amount_type, value from fund_deduction_rules where is_active
           union all select coalesce(description, deduction_type), amount_type, value from installment_deductions where installment_id=_installment_id loop
    amt := round(case when r.amount_type='percent' then recv*r.value/100 else r.value end, 2);
    ded := ded + amt;
    insert into installment_allocation_deductions(allocation_id,name,amount_type,value,amount) values (alloc_id,r.name,r.amount_type,r.value,amt);
  end loop;
  dist := greatest(recv - ded, 0);
  update installment_allocations set deduction_total=ded, distributable_amount=dist where id=alloc_id;
  for r in select i.fund_id, f.name, i.percent from fund_allocation_version_items i join finance_funds f on f.id=i.fund_id where i.version_id=v_id and i.percent>0 order by f.display_order loop
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
  insert into fund_audit_logs(user_id,action,record_type,record_id,next) values (_actor,'allocate','installment_allocation',alloc_id,jsonb_build_object('received',recv,'deductions',ded,'distributable',dist,'source',_source));
  return alloc_id;
end $$;

create or replace function public.reverse_installment_allocation(_allocation_id uuid, _reason text)
returns void language plpgsql security definer set search_path=public as $$
declare a record;
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if length(coalesce(_reason,'')) < 5 then raise exception 'reason required'; end if;
  select * into a from installment_allocations where id=_allocation_id and status='active' for update;
  if not found then raise exception 'allocation not active'; end if;
  insert into fund_ledger(fund_id,amount,direction,transaction_type,allocation_id,customer_id,project_id,invoice_id,installment_id,description,notes,created_by)
  select fund_id, amount, 'debit','reversal', a.id, a.customer_id, a.project_id, a.invoice_id, a.installment_id, 'Reversal of allocation', _reason, auth.uid()
  from installment_allocation_items where allocation_id=a.id and amount>0;
  update installment_allocations set status='reversed', reversed_at=now(), reversed_by=auth.uid(), reversal_reason=_reason where id=a.id;
  insert into fund_audit_logs(user_id,action,record_type,record_id,reason) values (auth.uid(),'reverse','installment_allocation',a.id,_reason);
end $$;

create or replace function public.retry_installment_allocation(_installment_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.is_finance_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return public.allocate_installment(_installment_id, auth.uid(), 'manual');
end $$;
revoke execute on function public.allocate_installment(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reverse_installment_allocation(uuid,text), public.retry_installment_allocation(uuid) to authenticated;

create or replace function public.trg_installment_paid_allocate() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status::text='paid' and (tg_op='INSERT' or old.status::text is distinct from 'paid') then
    begin
      perform public.allocate_installment(new.id, null, 'auto');
    exception when others then
      insert into installment_allocation_failures(installment_id,error) values (new.id, sqlerrm)
      on conflict (installment_id) do update set error=excluded.error, attempts=installment_allocation_failures.attempts+1, last_attempt_at=now();
    end;
  end if;
  return new;
end $$;
create trigger installment_paid_fund_allocate after insert or update of status on public.invoice_installments
for each row execute function public.trg_installment_paid_allocate();

-- seed default funds + first version (effective today so legacy stays unallocated)
insert into public.finance_funds(code,name,description,kind,display_order) values
('employee','Employee Fund','Project payments, salary, bonus, incentive','employee',1),
('office','Office & Operations Fund','Rent, internet, electricity, supplies','operating',2),
('software','Software & Subscription Fund','AI tools, SaaS, hosting, domains','operating',3),
('sales','Sales Fund','Internal sales team & operations','operating',4),
('marketing','Marketing Fund','Ads, boosting, campaigns','operating',5),
('tax','Tax & Compliance Fund','Tax, VAT, legal, licenses','operating',6),
('reserve','Emergency Reserve Fund','Emergency use only','reserve',7),
('growth','Growth & Equipment Fund','Equipment, expansion, training','operating',8),
('profit','Company Profit Fund','Retained profit; owner withdrawals only','profit',9);
with v as (insert into public.fund_allocation_versions(name,effective_from,notes) values ('Default 2026', current_date, 'Initial Branta Fund Ledger allocation') returning id)
insert into public.fund_allocation_version_items(version_id,fund_id,percent)
select v.id, f.id, p.pct from v, public.finance_funds f join (values ('employee',35),('office',10),('software',8),('sales',8),('marketing',7),('tax',5),('reserve',7),('growth',5),('profit',15)) p(code,pct) on p.code=f.code;
