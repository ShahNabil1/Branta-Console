ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS handover jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS handed_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS handed_over_by uuid;