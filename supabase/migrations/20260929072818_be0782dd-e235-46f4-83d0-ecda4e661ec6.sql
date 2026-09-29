
alter table public.invoices add column if not exists fund_ledger_mode boolean not null default false;
alter table public.invoices alter column fund_ledger_mode set default true;

alter table public.employee_fund_payments add column if not exists allocation_id uuid references public.installment_allocations(id);
create index if not exists efp_allocation_idx on public.employee_fund_payments(allocation_id);

-- proportional project-cost share for an installment payment
create or replace function public.installment_project_cost_share(_installment_id uuid, _received numeric, _exclude_alloc uuid default null)
returns numeric language plpgsql stable security definer set search_path=public as $$
declare inv record; share numeric; used numeric;
begin
  select i.* into inv from invoices i join invoice_installments s on s.invoice_id=i.id where s.id=_installment_id;
  if not found or coalesce(inv.total_amount,0) <= 0 or coalesce(inv.project_cost_total,0) <= 0 then return 0; end if;
  share := round(_received * least(inv.project_cost_total, inv.total_amount) / inv.total_amount, 2);
  select coalesce(sum(d.amount),0) into used from installment_allocation_deductions d join installment_allocations a on a.id=d.allocation_id
   where a.invoice_id=inv.id and a.status='active' and d.amount_type='project_cost' and a.installment_id<>_installment_id and (_exclude_alloc is null or a.id<>_exclude_alloc);
  return greatest(least(share, inv.project_cost_total - used), 0);
end $$;
revoke all on function public.installment_project_cost_share(uuid,numeric,uuid) from public, anon;
grant execute on function public.installment_project_cost_share(uuid,numeric,uuid) to authenticated, service_role;

create or replace function public.allocate_installment(_installment_id uuid, _actor uuid default null, _source text default 'auto')
returns uuid language plpgsql security definer set search_path=public as $$
declare
  inst record; inv record; v_id uuid; alloc_id uuid; recv numeric; ded numeric := 0; dist numeric; pc numeric;
  r record; amt numeric; running numeric := 0; last_item uuid;
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
  insert into fund_audit_logs(user_id,action,record_type,record_id,next) values (_actor,'allocate','installment_allocation',alloc_id,jsonb_build_object('received',recv,'project_cost_share',pc,'deductions',ded,'distributable',dist,'source',_source));
  return alloc_id;
end $$;

