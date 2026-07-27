
ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS deferred_until timestamptz;

CREATE INDEX IF NOT EXISTS notification_events_retry_idx
  ON public.notification_events (status, next_attempt_at)
  WHERE status = 'retry';

CREATE INDEX IF NOT EXISTS notification_events_deferred_idx
  ON public.notification_events (status, deferred_until)
  WHERE status = 'deferred';
