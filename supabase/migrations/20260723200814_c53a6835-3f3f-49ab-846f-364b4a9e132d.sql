
-- 1. Add is_draft column
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- 2. Backfill: mark existing "Untitled lead" sentinels as drafts, everything else stays non-draft
UPDATE public.leads SET is_draft = true WHERE name = 'Untitled lead';

-- 3. New draft leads should default to is_draft = true going forward
ALTER TABLE public.leads ALTER COLUMN is_draft SET DEFAULT true;

-- 4. Allow the creator of a draft to delete their own draft even without lead_delete permission
DROP POLICY IF EXISTS leads_delete_own_draft ON public.leads;
CREATE POLICY leads_delete_own_draft
  ON public.leads
  FOR DELETE
  TO authenticated
  USING (is_draft = true AND created_by = auth.uid());

-- 5. Helpful index for the Drafts page
CREATE INDEX IF NOT EXISTS leads_is_draft_created_by_idx
  ON public.leads (is_draft, created_by, updated_at DESC);
