-- 1) Lead option lists: active employees only ---------------------------------
DROP POLICY IF EXISTS "employees read lead service options" ON public.lead_service_options;
CREATE POLICY "employees read lead service options" ON public.lead_service_options
  FOR SELECT TO authenticated USING (public.is_active_employee(auth.uid()));

DROP POLICY IF EXISTS "employees read lead source options" ON public.lead_source_options;
CREATE POLICY "employees read lead source options" ON public.lead_source_options
  FOR SELECT TO authenticated USING (public.is_active_employee(auth.uid()));

DROP POLICY IF EXISTS "employees read lead status options" ON public.lead_status_options;
CREATE POLICY "employees read lead status options" ON public.lead_status_options
  FOR SELECT TO authenticated USING (public.is_active_employee(auth.uid()));

-- 2) Scheduler credential for the invoice-reminders hook ----------------------
CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS internal.cron_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON internal.cron_tokens FROM PUBLIC, anon, authenticated;

INSERT INTO internal.cron_tokens (name, token)
VALUES ('invoice-reminders',
        replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO UPDATE SET token = EXCLUDED.token, created_at = now();

CREATE OR REPLACE FUNCTION public.verify_cron_token(_name text, _token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, internal AS $$
  SELECT coalesce(length(_token), 0) >= 64
     AND EXISTS (SELECT 1 FROM internal.cron_tokens t WHERE t.name = _name AND t.token = _token)
$$;
REVOKE EXECUTE ON FUNCTION public.verify_cron_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text, text) TO service_role;

-- Reschedule the daily job to send the scheduler token (POST only).
DO $$
BEGIN
  PERFORM cron.unschedule('invoice-reminders-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'invoice-reminders-daily',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--0b934a6f-9f9d-47f8-b76c-960a68b43f5a.lovable.app/api/public/hooks/invoice-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT token FROM internal.cron_tokens WHERE name = 'invoice-reminders')
    ),
    body := '{}'::jsonb
  );
  $cron$
);