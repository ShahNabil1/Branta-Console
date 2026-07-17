-- Add sheet sync tracking to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sheet_row_id text,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- Shared integration state (Sheets doc id, cursors, etc.)
CREATE TABLE IF NOT EXISTS public.integration_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  resource_id text,
  cursor text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_sync_state TO authenticated;
GRANT ALL ON public.integration_sync_state TO service_role;
ALTER TABLE public.integration_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_sync_state read all authed"
  ON public.integration_sync_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "integration_sync_state write all authed"
  ON public.integration_sync_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER integration_sync_state_updated_at
  BEFORE UPDATE ON public.integration_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lead emails (Gmail + Resend threads)
CREATE TABLE IF NOT EXISTS public.lead_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  provider text NOT NULL CHECK (provider IN ('gmail','resend')),
  message_id text,
  thread_id text,
  subject text,
  body_html text,
  body_text text,
  from_email text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('draft','sent','failed','received')),
  error_message text,
  sent_at timestamptz,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_emails_lead_id_idx ON public.lead_emails(lead_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS lead_emails_message_uniq ON public.lead_emails(provider, message_id) WHERE message_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_emails TO authenticated;
GRANT ALL ON public.lead_emails TO service_role;
ALTER TABLE public.lead_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_emails read all authed" ON public.lead_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_emails insert authed" ON public.lead_emails FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lead_emails update authed" ON public.lead_emails FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "lead_emails delete admin"
  ON public.lead_emails FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Lead meetings (Google Calendar)
CREATE TABLE IF NOT EXISTS public.lead_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  google_event_id text,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  meeting_link text,
  attendees text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_meetings_lead_id_idx ON public.lead_meetings(lead_id, starts_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_meetings TO authenticated;
GRANT ALL ON public.lead_meetings TO service_role;
ALTER TABLE public.lead_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_meetings read all authed" ON public.lead_meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_meetings write authed" ON public.lead_meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER lead_meetings_updated_at
  BEFORE UPDATE ON public.lead_meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lead documents (Google Docs)
CREATE TABLE IF NOT EXISTS public.lead_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  doc_id text NOT NULL,
  doc_url text NOT NULL,
  title text NOT NULL,
  template_kind text NOT NULL CHECK (template_kind IN ('proposal','contract','nda','custom')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_documents_lead_id_idx ON public.lead_documents(lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_documents TO authenticated;
GRANT ALL ON public.lead_documents TO service_role;
ALTER TABLE public.lead_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_documents read all authed" ON public.lead_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_documents write authed" ON public.lead_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_emails;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.integration_sync_state;