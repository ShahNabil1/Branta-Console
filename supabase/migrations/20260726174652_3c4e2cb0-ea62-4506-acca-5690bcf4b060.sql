
-- 1) Invoice email delivery events
CREATE TYPE public.invoice_email_status AS ENUM (
  'queued','sending','sent','delivered','opened','clicked','bounced','complained','failed','suppressed','delivery_delayed'
);

CREATE TYPE public.invoice_email_trigger AS ENUM (
  'manual','auto_created','auto_installment_paid','auto_fully_paid','resend'
);

CREATE TABLE public.invoice_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES public.invoice_installments(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  provider_message_id text,
  status public.invoice_email_status NOT NULL DEFAULT 'queued',
  trigger public.invoice_email_trigger NOT NULL DEFAULT 'manual',
  error_message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz
);
CREATE INDEX idx_iee_invoice ON public.invoice_email_events(invoice_id, created_at DESC);
CREATE INDEX idx_iee_provider_msg ON public.invoice_email_events(provider_message_id) WHERE provider_message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.invoice_email_events TO authenticated;
GRANT ALL ON public.invoice_email_events TO service_role;

ALTER TABLE public.invoice_email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY iee_read_finance ON public.invoice_email_events
  FOR SELECT TO authenticated
  USING (
    public.is_finance_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.invoice_stakeholders s
      WHERE s.invoice_id = invoice_email_events.invoice_id AND s.user_id = auth.uid()
    )
  );
CREATE POLICY iee_write_finance ON public.invoice_email_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY iee_update_finance ON public.invoice_email_events
  FOR UPDATE TO authenticated
  USING (public.is_finance_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE TRIGGER iee_touch BEFORE UPDATE ON public.invoice_email_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_email_events;
ALTER TABLE public.invoice_email_events REPLICA IDENTITY FULL;

-- 2) PDF template settings (single row, id='default')
CREATE TABLE public.invoice_pdf_settings (
  id text PRIMARY KEY DEFAULT 'default',
  company_name text NOT NULL DEFAULT 'Branta Tech',
  company_tagline text DEFAULT 'Software · Design · Growth',
  company_address text DEFAULT 'Dhaka, Bangladesh',
  company_email text DEFAULT 'finance@brantatech.com',
  company_website text DEFAULT 'https://brantatech.com',
  logo_url text,
  brand_color text NOT NULL DEFAULT '#E56A17',
  header_bg_color text NOT NULL DEFAULT '#FFFFFF',
  page_bg_color text NOT NULL DEFAULT '#FFFFFF',
  panel_bg_color text NOT NULL DEFAULT '#F9FAFB',
  text_color text NOT NULL DEFAULT '#111827',
  muted_color text NOT NULL DEFAULT '#6B7280',
  hairline_color text NOT NULL DEFAULT '#E5E7EB',
  header_text text NOT NULL DEFAULT 'INVOICE',
  footer_text text NOT NULL DEFAULT 'Thank you for your business.',
  signature_name text DEFAULT 'Branta Tech · Finance',
  signature_title text DEFAULT 'finance@brantatech.com',
  sections jsonb NOT NULL DEFAULT '{"description":true,"installments":true,"stakeholders":false,"notes":true,"footer":true}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_pdf_settings_single CHECK (id = 'default')
);
GRANT SELECT ON public.invoice_pdf_settings TO authenticated;
GRANT ALL ON public.invoice_pdf_settings TO service_role;
ALTER TABLE public.invoice_pdf_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ips_read ON public.invoice_pdf_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY ips_write ON public.invoice_pdf_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER ips_touch BEFORE UPDATE ON public.invoice_pdf_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.invoice_pdf_settings (id) VALUES ('default');

-- 3) Email template settings (single row, id='default')
CREATE TABLE public.invoice_email_settings (
  id text PRIMARY KEY DEFAULT 'default',
  from_name text NOT NULL DEFAULT 'Invoice — Branta Tech',
  from_email text NOT NULL DEFAULT 'finance@brantatech.com',
  reply_to text DEFAULT 'finance@brantatech.com',
  subject_template text NOT NULL DEFAULT 'Invoice {{invoice_slug}} — {{invoice_title}} ({{currency}} {{total_amount}})',
  brand_color text NOT NULL DEFAULT '#E56A17',
  background_color text NOT NULL DEFAULT '#F9FAFB',
  card_background text NOT NULL DEFAULT '#FFFFFF',
  header_html text NOT NULL DEFAULT '<h1 style="margin:0;font:600 20px/1.3 Inter,Arial,sans-serif;color:#111827;">Invoice {{invoice_slug}}</h1><p style="margin:6px 0 0;color:#6B7280;font:400 13px/1.5 Inter,Arial,sans-serif;">{{invoice_title}}</p>',
  body_html text NOT NULL DEFAULT '<p style="margin:0 0 12px;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827;">Hi {{recipient_name}},</p><p style="margin:0 0 12px;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827;">Please find attached invoice <b>{{invoice_slug}}</b> for <b>{{invoice_title}}</b>.</p><p style="margin:0 0 12px;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827;">Total: <b>{{currency}} {{total_amount}}</b><br/>Outstanding: <b>{{currency}} {{outstanding_amount}}</b></p>',
  cta_label text NOT NULL DEFAULT 'View invoice',
  footer_html text NOT NULL DEFAULT '<p style="margin:16px 0 0;font:400 12px/1.5 Inter,Arial,sans-serif;color:#6B7280;">— Branta Tech · Finance<br/>finance@brantatech.com</p>',
  auto_send_on_create boolean NOT NULL DEFAULT true,
  auto_send_on_installment_paid boolean NOT NULL DEFAULT true,
  auto_send_on_fully_paid boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_email_settings_single CHECK (id = 'default')
);
GRANT SELECT ON public.invoice_email_settings TO authenticated;
GRANT ALL ON public.invoice_email_settings TO service_role;
ALTER TABLE public.invoice_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ies_read ON public.invoice_email_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY ies_write ON public.invoice_email_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER ies_touch BEFORE UPDATE ON public.invoice_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.invoice_email_settings (id) VALUES ('default');
