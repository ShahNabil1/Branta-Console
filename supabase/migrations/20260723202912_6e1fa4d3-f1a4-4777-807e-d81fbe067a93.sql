-- Allow lead creators to always see their own leads/drafts, even if owner_id
-- gets changed (or briefly nulled) via autosave. Without this, editing a
-- draft's Assigned-To or an autosave that flips owner_id can make the row
-- disappear from the creator's view ("Lead not found").
DROP POLICY IF EXISTS leads_select_owner ON public.leads;
CREATE POLICY leads_select_owner
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR created_by = auth.uid());