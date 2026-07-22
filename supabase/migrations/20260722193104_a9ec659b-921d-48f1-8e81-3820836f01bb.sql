
-- 1) Company ledger for manual seeds / other income / adjustments
CREATE TABLE public.company_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('seed','other_income','adjustment')),
  currency text NOT NULL DEFAULT 'BDT' CHECK (currency IN ('BDT','USD')),
  amount numeric(14,2) NOT NULL,
  notes text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_ledger TO authenticated;
GRANT ALL ON public.company_ledger TO service_role;
ALTER TABLE public.company_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance can view ledger" ON public.company_ledger FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "finance can insert ledger" ON public.company_ledger FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "finance can update ledger" ON public.company_ledger FOR UPDATE TO authenticated
  USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "finance can delete ledger" ON public.company_ledger FOR DELETE TO authenticated
  USING (public.is_finance_admin(auth.uid()));
CREATE TRIGGER trg_company_ledger_updated_at BEFORE UPDATE ON public.company_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_company_ledger_cur_date ON public.company_ledger(currency, occurred_on DESC);

-- 2) Change payout unlock rule: only when the INVOICE is fully paid.
CREATE OR REPLACE FUNCTION public.sync_payouts_on_installment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE cur_currency text; inv_status text;
BEGIN
  SELECT currency, status INTO cur_currency, inv_status FROM public.invoices WHERE id = NEW.invoice_id;
  DELETE FROM public.invoice_payouts WHERE installment_id = NEW.id;
  INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
  SELECT NEW.invoice_id, NEW.id, s.id, s.user_id, s.role, cur_currency,
    round(NEW.amount * s.percent / 100.0, 2),
    CASE WHEN inv_status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
    CASE WHEN inv_status = 'paid' THEN now() ELSE NULL END
  FROM public.invoice_stakeholders s WHERE s.invoice_id = NEW.invoice_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_payouts_on_stakeholder()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE inv_id uuid; inst RECORD; cur_currency text; inv_status text;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT currency, status INTO cur_currency, inv_status FROM public.invoices WHERE id = inv_id;
  FOR inst IN SELECT * FROM public.invoice_installments WHERE invoice_id = inv_id LOOP
    DELETE FROM public.invoice_payouts WHERE installment_id = inst.id;
    INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
    SELECT inv_id, inst.id, s.id, s.user_id, s.role, cur_currency,
      round(inst.amount * s.percent / 100.0, 2),
      CASE WHEN inv_status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
      CASE WHEN inv_status = 'paid' THEN now() ELSE NULL END
    FROM public.invoice_stakeholders s WHERE s.invoice_id = inv_id;
  END LOOP;
  RETURN NULL;
END;
$$;

-- 3) Trigger: when invoice status flips to/from 'paid', unlock/relock its payouts
CREATE OR REPLACE FUNCTION public.sync_payouts_on_invoice_status()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    UPDATE public.invoice_payouts SET status = 'available', unlocked_at = now(), updated_at = now()
      WHERE invoice_id = NEW.id AND status = 'locked';
  ELSIF OLD.status = 'paid' AND NEW.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.invoice_payouts SET status = 'locked', unlocked_at = NULL, updated_at = now()
      WHERE invoice_id = NEW.id AND status = 'available';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_sync_payouts ON public.invoices;
CREATE TRIGGER trg_invoices_sync_payouts AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_payouts_on_invoice_status();

-- 4) Backfill existing payouts to match the new rule
UPDATE public.invoice_payouts p
  SET status = 'available', unlocked_at = COALESCE(p.unlocked_at, now()), updated_at = now()
  WHERE status = 'locked'
    AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = p.invoice_id AND i.status = 'paid');

UPDATE public.invoice_payouts p
  SET status = 'locked', unlocked_at = NULL, updated_at = now()
  WHERE status = 'available'
    AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = p.invoice_id AND i.status <> 'paid');
