REVOKE EXECUTE ON FUNCTION public.is_company_finance_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_finance_member(uuid, uuid) TO authenticated;