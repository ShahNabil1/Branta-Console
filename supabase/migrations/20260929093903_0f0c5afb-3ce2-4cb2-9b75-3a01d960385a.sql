ALTER TABLE public.invoice_project_costs
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS amount_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS note text;

CREATE TABLE public.invoice_employee_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'percent',
  value numeric NOT NULL DEFAULT 0,
  planned_amount numeric NOT NULL DEFAULT 0,
  task_id uuid,
  note text,
  sequence int NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_employee_plans TO authenticated;
GRANT ALL ON public.invoice_employee_plans TO service_role;
ALTER TABLE public.invoice_employee_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance manages employee plans" ON public.invoice_employee_plans
  FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE INDEX ON public.invoice_employee_plans(invoice_id);
CREATE TRIGGER trg_iep_updated BEFORE UPDATE ON public.invoice_employee_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();