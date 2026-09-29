revoke all on function public.efp_allocation_limit() from public, anon, authenticated;
revoke all on function public.block_stakeholders_fund_ledger() from public, anon, authenticated;
revoke all on function public.sync_payouts_on_installment() from public, anon, authenticated;
revoke all on function public.sync_payouts_on_stakeholder() from public, anon, authenticated;
revoke all on function public.installment_project_cost_share(uuid,numeric,uuid) from public, anon, authenticated;
revoke all on function public.allocate_installment(uuid,uuid,text) from public, anon;
revoke all on function public.historical_allocate(uuid,uuid,jsonb,text,uuid) from public, anon;
grant execute on function public.allocate_installment(uuid,uuid,text) to authenticated, service_role;
grant execute on function public.historical_allocate(uuid,uuid,jsonb,text,uuid) to authenticated, service_role;