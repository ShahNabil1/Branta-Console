
-- 1. Convert leads.status enum -> text so admins can add/remove statuses dynamically.
ALTER TABLE public.leads ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.leads ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.leads ALTER COLUMN status SET DEFAULT 'new';

-- 2. Free-text detail for "Other" source (and future custom source annotations).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source_other text;

-- 3. Status options lookup
CREATE TABLE IF NOT EXISTS public.lead_status_options (
  key text PRIMARY KEY,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  color_var text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_status_options TO authenticated;
GRANT ALL ON public.lead_status_options TO service_role;
ALTER TABLE public.lead_status_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees read lead status options"
  ON public.lead_status_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manages lead status options"
  ON public.lead_status_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 4. Source options lookup
CREATE TABLE IF NOT EXISTS public.lead_source_options (
  key text PRIMARY KEY,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  requires_detail boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_source_options TO authenticated;
GRANT ALL ON public.lead_source_options TO service_role;
ALTER TABLE public.lead_source_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees read lead source options"
  ON public.lead_source_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manages lead source options"
  ON public.lead_source_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 5. Seed
INSERT INTO public.lead_status_options (key, label, sort_order, color_var) VALUES
  ('new','New',10,'--color-status-new'),
  ('contacted','Contacted',20,'--color-status-contacted'),
  ('viewed','Viewed',30,'--color-status-viewed'),
  ('qualified','Qualified',40,'--color-status-viewed'),
  ('meeting','Meeting Scheduled',50,'--color-status-meeting'),
  ('proposal_sent','Proposal Sent',60,'--color-status-meeting'),
  ('negotiation','Negotiation',70,'--color-status-meeting'),
  ('on_hold','On Hold',80,'--color-status-contacted'),
  ('converted','Converted',90,'--color-status-converted'),
  ('lost','Lost',100,'--color-status-contacted')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.lead_source_options (key, label, sort_order, requires_detail) VALUES
  ('facebook','Facebook',10,false),
  ('instagram','Instagram',20,false),
  ('linkedin','LinkedIn',30,false),
  ('tiktok','TikTok',40,false),
  ('whatsapp','WhatsApp',50,false),
  ('website','Website',60,false),
  ('referral','Referral',70,false),
  ('direct','Direct',80,false),
  ('other','Other',999,true)
ON CONFLICT (key) DO NOTHING;
