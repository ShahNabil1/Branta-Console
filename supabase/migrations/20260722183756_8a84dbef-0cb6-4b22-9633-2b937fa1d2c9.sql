
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS customer_access boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_view_all boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_view_detail boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.is_super_admin(_user_id) THEN true
    WHEN _perm = 'lead_delete' THEN COALESCE(
      (SELECT lead_delete FROM public.user_permissions WHERE user_id = _user_id), false)
    WHEN _perm = 'lead_manage' THEN COALESCE(
      (SELECT lead_manage FROM public.user_permissions WHERE user_id = _user_id), true)
    WHEN _perm = 'lead_assign' THEN COALESCE(
      (SELECT lead_assign FROM public.user_permissions WHERE user_id = _user_id), false)
    WHEN _perm = 'customer_access' THEN COALESCE(
      (SELECT customer_access FROM public.user_permissions WHERE user_id = _user_id), true)
    WHEN _perm = 'customer_view_all' THEN COALESCE(
      (SELECT customer_view_all FROM public.user_permissions WHERE user_id = _user_id), true)
    WHEN _perm = 'customer_view_detail' THEN COALESCE(
      (SELECT customer_view_detail FROM public.user_permissions WHERE user_id = _user_id), true)
    ELSE false
  END
$function$;
