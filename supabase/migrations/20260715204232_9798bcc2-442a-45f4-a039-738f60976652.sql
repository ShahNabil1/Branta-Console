
-- Idempotency ledger for MetaMap webhooks
CREATE TABLE IF NOT EXISTS public.kyc_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  verification_id text,
  user_id uuid,
  status text,
  payload_hash text NOT NULL,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kyc_webhook_events TO authenticated;
GRANT ALL ON public.kyc_webhook_events TO service_role;

ALTER TABLE public.kyc_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view webhook events"
ON public.kyc_webhook_events FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS kyc_webhook_events_verification_idx
  ON public.kyc_webhook_events(verification_id);
CREATE INDEX IF NOT EXISTS kyc_webhook_events_processed_at_idx
  ON public.kyc_webhook_events(processed_at DESC);

-- Enable safe upserts of documents per (verification_id, document_type)
CREATE UNIQUE INDEX IF NOT EXISTS kyc_documents_verification_type_uidx
  ON public.kyc_documents(verification_id, document_type)
  WHERE verification_id IS NOT NULL;
