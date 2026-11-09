
CREATE TABLE public.company_project_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
GRANT SELECT, INSERT, UPDATE ON public.company_project_roles TO authenticated;
GRANT ALL ON public.company_project_roles TO service_role;
ALTER TABLE public.company_project_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY cpr_select ON public.company_project_roles FOR SELECT TO authenticated USING (public.is_active_employee(auth.uid()));
CREATE POLICY cpr_write ON public.company_project_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

INSERT INTO public.company_project_roles (company_id, key, label, position) VALUES
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','ai_director','AI Director',10),
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','script_writer','Script Writer',11),
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','storyboard_artist','Storyboard Artist',12),
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','ai_image_generator','AI Image Generator',13),
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','video_generator','Video Generator',14),
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','video_editor','Video Editor',15),
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','motion_graphics','Motion Graphics Designer',16),
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','voiceover_artist','Voiceover Artist',17),
 ('16c0cf89-7bc4-4df0-9c72-27eec94e7e1c','sound_designer','Sound Designer',18);

CREATE TABLE public.project_work_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  link text,
  note text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.project_work_updates TO authenticated;
GRANT ALL ON public.project_work_updates TO service_role;
ALTER TABLE public.project_work_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY pwu_select ON public.project_work_updates FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
CREATE POLICY pwu_insert ON public.project_work_updates FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_view_project(project_id, auth.uid()));
CREATE INDEX ON public.project_work_updates(project_id, created_at DESC);

CREATE TABLE public.project_update_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.project_work_updates(id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.project_update_comments TO authenticated;
GRANT ALL ON public.project_update_comments TO service_role;
ALTER TABLE public.project_update_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY puc_select ON public.project_update_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_work_updates u WHERE u.id = update_id AND public.can_view_project(u.project_id, auth.uid())));
CREATE POLICY puc_insert ON public.project_update_comments FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.project_work_updates u WHERE u.id = update_id AND public.can_view_project(u.project_id, auth.uid())));
CREATE INDEX ON public.project_update_comments(update_id, created_at);
