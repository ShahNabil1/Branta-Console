
-- 1) user_permissions table with per-toggle booleans
CREATE TABLE public.user_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_delete boolean NOT NULL DEFAULT false,
  lead_manage boolean NOT NULL DEFAULT true,
  lead_edit   boolean NOT NULL DEFAULT true,
  lead_assign boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Every authenticated user can read their own permissions row.
CREATE POLICY "read_own_permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- (super_admin god_mode ALL policy is auto-added by the event trigger.)

CREATE TRIGGER user_permissions_touch
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) has_permission helper (SECURITY DEFINER so RLS on user_permissions
--    doesn't have to grant read-any). Super admins always pass.
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
    WHEN _perm = 'lead_edit' THEN COALESCE(
      (SELECT lead_edit   FROM public.user_permissions WHERE user_id = _user_id), true)
    WHEN _perm = 'lead_assign' THEN COALESCE(
      (SELECT lead_assign FROM public.user_permissions WHERE user_id = _user_id), false)
    ELSE false
  END
$$;

-- 3) Tighten the leads DELETE policy: owner can delete only when they
--    have the lead_delete permission. Super admins keep god_mode.
DROP POLICY IF EXISTS "leads_delete_owner" ON public.leads;
CREATE POLICY "leads_delete_owner_with_perm" ON public.leads
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() AND public.has_permission(auth.uid(), 'lead_delete'));