create or replace function public.historical_allocate(_installment_id uuid, _version_id uuid, _deductions jsonb, _reason text, _batch uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  me uuid := auth.uid(); inst record; inv record; ver record; alloc_id uuid; recv numeric; ded numeric := 0; dist numeric; pc numeric;
  r record; d jsonb; amt numeric; running numeric := 0; last_item uuid;
begin
  if me is null or not public.is_finance_admin(me) then raise exception 'forbidden'; end if;
  if coalesce(length(trim(_reason)),0) < 5 then raise exception 'Reason (min 5 characters) required'; end if;
  perform pg_advisory_xact_lock(hashtext('hist_alloc:'||_installment_id::text));
  select id into alloc_id from installment_allocations where installment_id=_installment_id and status='active';
  if alloc_id is not null then return alloc_id; end if;
  select * into inst from invoice_installments where id=_installment_id for update;
  if not found or inst.status::text <> 'paid' then raise exception 'Installment is not paid'; end if;
  select * into inv from invoices where id=inst.invoice_id;
  if inv.status::text = 'void' then raise exception 'Invoice is void'; end if;
  if inv.currency <> 'BDT' then raise exception 'Not eligible: % payment has no stored BDT conversion', inv.currency; end if;
  select * into ver from fund_allocation_versions where id=_version_id;
  if not found then raise exception 'Allocation version not found'; end if;
  recv := coalesce(nullif(inst.paid_amount,0), inst.amount);
  insert into installment_allocations(installment_id, invoice_id, customer_id, project_id, version_id, received_amount, distributable_amount, source, created_by)
  values (_installment_id, inv.id, inv.customer_id, inv.project_id, ver.id, recv, 0, 'historical', me) returning id into alloc_id;
  pc := public.installment_project_cost_share(_installment_id, recv, alloc_id);
  if pc > 0 then
    ded := pc;
    insert into installment_allocation_deductions(allocation_id,name,amount_type,value,amount) values (alloc_id,'Project cost share','project_cost',inv.project_cost_total,pc);
  end if;
  for d in select * from jsonb_array_elements(coalesce(_deductions,'[]'::jsonb)) loop
    amt := round((d->>'amount')::numeric, 2);
    if amt is null or amt < 0 then raise exception 'Invalid deduction amount'; end if;
    if amt = 0 then continue; end if;
    ded := ded + amt;
    insert into installment_allocation_deductions(allocation_id,name,amount_type,value,amount) values (alloc_id, coalesce(nullif(trim(d->>'name'),''),'Other Direct Deduction'), 'fixed', amt, amt);
  end loop;
  if ded > recv then raise exception 'Deductions (%) exceed received amount (%)', ded, recv; end if;
  dist := recv - ded;
  update installment_allocations set deduction_total=ded, distributable_amount=dist where id=alloc_id;
  for r in select i.fund_id, f.name, i.percent from fund_allocation_version_items i join finance_funds f on f.id=i.fund_id where i.version_id=ver.id and i.percent>0 order by f.display_order loop
    amt := round(dist*r.percent/100, 2); running := running + amt;
    insert into installment_allocation_items(allocation_id,fund_id,fund_name,percent,amount) values (alloc_id,r.fund_id,r.name,r.percent,amt) returning id into last_item;
  end loop;
  if last_item is null then raise exception 'Allocation version has no fund percentages'; end if;
  if running <> dist then update installment_allocation_items set amount = amount + (dist - running) where id=last_item; end if;
  insert into fund_ledger(fund_id,amount,direction,transaction_type,allocation_id,customer_id,project_id,invoice_id,installment_id,reference,description,notes,created_by)
  select fund_id, amount, 'credit','allocation', alloc_id, inv.customer_id, inv.project_id, inv.id, _installment_id, inv.slug,
         'Historical allocation · '||coalesce(inst.label,'Installment '||inst.sequence), _reason, me
  from installment_allocation_items where allocation_id=alloc_id and amount>0;
  delete from installment_allocation_failures where installment_id=_installment_id;
  insert into fund_audit_logs(user_id,action,record_type,record_id,next,reason) values (me,'historical_allocation_created','installment_allocation',alloc_id,
    jsonb_build_object('installment_id',_installment_id,'version_id',ver.id,'version',ver.name,'paid_at',inst.paid_at,'received',recv,'project_cost_share',pc,'deductions',coalesce(_deductions,'[]'::jsonb),'deduction_total',ded,'distributable',dist,'batch',_batch), _reason);
  return alloc_id;
end $$;

-- Reverse a wrong-base allocation and re-create it with the corrected base
create or replace function public.correct_allocation_base(_allocation_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); a record; new_id uuid;
begin
  if me is null or not public.is_finance_admin(me) then raise exception 'forbidden'; end if;
  if coalesce(length(trim(_reason)),0) < 5 then raise exception 'Reason (min 5 characters) required'; end if;
  select * into a from installment_allocations where id=_allocation_id and status='active' for update;
  if not found then raise exception 'Allocation is not active'; end if;
  if a.source = 'historical' then raise exception 'Historical allocations are corrected from Historical Allocation (reverse, then re-allocate)'; end if;
  if exists (select 1 from employee_fund_payments where allocation_id=a.id and status<>'cancelled') then
    raise exception 'Employee payouts are assigned to this allocation; cancel them first';
  end if;
  perform public.reverse_installment_allocation(a.id, 'Base correction: '||_reason);
  new_id := public.allocate_installment(a.installment_id, me, 'correction');
  update installment_allocations set replaces_allocation_id=a.id where id=new_id;
  insert into fund_audit_logs(user_id,action,record_type,record_id,previous,next,reason) values (me,'allocation_base_corrected','installment_allocation',new_id,
    jsonb_build_object('allocation_id',a.id,'distributable',a.distributable_amount),
    jsonb_build_object('allocation_id',new_id,'distributable',(select distributable_amount from installment_allocations where id=new_id)), _reason);
  return new_id;
end $$;
revoke all on function public.correct_allocation_base(uuid,text) from public, anon;
grant execute on function public.correct_allocation_base(uuid,text) to authenticated, service_role;

-- Employee Fund payout pool per allocation (creates Draft employee fund payments)
create or replace function public.assign_allocation_employee_payouts(_allocation_id uuid, _mode text, _rows jsonb, _note text)
returns int language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); a record; pool numeric; used numeric; tot numeric := 0; r jsonb; amt numeric; n int := 0; cnt int; i int := 0; pct_sum numeric := 0; running numeric := 0;
begin
  if me is null or not public.is_finance_admin(me) then raise exception 'forbidden'; end if;
  if _mode not in ('fixed','percent') then raise exception 'Invalid mode'; end if;
  select * into a from installment_allocations where id=_allocation_id and status='active' for update;
  if not found then raise exception 'Allocation is not active'; end if;
  select coalesce(sum(it.amount),0) into pool from installment_allocation_items it join finance_funds f on f.id=it.fund_id where it.allocation_id=a.id and f.code='employee';
  select coalesce(sum(amount),0) into used from employee_fund_payments where allocation_id=a.id and status<>'cancelled';
  cnt := jsonb_array_length(coalesce(_rows,'[]'::jsonb));
  if cnt = 0 then raise exception 'No employees'; end if;
  if _mode='percent' then
    select coalesce(sum((x->>'value')::numeric),0) into pct_sum from jsonb_array_elements(_rows) x;
    if pct_sum > 100 then raise exception 'Percentages exceed 100%% of Employee Fund'; end if;
  end if;
  for r in select * from jsonb_array_elements(_rows) loop
    i := i + 1;
    if (r->>'employee_id') is null then raise exception 'Employee required'; end if;
    if _mode='fixed' then amt := round((r->>'value')::numeric, 2);
    else
      amt := round(pool * (r->>'value')::numeric / 100, 2);
      if i = cnt and pct_sum = 100 then amt := round(pool,2) - running; end if;
    end if;
    running := running + amt;
    if amt is null or amt <= 0 then raise exception 'Invalid amount'; end if;
    tot := tot + amt;
    insert into employee_fund_payments(employee_id,payment_type,amount,project_id,invoice_id,allocation_id,description,notes,status,created_by)
    values ((r->>'employee_id')::uuid,'project_payment',amt,a.project_id,a.invoice_id,a.id,
            'Employee Fund payout'||case when _mode='percent' then ' · '||(r->>'value')||'% of Employee Fund' else '' end, _note, 'draft', me);
    n := n + 1;
  end loop;
  if used + tot > pool + 0.005 then
    raise exception 'EXCEEDS_EMPLOYEE_ALLOCATION: allocated %, already assigned %, requested %, remaining %', pool, used, tot, pool-used;
  end if;
  insert into fund_audit_logs(user_id,action,record_type,record_id,next,reason) values (me,'employee_payout_assigned','installment_allocation',a.id,jsonb_build_object('mode',_mode,'rows',_rows,'total',tot,'pool',pool),_note);
  return n;
