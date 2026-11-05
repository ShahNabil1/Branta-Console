CREATE TABLE public.company_cloudflare_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  cf_email text,
  cf_user_id text,
  account_ids text[] NOT NULL DEFAULT '{}',
  account_names text[] NOT NULL DEFAULT '{}',
  refresh_token_enc text,
  scopes text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.company_cloudflare_accounts TO service_role;
ALTER TABLE public.company_cloudflare_accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_company_cloudflare_accounts_updated BEFORE UPDATE ON public.company_cloudflare_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();