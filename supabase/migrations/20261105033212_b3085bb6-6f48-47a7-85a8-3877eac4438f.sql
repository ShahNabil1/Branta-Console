CREATE OR REPLACE FUNCTION public.can_view_company_finance(_company uuid, _user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_finance_admin(_user) OR public.can_manage_company(_company, _user)
    OR EXISTS (
      SELECT 1 FROM public.company_members m JOIN public.profiles p ON p.id = m.user_id
      WHERE m.company_id = _company AND m.is_active AND m.role = 'finance'
        AND (p.user_id = _user OR p.id = _user)
    )
$$;