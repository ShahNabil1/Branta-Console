ALTER TABLE public.lead_emails DROP CONSTRAINT lead_emails_status_check;
ALTER TABLE public.lead_emails ADD CONSTRAINT lead_emails_status_check CHECK (status = ANY (ARRAY['draft'::text,'queued'::text,'sending'::text,'sent'::text,'failed'::text,'received'::text]));
CREATE INDEX IF NOT EXISTS lead_emails_status_created_idx ON public.lead_emails (status, created_at);