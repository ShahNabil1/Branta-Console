
ALTER FUNCTION public.company_task_activity_immutable() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.can_manage_company_tasks(uuid,uuid), public.can_view_company_tasks(uuid,uuid),
  public.company_task_company(uuid), public.is_company_task_assignee(uuid,uuid), public.can_manage_company_task(uuid,uuid),
  public.can_view_company_task(uuid,uuid), public.can_work_company_task(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_company_tasks(uuid,uuid), public.can_view_company_tasks(uuid,uuid),
  public.company_task_company(uuid), public.is_company_task_assignee(uuid,uuid), public.can_manage_company_task(uuid,uuid),
  public.can_view_company_task(uuid,uuid), public.can_work_company_task(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_company_task(), public.validate_company_task_assignee(), public.guard_company_task_subtask(),
  public.validate_company_task_submission(), public.company_task_activity_immutable() FROM PUBLIC, anon, authenticated;
