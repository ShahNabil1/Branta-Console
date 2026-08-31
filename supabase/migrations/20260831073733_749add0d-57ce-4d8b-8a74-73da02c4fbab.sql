CREATE TABLE public.salary_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_no text,
  user_id uuid NOT NULL,
  period_month date NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  base_amount numeric(14,2) NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  payment_method text,
  txn_id text,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'issued',
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  payout_id uuid REFERENCES public.invoice_payouts(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_slips TO authenticated;
GRANT ALL ON public.salary_slips TO service_role;

ALTER TABLE public.salary_slips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance admins manage salary slips"
ON public.salary_slips FOR ALL TO authenticated
USING (public.is_finance_admin(auth.uid()))
WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE POLICY "Employees read own salary slips"
ON public.salary_slips FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE UNIQUE INDEX salary_slips_active_month_uniq
  ON public.salary_slips (user_id, period_month)
  WHERE status <> 'void';

CREATE INDEX salary_slips_user_idx ON public.salary_slips (user_id, period_month DESC);
CREATE UNIQUE INDEX salary_slips_slip_no_uniq ON public.salary_slips (slip_no) WHERE slip_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_salary_slip_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ym text; nxt int;
BEGIN
  IF NEW.slip_no IS NOT NULL AND NEW.slip_no <> '' THEN
    RETURN NEW;
  END IF;
  ym := to_char(COALESCE(NEW.period_month, CURRENT_DATE), 'YYMM');
  SELECT COALESCE(MAX((regexp_replace(slip_no, '^SAL-\d{4}-', ''))::int), 0) + 1
    INTO nxt
    FROM public.salary_slips
   WHERE slip_no LIKE 'SAL-' || ym || '-%';
  NEW.slip_no := 'SAL-' || ym || '-' || lpad(nxt::text, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_salary_slip_no
BEFORE INSERT ON public.salary_slips
FOR EACH ROW EXECUTE FUNCTION public.assign_salary_slip_no();

CREATE TRIGGER trg_salary_slips_uat
BEFORE UPDATE ON public.salary_slips
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();