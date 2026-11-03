CREATE TABLE public.inbox_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  gmail_thread_id text NOT NULL,
  provider text NOT NULL,
  provider_message_id text,
  from_email text NOT NULL,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  body_text text NOT NULL,
  body_html text,
  lead_id uuid,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.inbox_replies TO service_role;
ALTER TABLE public.inbox_replies ENABLE ROW LEVEL SECURITY;
CREATE INDEX inbox_replies_thread_idx ON public.inbox_replies(company_id, gmail_thread_id, sent_at);