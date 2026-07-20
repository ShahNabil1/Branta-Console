
-- ENUMS
DO $$ BEGIN CREATE TYPE public.invoice_status AS ENUM ('draft','sent','partially_paid','paid','overdue','void'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.installment_status AS ENUM ('pending','invoiced','paid','overdue','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payout_status AS ENUM ('locked','available','requested','paid','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.withdrawal_status AS ENUM ('pending','approved','rejected','paid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.expense_category AS ENUM ('salary','tools','ads','office','misc','tax','refund'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.stakeholder_role AS ENUM ('outreach','lead_closer','worker','company'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS public.invoice_slug_seq START 1;

CREATE OR REPLACE FUNCTION public.is_finance_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('finance','super_admin','admin'))
$$;

-- ============= TABLES =============
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  project_type text NOT NULL DEFAULT 'one_time' CHECK (project_type IN ('one_time','monthly_retainer')),
  starts_on date,
  ends_on date,
  currency text NOT NULL DEFAULT 'BDT' CHECK (currency IN ('BDT','USD')),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  notes text, internal_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role public.stakeholder_role NOT NULL,
  percent numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS public.invoice_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sequence smallint NOT NULL,
  label text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL,
  status public.installment_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz, paid_amount numeric(14,2),
  payment_ref text, payment_method text, note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.invoice_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  installment_id uuid NOT NULL REFERENCES public.invoice_installments(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.invoice_stakeholders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role public.stakeholder_role NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.payout_status NOT NULL DEFAULT 'locked',
  unlocked_at timestamptz, requested_at timestamptz, paid_at timestamptz,
  withdrawal_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installment_id, stakeholder_id)
);

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BDT',
  payment_method_id text, payment_method_snapshot jsonb,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz, decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz, paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_note text, transfer_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.expense_category NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'BDT',
  spent_on date NOT NULL DEFAULT current_date,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor text, receipt_url text, notes text,
  linked_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL REFERENCES public.invoice_installments(id) ON DELETE CASCADE,
  kind text NOT NULL,
  day_bucket date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipients text[], provider_ref text,
  UNIQUE (installment_id, kind, day_bucket)
);

-- ============= GRANTS =============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices, public.invoice_stakeholders, public.invoice_installments, public.invoice_payouts, public.withdrawal_requests, public.expenses TO authenticated;
GRANT SELECT ON public.invoice_reminder_log TO authenticated;
GRANT ALL ON public.invoices, public.invoice_stakeholders, public.invoice_installments, public.invoice_payouts, public.withdrawal_requests, public.expenses, public.invoice_reminder_log TO service_role;
GRANT USAGE ON SEQUENCE public.invoice_slug_seq TO authenticated, service_role;

-- ============= RLS =============
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_log ENABLE ROW LEVEL SECURITY;

-- Invoices
CREATE POLICY "inv_finance_select" ON public.invoices FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "inv_stakeholder_select" ON public.invoices FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.invoice_stakeholders s WHERE s.invoice_id = invoices.id AND s.user_id = auth.uid()));
CREATE POLICY "inv_finance_insert" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "inv_finance_update" ON public.invoices FOR UPDATE TO authenticated USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "inv_finance_delete" ON public.invoices FOR DELETE TO authenticated USING (public.is_finance_admin(auth.uid()));

-- Stakeholders
CREATE POLICY "stk_finance_select" ON public.invoice_stakeholders FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "stk_own_select" ON public.invoice_stakeholders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "stk_finance_manage" ON public.invoice_stakeholders FOR ALL TO authenticated USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));

-- Installments
CREATE POLICY "ins_finance_select" ON public.invoice_installments FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "ins_stakeholder_select" ON public.invoice_installments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.invoice_stakeholders s WHERE s.invoice_id = invoice_installments.invoice_id AND s.user_id = auth.uid()));
CREATE POLICY "ins_finance_manage" ON public.invoice_installments FOR ALL TO authenticated USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));

-- Payouts
CREATE POLICY "pay_finance_select" ON public.invoice_payouts FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "pay_own_select" ON public.invoice_payouts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pay_finance_manage" ON public.invoice_payouts FOR ALL TO authenticated USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));

-- Withdrawals
CREATE POLICY "wr_own_select" ON public.withdrawal_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "wr_finance_select" ON public.withdrawal_requests FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "wr_own_insert" ON public.withdrawal_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "wr_finance_update" ON public.withdrawal_requests FOR UPDATE TO authenticated USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));
CREATE POLICY "wr_finance_delete" ON public.withdrawal_requests FOR DELETE TO authenticated USING (public.is_finance_admin(auth.uid()));

-- Expenses
CREATE POLICY "exp_finance_all" ON public.expenses FOR ALL TO authenticated USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));

-- Reminder log
CREATE POLICY "rem_finance_select" ON public.invoice_reminder_log FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));

