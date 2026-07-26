CREATE TABLE public.invoice_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_slug text NOT NULL,
  actor_id uuid NULL,
  action text NOT NULL,
  title text NOT NULL,
  body text NULL,
  related_table text NULL,
  related_id uuid NULL,
  deep_link text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.invoice_activity_logs TO authenticated;
GRANT ALL ON public.invoice_activity_logs TO service_role;

CREATE INDEX invoice_activity_logs_invoice_id_created_at_idx
  ON public.invoice_activity_logs (invoice_id, created_at DESC);
CREATE INDEX invoice_activity_logs_invoice_slug_created_at_idx
  ON public.invoice_activity_logs (invoice_slug, created_at DESC);
CREATE INDEX invoice_activity_logs_actor_created_at_idx
  ON public.invoice_activity_logs (actor_id, created_at DESC);
CREATE INDEX invoice_activity_logs_action_idx
  ON public.invoice_activity_logs (action);

ALTER TABLE public.invoice_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance admins can view all invoice activity"
ON public.invoice_activity_logs
FOR SELECT
TO authenticated
USING (public.is_finance_admin(auth.uid()));

CREATE POLICY "Stakeholders can view their invoice activity"
ON public.invoice_activity_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoice_stakeholders s
    WHERE s.invoice_id = invoice_activity_logs.invoice_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Finance admins can record invoice activity"
ON public.invoice_activity_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE POLICY "Actors can record their own invoice activity"
ON public.invoice_activity_logs
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());
