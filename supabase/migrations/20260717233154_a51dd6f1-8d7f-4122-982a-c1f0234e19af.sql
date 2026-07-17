ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS service_other text;