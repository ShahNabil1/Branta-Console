REVOKE EXECUTE ON FUNCTION public.sync_company_leadership() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC, anon;