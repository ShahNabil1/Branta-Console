
CREATE TABLE IF NOT EXISTS public.lead_service_options (
  key text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  requires_detail boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_service_options TO authenticated;
GRANT ALL ON public.lead_service_options TO service_role;

ALTER TABLE public.lead_service_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees read lead service options"
  ON public.lead_service_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "super admin manages lead service options"
  ON public.lead_service_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_lead_service_options_updated
  BEFORE UPDATE ON public.lead_service_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.lead_service_options (key, label, sort_order, requires_detail) VALUES
  ('web_development', 'Web Development', 10, false),
  ('mobile_app', 'Mobile App Development', 20, false),
  ('ui_ux_design', 'UI/UX Design', 30, false),
  ('branding', 'Branding & Identity', 40, false),
  ('seo', 'SEO', 50, false),
  ('digital_marketing', 'Digital Marketing', 60, false),
  ('devops_cloud', 'DevOps & Cloud', 70, false),
  ('consulting', 'Consulting', 80, false),
  ('other', 'Other', 999, true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS service_other text;
