ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terms text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.invoice_pdf_settings
  ADD COLUMN IF NOT EXISTS payment_info text,
  ADD COLUMN IF NOT EXISTS payment_note text;

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view invoice line items"
ON public.invoice_line_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can manage invoice line items"
ON public.invoice_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON public.invoice_line_items(invoice_id, sequence);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_invoice_line_items_updated_at
BEFORE UPDATE ON public.invoice_line_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();