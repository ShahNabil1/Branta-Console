INSERT INTO public.company_members (company_id, user_id, role, is_active)
SELECT public.holding_company_id(), p.id, 'member', true
FROM public.profiles p
WHERE p.deactivated_at IS NULL
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id)
  AND public.holding_company_id() IS NOT NULL
ON CONFLICT (company_id, user_id) DO NOTHING;