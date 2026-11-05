-- Sister-company C.O.O (company_members.role = 'coo') has the same full control as C.E.O ('super_admin').
CREATE OR REPLACE FUNCTION public.can_manage_company(_company uuid, _user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user,'super_admin') OR public.has_role(_user,'admin')
    OR EXISTS (
      SELECT 1 FROM public.company_members m
      JOIN public.profiles p ON p.id = m.user_id
      WHERE m.company_id = _company AND m.is_active AND m.role IN ('super_admin','coo')
        AND (p.user_id = _user OR p.id = _user)
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_any_company_manager(_user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members m JOIN public.profiles p ON p.id = m.user_id
    WHERE m.is_active AND m.role IN ('super_admin','coo') AND (p.user_id = _user OR p.id = _user)
  )
$function$;
