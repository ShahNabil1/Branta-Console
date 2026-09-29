revoke execute on function public.trg_installment_paid_allocate() from public, anon, authenticated;
revoke execute on function public.reverse_installment_allocation(uuid,text) from public, anon;
revoke execute on function public.retry_installment_allocation(uuid) from public, anon;
revoke execute on function public.fund_ledger_immutable() from public, anon, authenticated;