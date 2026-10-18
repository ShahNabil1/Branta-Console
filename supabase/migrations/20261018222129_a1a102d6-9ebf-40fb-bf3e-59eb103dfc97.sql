CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  roles text[] NOT NULL DEFAULT ARRAY['specialist']::text[],
  added_by uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_project_member_roles() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF array_length(NEW.roles,1) IS NULL THEN RAISE EXCEPTION 'At least one project role is required'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.roles) r WHERE r NOT IN ('project_head','team_lead','qc_checker','specialist')) THEN
    RAISE EXCEPTION 'Invalid project role';
  END IF;
  NEW.roles := ARRAY(SELECT DISTINCT unnest(NEW.roles) ORDER BY 1);
  RETURN NEW;
END $$;
CREATE TRIGGER project_members_validate BEFORE INSERT OR UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_member_roles();
CREATE TRIGGER project_members_updated BEFORE UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.has_project_role(_project_id uuid, _user uuid, _roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members m
    WHERE m.project_id = _project_id AND m.user_id = _user AND m.active AND m.roles && _roles)
$$;
REVOKE EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_project(_project_id uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user,'admin') OR public.has_role(_user,'super_admin') OR public.has_role(_user,'manager')
    OR EXISTS (SELECT 1 FROM public.client_projects p WHERE p.id = _project_id AND (p.created_by = _user OR p.client_manager_id = _user))
    OR public.has_project_role(_project_id, _user, ARRAY['project_head','team_lead'])
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_project(uuid, uuid) TO authenticated;

CREATE POLICY pm_select ON public.project_members FOR SELECT TO authenticated USING (true);
CREATE POLICY pm_insert ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_project(project_id, auth.uid()));
CREATE POLICY pm_update ON public.project_members FOR UPDATE TO authenticated
  USING (public.can_manage_project(project_id, auth.uid())) WITH CHECK (public.can_manage_project(project_id, auth.uid()));

-- Existing task managers + project leadership/QC can manage tasks of that project
CREATE OR REPLACE FUNCTION public.can_manage_task(_task_id uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_tasks t LEFT JOIN public.customers c ON c.id = t.customer_id
    WHERE t.id = _task_id AND (t.created_by = _user OR c.owner_id = _user
      OR public.has_role(_user,'admin') OR public.has_role(_user,'super_admin') OR public.has_role(_user,'manager')
      OR public.has_permission(_user,'lead_assign')
      OR (t.project_id IS NOT NULL AND public.has_project_role(t.project_id, _user, ARRAY['project_head','team_lead','qc_checker'])))
  )
$$;

ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS service_track text,
  ADD COLUMN IF NOT EXISTS track_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sow_doc_url text,
  ADD COLUMN IF NOT EXISTS requirements_doc_url text;

ALTER TABLE public.client_task_submissions
  ADD COLUMN IF NOT EXISTS review_stage text NOT NULL DEFAULT 'internal_qc',
  ADD COLUMN IF NOT EXISTS feedback_doc_url text,
  ADD COLUMN IF NOT EXISTS revision_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS revision_round integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.validate_project_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category NOT IN ('client','internal') THEN RAISE EXCEPTION 'Invalid project category'; END IF;
  IF NEW.service_track IS NOT NULL AND NEW.service_track NOT IN ('web_dev','ai_video','ai_automation','social_media','other') THEN
    RAISE EXCEPTION 'Invalid service track'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_projects_validate_fields BEFORE INSERT OR UPDATE ON public.client_projects
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_fields();

CREATE OR REPLACE FUNCTION public.validate_submission_stage() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.review_stage NOT IN ('internal_qc','client_review') THEN RAISE EXCEPTION 'Invalid review stage'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_task_submissions_validate_stage BEFORE INSERT OR UPDATE ON public.client_task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_submission_stage();

CREATE INDEX IF NOT EXISTS project_members_user_idx ON public.project_members(user_id) WHERE active;