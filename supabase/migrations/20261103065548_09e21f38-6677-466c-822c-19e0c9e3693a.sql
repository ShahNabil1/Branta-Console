CREATE OR REPLACE FUNCTION public.is_company_member(_company uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.company_id = _company AND m.is_active AND (p.user_id = _user OR p.id = _user)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_company(_company uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user,'super_admin') OR public.has_role(_user,'admin')
    OR EXISTS (
      SELECT 1 FROM public.company_members m
      JOIN public.profiles p ON p.id = m.user_id
      WHERE m.company_id = _company AND m.is_active AND m.role = 'super_admin'
        AND (p.user_id = _user OR p.id = _user)
    )
$$;

DROP POLICY IF EXISTS "view company members" ON public.company_members;
CREATE POLICY "view company members" ON public.company_members FOR SELECT TO authenticated
USING (
  public.is_active_employee(auth.uid()) AND (
    public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)
    OR user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    OR public.is_company_member(company_id, auth.uid())
  )
);