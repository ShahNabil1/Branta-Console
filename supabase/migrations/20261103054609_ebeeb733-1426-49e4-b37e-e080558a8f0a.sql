CREATE TABLE public.company_email_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), provider text NOT NULL CHECK (provider IN ('resend','brevo')), recipient text NOT NULL, created_by uuid NOT NULL, message_id text, send_error text, accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.company_email_tests TO service_role;
REVOKE ALL ON public.company_email_tests FROM anon, authenticated;
ALTER TABLE public.company_email_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS _super_admin_god_mode ON public.company_email_tests;
CREATE TABLE public.company_email_test_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), test_id uuid NOT NULL REFERENCES public.company_email_tests(id), event_key text NOT NULL, event text NOT NULL, occurred_at timestamptz NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(test_id,event_key)
);
GRANT SELECT, INSERT ON public.company_email_test_events TO service_role;
REVOKE ALL ON public.company_email_test_events FROM anon, authenticated;
ALTER TABLE public.company_email_test_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS _super_admin_god_mode ON public.company_email_test_events;
CREATE INDEX company_email_tests_company_created ON public.company_email_tests(company_id,created_at DESC);
CREATE INDEX company_email_test_events_test_time ON public.company_email_test_events(test_id,occurred_at,id);
CREATE OR REPLACE FUNCTION public.touch_company_email_test() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER touch_company_email_test BEFORE UPDATE ON public.company_email_tests FOR EACH ROW EXECUTE FUNCTION public.touch_company_email_test();