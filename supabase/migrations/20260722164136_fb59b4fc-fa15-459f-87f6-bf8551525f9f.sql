
-- Tighten leads visibility: only assigned owner (or super_admin via god_mode) can see/mutate.
DROP POLICY IF EXISTS leads_select_all_authenticated ON public.leads;
DROP POLICY IF EXISTS leads_update_owner_or_admin ON public.leads;
DROP POLICY IF EXISTS leads_delete_owner_or_admin ON public.leads;

CREATE POLICY leads_select_owner ON public.leads FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY leads_update_owner ON public.leads FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY leads_delete_owner ON public.leads FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Helper: is caller the owner of a given lead?
CREATE OR REPLACE FUNCTION public.is_lead_owner(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.leads WHERE id = _lead_id AND owner_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.is_lead_owner(uuid) TO authenticated;

-- lead_contacts
DROP POLICY IF EXISTS "Employees can read all lead contacts" ON public.lead_contacts;
DROP POLICY IF EXISTS "Employees can insert lead contacts" ON public.lead_contacts;
DROP POLICY IF EXISTS "Employees can update lead contacts" ON public.lead_contacts;
DROP POLICY IF EXISTS "Employees can delete lead contacts" ON public.lead_contacts;
CREATE POLICY lead_contacts_select_owner ON public.lead_contacts FOR SELECT TO authenticated USING (public.is_lead_owner(lead_id));
CREATE POLICY lead_contacts_insert_owner ON public.lead_contacts FOR INSERT TO authenticated WITH CHECK (public.is_lead_owner(lead_id));
CREATE POLICY lead_contacts_update_owner ON public.lead_contacts FOR UPDATE TO authenticated USING (public.is_lead_owner(lead_id)) WITH CHECK (public.is_lead_owner(lead_id));
CREATE POLICY lead_contacts_delete_owner ON public.lead_contacts FOR DELETE TO authenticated USING (public.is_lead_owner(lead_id));

-- lead_activities
DROP POLICY IF EXISTS lead_act_select_authenticated ON public.lead_activities;
DROP POLICY IF EXISTS lead_act_insert_authenticated ON public.lead_activities;
CREATE POLICY lead_act_select_owner ON public.lead_activities FOR SELECT TO authenticated USING (public.is_lead_owner(lead_id));
CREATE POLICY lead_act_insert_owner ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND public.is_lead_owner(lead_id));

-- lead_documents
DROP POLICY IF EXISTS "lead_documents read all authed" ON public.lead_documents;
DROP POLICY IF EXISTS "lead_documents write authed" ON public.lead_documents;
CREATE POLICY lead_documents_select_owner ON public.lead_documents FOR SELECT TO authenticated USING (public.is_lead_owner(lead_id));
CREATE POLICY lead_documents_write_owner ON public.lead_documents FOR ALL TO authenticated USING (public.is_lead_owner(lead_id)) WITH CHECK (public.is_lead_owner(lead_id));

-- lead_emails
DROP POLICY IF EXISTS "lead_emails read all authed" ON public.lead_emails;
DROP POLICY IF EXISTS "lead_emails insert authed" ON public.lead_emails;
DROP POLICY IF EXISTS "lead_emails update authed" ON public.lead_emails;
DROP POLICY IF EXISTS "lead_emails delete admin" ON public.lead_emails;
CREATE POLICY lead_emails_select_owner ON public.lead_emails FOR SELECT TO authenticated USING (public.is_lead_owner(lead_id));
CREATE POLICY lead_emails_insert_owner ON public.lead_emails FOR INSERT TO authenticated WITH CHECK (public.is_lead_owner(lead_id));
CREATE POLICY lead_emails_update_owner ON public.lead_emails FOR UPDATE TO authenticated USING (public.is_lead_owner(lead_id)) WITH CHECK (public.is_lead_owner(lead_id));
CREATE POLICY lead_emails_delete_owner ON public.lead_emails FOR DELETE TO authenticated USING (public.is_lead_owner(lead_id));

-- lead_meetings
DROP POLICY IF EXISTS "lead_meetings read all authed" ON public.lead_meetings;
DROP POLICY IF EXISTS "lead_meetings write authed" ON public.lead_meetings;
CREATE POLICY lead_meetings_select_owner ON public.lead_meetings FOR SELECT TO authenticated USING (public.is_lead_owner(lead_id));
CREATE POLICY lead_meetings_write_owner ON public.lead_meetings FOR ALL TO authenticated USING (public.is_lead_owner(lead_id)) WITH CHECK (public.is_lead_owner(lead_id));

-- lead_social_links
DROP POLICY IF EXISTS "authenticated can read lead social links" ON public.lead_social_links;
DROP POLICY IF EXISTS "authenticated can insert lead social links" ON public.lead_social_links;
DROP POLICY IF EXISTS "authenticated can update lead social links" ON public.lead_social_links;
DROP POLICY IF EXISTS "authenticated can delete lead social links" ON public.lead_social_links;
CREATE POLICY lead_social_select_owner ON public.lead_social_links FOR SELECT TO authenticated USING (public.is_lead_owner(lead_id));
CREATE POLICY lead_social_insert_owner ON public.lead_social_links FOR INSERT TO authenticated WITH CHECK (public.is_lead_owner(lead_id));
CREATE POLICY lead_social_update_owner ON public.lead_social_links FOR UPDATE TO authenticated USING (public.is_lead_owner(lead_id)) WITH CHECK (public.is_lead_owner(lead_id));
CREATE POLICY lead_social_delete_owner ON public.lead_social_links FOR DELETE TO authenticated USING (public.is_lead_owner(lead_id));
