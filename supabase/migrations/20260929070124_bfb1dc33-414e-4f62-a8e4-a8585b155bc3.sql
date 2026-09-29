create or replace function public.historical_allocate(_installment_id uuid, _version_id uuid, _deductions jsonb, _reason text, _batch uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  me uuid := auth.uid(); inst record; inv record; ver record; alloc_id uuid; recv numeric; ded numeric := 0; dist numeric;
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
    jsonb_build_object('installment_id',_installment_id,'version_id',ver.id,'version',ver.name,'paid_at',inst.paid_at,'received',recv,'deductions',coalesce(_deductions,'[]'::jsonb),'deduction_total',ded,'distributable',dist,'batch',_batch), _reason);
  return alloc_id;
end $$;
revoke execute on function public.historical_allocate(uuid,uuid,jsonb,text,uuid) from public, anon;
grant execute on function public.historical_allocate(uuid,uuid,jsonb,text,uuid) to authenticated;

create table public.finance_sheet_settings (
  id smallint primary key default 1,
  spreadsheet_id text, spreadsheet_name text,
  scheduled_enabled boolean not null default false,
  last_success_at timestamptz, last_failure_at timestamptz, last_error text,
  updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint finance_sheet_settings_singleton check (id = 1)
);
grant select, insert, update on public.finance_sheet_settings to authenticated;
grant all on public.finance_sheet_settings to service_role;
alter table public.finance_sheet_settings enable row level security;
create policy "Finance manages sheet settings" on public.finance_sheet_settings for all to authenticated
  using (public.is_finance_admin(auth.uid())) with check (public.is_finance_admin(auth.uid()));
create trigger finance_sheet_settings_updated before update on public.finance_sheet_settings for each row execute function public.set_updated_at();

create table public.finance_sheet_sync_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null, tab text not null, status text not null default 'running',
  started_at timestamptz not null default now(), completed_at timestamptz,
  initiated_by uuid, rows_processed int not null default 0, rows_added int not null default 0, rows_updated int not null default 0,
  error text, created_at timestamptz not null default now()
);
grant select, insert, update on public.finance_sheet_sync_logs to authenticated;
grant all on public.finance_sheet_sync_logs to service_role;
alter table public.finance_sheet_sync_logs enable row level security;
create policy "Finance reads sync logs" on public.finance_sheet_sync_logs for select to authenticated using (public.is_finance_admin(auth.uid()));
create policy "Finance writes sync logs" on public.finance_sheet_sync_logs for insert to authenticated with check (public.is_finance_admin(auth.uid()));
create policy "Finance updates sync logs" on public.finance_sheet_sync_logs for update to authenticated using (public.is_finance_admin(auth.uid()));
create index finance_sheet_sync_logs_run_idx on public.finance_sheet_sync_logs(run_id);
create index finance_sheet_sync_logs_started_idx on public.finance_sheet_sync_logs(started_at desc);