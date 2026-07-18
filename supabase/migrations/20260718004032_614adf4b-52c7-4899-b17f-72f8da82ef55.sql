ALTER TABLE public.lead_meetings
  ADD COLUMN IF NOT EXISTS reminder_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS attendee_responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rsvp_synced_at timestamptz;