end $$;
revoke all on function public.assign_allocation_employee_payouts(uuid,text,jsonb,text) from public, anon;
grant execute on function public.assign_allocation_employee_payouts(uuid,text,jsonb,text) to authenticated, service_role;

-- Guard: any path linking a payment to an allocation must stay within its Employee Fund amount
create or replace function public.efp_allocation_limit() returns trigger language plpgsql security definer set search_path=public as $$
declare pool numeric; used numeric;
begin
  if NEW.allocation_id is null or NEW.status='cancelled' then return NEW; end if;
  select coalesce(sum(it.amount),0) into pool from installment_allocation_items it join finance_funds f on f.id=it.fund_id where it.allocation_id=NEW.allocation_id and f.code='employee';
  select coalesce(sum(amount),0) into used from employee_fund_payments where allocation_id=NEW.allocation_id and status<>'cancelled' and id<>NEW.id;
  if used + NEW.amount > pool + 0.005 then
    raise exception 'EXCEEDS_EMPLOYEE_ALLOCATION: allocated %, already assigned %, requested %', pool, used, NEW.amount;
  end if;
  return NEW;
end $$;
drop trigger if exists efp_allocation_limit on public.employee_fund_payments;
create constraint trigger efp_allocation_limit after insert or update on public.employee_fund_payments deferrable initially deferred for each row execute function public.efp_allocation_limit();

