CREATE TABLE public.income_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_no text,
  source text NOT NULL CHECK (source IN ('installment','ledger')),
  source_id uuid NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  party text,
  project text,
  category text NOT NULL DEFAULT 'Invoice payment',
  currency text NOT NULL DEFAULT 'BDT',
  amount numeric NOT NULL,
  received_on date NOT NULL,
  payment_method text,
  txn_id text,
  notes text,
  signed_voucher_url text,
  signed_voucher_at timestamptz,
  signed_voucher_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_vouchers TO authenticated;
GRANT ALL ON public.income_vouchers TO service_role;

ALTER TABLE public.income_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can read income vouchers" ON public.income_vouchers
  FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "Finance can create income vouchers" ON public.income_vouchers
  FOR INSERT TO authenticated WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "Finance can update income vouchers" ON public.income_vouchers
  FOR UPDATE TO authenticated USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "Finance can delete income vouchers" ON public.income_vouchers
  FOR DELETE TO authenticated USING (public.is_finance_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.assign_income_voucher_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ym text;
  nxt int;
BEGIN
  IF NEW.voucher_no IS NOT NULL AND NEW.voucher_no <> '' THEN
    RETURN NEW;
  END IF;
  ym := to_char(COALESCE(NEW.received_on, CURRENT_DATE), 'YYMM');
  SELECT COALESCE(MAX((regexp_replace(voucher_no, '^INC-\d{4}-', ''))::int), 0) + 1
    INTO nxt
    FROM public.income_vouchers
   WHERE voucher_no LIKE 'INC-' || ym || '-%';
  NEW.voucher_no := 'INC-' || ym || '-' || lpad(nxt::text, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_income_voucher_no
BEFORE INSERT ON public.income_vouchers
FOR EACH ROW EXECUTE FUNCTION public.assign_income_voucher_no();

CREATE TRIGGER trg_income_vouchers_updated_at
BEFORE UPDATE ON public.income_vouchers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX income_vouchers_voucher_no_key ON public.income_vouchers (voucher_no);