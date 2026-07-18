
CREATE TABLE public.inbox_messages (
  gmail_message_id text PRIMARY KEY,
  gmail_thread_id text NOT NULL,
  from_email citext NOT NULL,
  from_name text,
  to_email citext,
  subject text,
  snippet text,
  received_at timestamptz NOT NULL,
  is_unread boolean NOT NULL DEFAULT true,
  label_ids text[] NOT NULL DEFAULT '{}',
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_contact_id uuid REFERENCES public.lead_contacts(id) ON DELETE SET NULL,
  handled_by uuid,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inbox_messages_thread_idx ON public.inbox_messages (gmail_thread_id);
CREATE INDEX inbox_messages_received_idx ON public.inbox_messages (received_at DESC);
CREATE INDEX inbox_messages_from_idx ON public.inbox_messages (from_email);
CREATE INDEX inbox_messages_lead_idx ON public.inbox_messages (lead_id);
CREATE INDEX inbox_messages_handled_by_idx ON public.inbox_messages (handled_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_messages TO authenticated;
GRANT ALL ON public.inbox_messages TO service_role;

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

-- All authenticated Branta employees can view the full shared inbox.
CREATE POLICY "Employees can view inbox"
  ON public.inbox_messages FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated employee can update inbox rows (mark read, reassign, etc.).
CREATE POLICY "Employees can update inbox"
  ON public.inbox_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER inbox_messages_set_updated_at
BEFORE UPDATE ON public.inbox_messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
