ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS project_cost_total numeric(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.invoice_project_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_project_costs TO authenticated;
GRANT ALL ON public.invoice_project_costs TO service_role;

ALTER TABLE public.invoice_project_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read project costs"
  ON public.invoice_project_costs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Finance admins manage project costs"
  ON public.invoice_project_costs FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_invoice_project_costs_invoice ON public.invoice_project_costs(invoice_id);

CREATE TRIGGER trg_invoice_project_costs_uat
  BEFORE UPDATE ON public.invoice_project_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payout math now runs on the net distributable amount.
CREATE OR REPLACE FUNCTION public.sync_payouts_on_installment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cur_currency text; inv_status text; inv_total numeric; inv_cost numeric; ratio numeric;
BEGIN
  SELECT currency, status, total_amount, COALESCE(project_cost_total, 0)
    INTO cur_currency, inv_status, inv_total, inv_cost
    FROM public.invoices WHERE id = NEW.invoice_id;
  ratio := CASE WHEN COALESCE(inv_total, 0) > 0
                THEN GREATEST(inv_total - COALESCE(inv_cost, 0), 0) / inv_total
                ELSE 1 END;
  DELETE FROM public.invoice_payouts WHERE installment_id = NEW.id;
  INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
  SELECT NEW.invoice_id, NEW.id, s.id, s.user_id, s.role, cur_currency,
    round(NEW.amount * ratio * s.percent / 100.0, 2),
    CASE WHEN inv_status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
    CASE WHEN inv_status = 'paid' THEN now() ELSE NULL END
  FROM public.invoice_stakeholders s WHERE s.invoice_id = NEW.invoice_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_payouts_on_stakeholder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inv_id uuid; inst RECORD; cur_currency text; inv_status text; inv_total numeric; inv_cost numeric; ratio numeric;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT currency, status, total_amount, COALESCE(project_cost_total, 0)
    INTO cur_currency, inv_status, inv_total, inv_cost
    FROM public.invoices WHERE id = inv_id;
  ratio := CASE WHEN COALESCE(inv_total, 0) > 0
                THEN GREATEST(inv_total - COALESCE(inv_cost, 0), 0) / inv_total
                ELSE 1 END;
  FOR inst IN SELECT * FROM public.invoice_installments WHERE invoice_id = inv_id LOOP
    DELETE FROM public.invoice_payouts WHERE installment_id = inst.id;
    INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
    SELECT inv_id, inst.id, s.id, s.user_id, s.role, cur_currency,
      round(inst.amount * ratio * s.percent / 100.0, 2),
      CASE WHEN inv_status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
      CASE WHEN inv_status = 'paid' THEN now() ELSE NULL END
    FROM public.invoice_stakeholders s WHERE s.invoice_id = inv_id;
  END LOOP;
  RETURN NULL;
END;
$function$;