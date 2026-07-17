
-- 1. Enum for status
DO $$ BEGIN
  CREATE TYPE public.lead_status AS ENUM ('new','contacted','viewed','meeting','converted','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Sequence for readable lead codes (L-0001, L-0002, ...)
CREATE SEQUENCE IF NOT EXISTS public.lead_code_seq START 4822;

-- 3. leads table
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code text NOT NULL UNIQUE DEFAULT ('L-' || lpad(nextval('public.lead_code_seq')::text, 4, '0')),
  name text NOT NULL,
  company text,
  email text,
  phone text,
  status public.lead_status NOT NULL DEFAULT 'new',
  source text,
  owner_id uuid,
  value_usd numeric(12,2),
  next_action text,
  notes text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_status_idx        ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_owner_idx         ON public.leads(owner_id);
CREATE INDEX IF NOT EXISTS leads_last_activity_idx ON public.leads(last_activity_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lead_code_seq TO authenticated;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_all_authenticated" ON public.leads;
CREATE POLICY "leads_select_all_authenticated"
  ON public.leads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "leads_insert_authenticated" ON public.leads;
CREATE POLICY "leads_insert_authenticated"
  ON public.leads FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "leads_update_owner_or_admin" ON public.leads;
CREATE POLICY "leads_update_owner_or_admin"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "leads_delete_owner_or_admin" ON public.leads;
CREATE POLICY "leads_delete_owner_or_admin"
  ON public.leads FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_leads_set_updated_at ON public.leads;
CREATE TRIGGER trg_leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. lead_activities
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id uuid,
  kind text NOT NULL DEFAULT 'note',
  body text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_activities_lead_idx    ON public.lead_activities(lead_id, created_at DESC);

GRANT SELECT, INSERT ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_act_select_authenticated" ON public.lead_activities;
CREATE POLICY "lead_act_select_authenticated"
  ON public.lead_activities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lead_act_insert_authenticated" ON public.lead_activities;
CREATE POLICY "lead_act_insert_authenticated"
  ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- 5. Bump lead.last_activity_at whenever a new activity lands
CREATE OR REPLACE FUNCTION public.bump_lead_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
     SET last_activity_at = NEW.created_at
   WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_activities_bump ON public.lead_activities;
CREATE TRIGGER trg_lead_activities_bump
  AFTER INSERT ON public.lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.bump_lead_last_activity();

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activities;
