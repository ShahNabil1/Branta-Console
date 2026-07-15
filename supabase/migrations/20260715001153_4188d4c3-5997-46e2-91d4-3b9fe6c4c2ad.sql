
-- Fix search_path on helpers that lacked it
ALTER FUNCTION public.apply_super_admin_bypass(text, text) SET search_path = public;
ALTER FUNCTION public.auto_apply_super_admin_bypass() SET search_path = public;

-- Revoke public execute on privileged helpers (RLS uses SECURITY DEFINER internally, no need for direct callers)
REVOKE ALL ON FUNCTION public.apply_super_admin_bypass(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_super_admin_on_signup() FROM PUBLIC, anon, authenticated;

-- has_role and is_super_admin are used inside RLS policies (which run as the policy owner),
-- but signed-in users may also legitimately call has_role for UI gating. Keep authenticated execute, revoke anon.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
