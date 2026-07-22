
ALTER TABLE public.user_permissions DROP COLUMN IF EXISTS lead_edit;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_super_admin(_user_id) THEN true
    WHEN _perm = 'lead_delete' THEN COALESCE(
      (SELECT lead_delete FROM public.user_permissions WHERE user_id = _user_id), false)
    WHEN _perm = 'lead_manage' THEN COALESCE(
      (SELECT lead_manage FROM public.user_permissions WHERE user_id = _user_id), true)
    WHEN _perm = 'lead_assign' THEN COALESCE(
      (SELECT lead_assign FROM public.user_permissions WHERE user_id = _user_id), false)
    ELSE false
  END
$$;
