-- items
CREATE TABLE public.expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_items TO authenticated;
GRANT ALL ON public.expense_items TO service_role;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance manage expense items" ON public.expense_items FOR ALL TO authenticated
USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE INDEX expense_items_expense_idx ON public.expense_items(expense_id);
CREATE TRIGGER expense_items_touch BEFORE UPDATE ON public.expense_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- attachments
CREATE TABLE public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 0,
  path text NOT NULL,
  caption text,
  mime_type text,
  size_bytes bigint,
  kind text NOT NULL DEFAULT 'receipt',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_attachments TO authenticated;
GRANT ALL ON public.expense_attachments TO service_role;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance manage expense attachments" ON public.expense_attachments FOR ALL TO authenticated
USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE INDEX expense_attachments_expense_idx ON public.expense_attachments(expense_id);
CREATE TRIGGER expense_attachments_touch BEFORE UPDATE ON public.expense_attachments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- expense flags
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_project_cost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_token text;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_share_token_key ON public.expenses(share_token) WHERE share_token IS NOT NULL;

-- backfill legacy single receipts
INSERT INTO public.expense_attachments (expense_id, sequence, path, caption, kind, created_by)
SELECT e.id, 0, e.receipt_url, 'Receipt / proof', 'receipt', e.created_by
FROM public.expenses e
WHERE e.receipt_url IS NOT NULL AND e.receipt_url <> '';

INSERT INTO public.expense_attachments (expense_id, sequence, path, caption, kind, created_by)
SELECT e.id, 100, e.signed_voucher_url, 'Signed & sealed voucher', 'signed', e.signed_voucher_by
FROM public.expenses e
WHERE e.signed_voucher_url IS NOT NULL AND e.signed_voucher_url <> '';