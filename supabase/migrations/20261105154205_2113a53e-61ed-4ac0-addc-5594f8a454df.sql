CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

ALTER EXTENSION citext SET SCHEMA extensions;
ALTER FUNCTION public.enforce_lead_contact_limit() SET search_path = public, extensions;
ALTER FUNCTION public.convert_lead_to_customer() SET search_path = public, extensions;

DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;