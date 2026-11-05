-- Branta Tech roles: GA(super_admin) / Accounts(finance) / HR(admin) / C.E.O(manager) / C.O.O(coo) / Executive(user).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coo';

-- C.O.O behaves exactly like C.E.O (manager) in every existing role check.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (_role::text = 'manager' AND role::text = 'coo'))
  )
$function$;

-- C.E.O / C.O.O get full Branta Tech finance CRUD alongside GA, HR and Accounts.
CREATE OR REPLACE FUNCTION public.is_finance_admin(_user_id uuid DEFAULT auth.uid())
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text IN ('finance','super_admin','admin','manager','coo'))
$function$;