-- ============= TRIGGERS =============
CREATE OR REPLACE FUNCTION public.assign_invoice_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    n := nextval('public.invoice_slug_seq');
    NEW.slug := 'BT-' || lpad(n::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_slug ON public.invoices;
CREATE TRIGGER trg_invoices_slug BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_slug();

DROP TRIGGER IF EXISTS trg_invoices_uat ON public.invoices;
CREATE TRIGGER trg_invoices_uat BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_stk_uat ON public.invoice_stakeholders;
CREATE TRIGGER trg_stk_uat BEFORE UPDATE ON public.invoice_stakeholders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_ins_uat ON public.invoice_installments;
CREATE TRIGGER trg_ins_uat BEFORE UPDATE ON public.invoice_installments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_pay_uat ON public.invoice_payouts;
CREATE TRIGGER trg_pay_uat BEFORE UPDATE ON public.invoice_payouts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_wr_uat ON public.withdrawal_requests;
CREATE TRIGGER trg_wr_uat BEFORE UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_exp_uat ON public.expenses;
CREATE TRIGGER trg_exp_uat BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sync payouts when installment amount/status changes
CREATE OR REPLACE FUNCTION public.sync_payouts_on_installment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur_currency text;
BEGIN
  SELECT currency INTO cur_currency FROM public.invoices WHERE id = NEW.invoice_id;
  DELETE FROM public.invoice_payouts WHERE installment_id = NEW.id;
  INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
  SELECT NEW.invoice_id, NEW.id, s.id, s.user_id, s.role, cur_currency,
    round(NEW.amount * s.percent / 100.0, 2),
    CASE WHEN NEW.status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
    CASE WHEN NEW.status = 'paid' THEN now() ELSE NULL END
  FROM public.invoice_stakeholders s WHERE s.invoice_id = NEW.invoice_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_installment_sync_payouts ON public.invoice_installments;
CREATE TRIGGER trg_installment_sync_payouts
  AFTER INSERT OR UPDATE OF amount, status ON public.invoice_installments
  FOR EACH ROW EXECUTE FUNCTION public.sync_payouts_on_installment();

-- Recompute invoice totals
CREATE OR REPLACE FUNCTION public.recompute_invoice_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_total numeric(14,2); inv_paid numeric(14,2); inv_id uuid;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT total_amount INTO inv_total FROM public.invoices WHERE id = inv_id;
  SELECT COALESCE(SUM(COALESCE(paid_amount, amount)), 0) INTO inv_paid
    FROM public.invoice_installments WHERE invoice_id = inv_id AND status = 'paid';
  UPDATE public.invoices
  SET paid_amount = inv_paid,
      status = CASE
        WHEN inv_paid >= inv_total AND inv_total > 0 THEN 'paid'::public.invoice_status
        WHEN inv_paid > 0 THEN 'partially_paid'::public.invoice_status
        ELSE status END,
      updated_at = now()
  WHERE id = inv_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_installment_totals ON public.invoice_installments;
CREATE TRIGGER trg_installment_totals AFTER INSERT OR UPDATE OR DELETE ON public.invoice_installments FOR EACH ROW EXECUTE FUNCTION public.recompute_invoice_totals();

-- Sync payouts when stakeholders change
CREATE OR REPLACE FUNCTION public.sync_payouts_on_stakeholder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_id uuid; inst RECORD; cur_currency text;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT currency INTO cur_currency FROM public.invoices WHERE id = inv_id;
  FOR inst IN SELECT * FROM public.invoice_installments WHERE invoice_id = inv_id LOOP
    DELETE FROM public.invoice_payouts WHERE installment_id = inst.id;
    INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
    SELECT inv_id, inst.id, s.id, s.user_id, s.role, cur_currency,
      round(inst.amount * s.percent / 100.0, 2),
      CASE WHEN inst.status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
      CASE WHEN inst.status = 'paid' THEN now() ELSE NULL END
    FROM public.invoice_stakeholders s WHERE s.invoice_id = inv_id;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_stakeholder_sync_payouts ON public.invoice_stakeholders;
CREATE TRIGGER trg_stakeholder_sync_payouts AFTER INSERT OR UPDATE OR DELETE ON public.invoice_stakeholders FOR EACH ROW EXECUTE FUNCTION public.sync_payouts_on_stakeholder();

-- WALLET VIEW
CREATE OR REPLACE VIEW public.v_wallet_balances
WITH (security_invoker = true) AS
SELECT p.user_id, p.currency,
  SUM(CASE WHEN p.status = 'locked'    THEN p.amount ELSE 0 END) AS locked,
  SUM(CASE WHEN p.status = 'available' THEN p.amount ELSE 0 END) AS available,
  SUM(CASE WHEN p.status = 'requested' THEN p.amount ELSE 0 END) AS requested,
  SUM(CASE WHEN p.status = 'paid'      THEN p.amount ELSE 0 END) AS paid_total
FROM public.invoice_payouts p GROUP BY p.user_id, p.currency;
GRANT SELECT ON public.v_wallet_balances TO authenticated, service_role;

-- REALTIME
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_installments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_stakeholders; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_payouts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_requests; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_installments_invoice ON public.invoice_installments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_installments_due ON public.invoice_installments(due_date) WHERE status <> 'paid' AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_stakeholders_invoice ON public.invoice_stakeholders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_stakeholders_user ON public.invoice_stakeholders(user_id);
CREATE INDEX IF NOT EXISTS idx_payouts_user_status ON public.invoice_payouts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_installment ON public.invoice_payouts(installment_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status ON public.withdrawal_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(spent_on);
