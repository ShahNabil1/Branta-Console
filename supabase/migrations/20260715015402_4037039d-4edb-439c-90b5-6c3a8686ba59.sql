
CREATE TABLE public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  email text NOT NULL,
  message_id text,
  subject text,
  reason text,
  tag text,
  link text,
  list_id integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_events_email_occurred_idx
  ON public.email_events (lower(email), occurred_at DESC);

CREATE INDEX email_events_occurred_idx
  ON public.email_events (occurred_at DESC);

GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email events"
  ON public.email_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

ALTER TABLE public.email_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_events;
