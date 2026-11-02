CREATE TABLE public.company_email_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('resend','brevo')),
  sender_name text NOT NULL CHECK (char_length(sender_name) BETWEEN 1 AND 80),
  sender_email text NOT NULL CHECK (char_length(sender_email) BETWEEN 3 AND 254),
  api_key_enc text,
  api_key_hint text,
  webhook_secret_enc text,
  webhook_secret_hint text,
  domain text,
  domain_verified_at timestamptz,
  webhook_verified_at timestamptz,
  webhook_events text[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_check jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, provider)
);
-- Secrets live here (encrypted); only server code (service role) may touch this table.
GRANT ALL ON public.company_email_providers TO service_role;
ALTER TABLE public.company_email_providers ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX company_email_providers_one_default ON public.company_email_providers(company_id) WHERE is_default;
CREATE TRIGGER trg_company_email_providers_updated BEFORE UPDATE ON public.company_email_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();