
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sheet_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sheet_sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sheet_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sheet_sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_sheet_source_chk'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_sheet_source_chk
      CHECK (sheet_source IN ('manual','google_sheets'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_sheet_sync_status_chk'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_sheet_sync_status_chk
      CHECK (sheet_sync_status IN ('pending','syncing','synced','failed'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS leads_sheet_sync_status_idx
  ON public.leads (sheet_sync_status)
  WHERE sheet_sync_status IN ('pending','failed');
