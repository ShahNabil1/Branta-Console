REVOKE EXECUTE ON FUNCTION public.is_task_assignee(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_task(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_task_assignee(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_task(uuid, uuid) TO authenticated;