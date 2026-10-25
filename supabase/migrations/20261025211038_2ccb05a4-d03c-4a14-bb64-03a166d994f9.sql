CREATE TABLE public.connected_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app text NOT NULL CHECK (app IN ('tracker_extension')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_authorized_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, app)
);
GRANT SELECT, UPDATE ON public.connected_apps TO authenticated;
GRANT ALL ON public.connected_apps TO service_role;
ALTER TABLE public.connected_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_select_own ON public.connected_apps FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ca_update_own ON public.connected_apps FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.connected_apps_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER connected_apps_touch BEFORE UPDATE ON public.connected_apps FOR EACH ROW EXECUTE FUNCTION public.connected_apps_touch();