-- Stakeholder payouts: unchanged for legacy invoices; not created for Fund Ledger invoices
create or replace function public.sync_payouts_on_installment() returns trigger language plpgsql security definer set search_path=public as $$
DECLARE cur_currency text; inv_status text; inv_total numeric; inv_cost numeric; ratio numeric; fl boolean;
BEGIN
  SELECT currency, status, total_amount, COALESCE(project_cost_total, 0), fund_ledger_mode
    INTO cur_currency, inv_status, inv_total, inv_cost, fl FROM public.invoices WHERE id = NEW.invoice_id;
  IF fl THEN RETURN NEW; END IF;
  ratio := CASE WHEN COALESCE(inv_total, 0) > 0 THEN GREATEST(inv_total - COALESCE(inv_cost, 0), 0) / inv_total ELSE 1 END;
  DELETE FROM public.invoice_payouts WHERE installment_id = NEW.id;
  INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
  SELECT NEW.invoice_id, NEW.id, s.id, s.user_id, s.role, cur_currency,
    round(NEW.amount * ratio * s.percent / 100.0, 2),
    CASE WHEN inv_status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
    CASE WHEN inv_status = 'paid' THEN now() ELSE NULL END
  FROM public.invoice_stakeholders s WHERE s.invoice_id = NEW.invoice_id;
  RETURN NEW;
END $$;

create or replace function public.sync_payouts_on_stakeholder() returns trigger language plpgsql security definer set search_path=public as $$
DECLARE inv_id uuid; inst RECORD; cur_currency text; inv_status text; inv_total numeric; inv_cost numeric; ratio numeric; fl boolean;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT currency, status, total_amount, COALESCE(project_cost_total, 0), fund_ledger_mode
    INTO cur_currency, inv_status, inv_total, inv_cost, fl FROM public.invoices WHERE id = inv_id;
  IF fl THEN RETURN NULL; END IF;
  ratio := CASE WHEN COALESCE(inv_total, 0) > 0 THEN GREATEST(inv_total - COALESCE(inv_cost, 0), 0) / inv_total ELSE 1 END;
  FOR inst IN SELECT * FROM public.invoice_installments WHERE invoice_id = inv_id LOOP
    DELETE FROM public.invoice_payouts WHERE installment_id = inst.id;
    INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
    SELECT inv_id, inst.id, s.id, s.user_id, s.role, cur_currency,
      round(inst.amount * ratio * s.percent / 100.0, 2),
      CASE WHEN inv_status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
      CASE WHEN inv_status = 'paid' THEN now() ELSE NULL END
    FROM public.invoice_stakeholders s WHERE s.invoice_id = inv_id;
  END LOOP;
  RETURN NULL;
END $$;

-- Block new stakeholder splits on Fund Ledger invoices
create or replace function public.block_stakeholders_fund_ledger() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from invoices where id=NEW.invoice_id and fund_ledger_mode) then
    raise exception 'FUND_LEDGER_INVOICE: stakeholder splits are not used; assign employee payouts from the Employee Fund allocation';
  end if;
  return NEW;
end $$;
drop trigger if exists block_stakeholders_fund_ledger on public.invoice_stakeholders;
create trigger block_stakeholders_fund_ledger before insert or update on public.invoice_stakeholders for each row execute function public.block_stakeholders_fund_ledger();
