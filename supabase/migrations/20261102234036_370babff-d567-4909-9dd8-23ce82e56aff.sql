CREATE TABLE public.company_inbox_addresses (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  verified_at timestamptz,
  probe_code text,
  probe_started_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.company_inbox_addresses FROM anon, authenticated;
GRANT ALL ON public.company_inbox_addresses TO service_role;
ALTER TABLE public.company_inbox_addresses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_company_inbox_addresses_updated BEFORE UPDATE ON public.company_inbox_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();