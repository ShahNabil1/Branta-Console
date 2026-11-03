REVOKE EXECUTE ON FUNCTION public.expenses_default_company() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_company_finance(uuid,uuid) FROM PUBLIC, anon;