-- Branta Console's own OAuth client registrations (Resend DCR). Service-role only.
CREATE TABLE public.oauth_client_registrations (
  provider text PRIMARY KEY,
  client_id text NOT NULL,
  client_secret_enc text,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_client_registrations TO service_role;
ALTER TABLE public.oauth_client_registrations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_oauth_client_registrations_updated BEFORE UPDATE ON public.oauth_client_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-company Resend account connected through OAuth. Rows are deactivated, never deleted.
CREATE TABLE public.company_resend_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  refresh_token_enc text,
  scopes text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  resend_domain_id text,
  resend_domain text,
  setup_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.company_resend_accounts TO service_role;
ALTER TABLE public.company_resend_accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_company_resend_accounts_updated BEFORE UPDATE ON public.company_resend_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
