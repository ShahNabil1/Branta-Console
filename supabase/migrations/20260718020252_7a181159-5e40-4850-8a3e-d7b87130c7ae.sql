-- Audit log for admin impersonation sessions.
CREATE TABLE public.impersonation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  admin_email text NOT NULL,
  target_user_id uuid NOT NULL,
  target_email text NOT NULL,
  action text NOT NULL CHECK (action IN ('start','end')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.impersonation_events (created_at DESC);
CREATE INDEX ON public.impersonation_events (admin_user_id);
CREATE INDEX ON public.impersonation_events (target_user_id);

GRANT SELECT ON public.impersonation_events TO authenticated;
GRANT ALL ON public.impersonation_events TO service_role;

ALTER TABLE public.impersonation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view impersonation events"
  ON public.impersonation_events FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));