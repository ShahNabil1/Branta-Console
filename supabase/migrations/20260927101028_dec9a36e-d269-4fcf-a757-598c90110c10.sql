ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS work_value numeric,
  ADD COLUMN IF NOT EXISTS contract_start date,
  ADD COLUMN IF NOT EXISTS contract_end date,
  ADD COLUMN IF NOT EXISTS monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS billing_day integer,
  ADD COLUMN IF NOT EXISTS services_included text,
  ADD COLUMN IF NOT EXISTS monthly_deliverables text,
  ADD COLUMN IF NOT EXISTS client_manager_id uuid;

CREATE OR REPLACE FUNCTION public.validate_client_project_type() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.project_type NOT IN ('one_time','monthly') THEN RAISE EXCEPTION 'Invalid project type %', NEW.project_type; END IF;
  IF NEW.billing_day IS NOT NULL AND (NEW.billing_day < 1 OR NEW.billing_day > 31) THEN RAISE EXCEPTION 'Billing day must be 1-31'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cp_type BEFORE INSERT OR UPDATE ON public.client_projects FOR EACH ROW EXECUTE FUNCTION public.validate_client_project_type();

CREATE TABLE public.client_task_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.client_tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  items_done numeric,
  is_manager boolean NOT NULL DEFAULT false,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_task_updates TO authenticated;
GRANT ALL ON public.client_task_updates TO service_role;
ALTER TABLE public.client_task_updates ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ctu_task ON public.client_task_updates(task_id, created_at);
CREATE POLICY "ctu read" ON public.client_task_updates FOR SELECT TO authenticated
  USING (public.is_task_assignee(task_id, auth.uid()) OR public.can_manage_task(task_id, auth.uid()));
CREATE POLICY "ctu insert" ON public.client_task_updates FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND (public.is_task_assignee(task_id, auth.uid()) OR public.can_manage_task(task_id, auth.uid())));
CREATE POLICY "ctu edit own 10m" ON public.client_task_updates FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND created_at > now() - interval '10 minutes')
  WITH CHECK (author_id = auth.uid());

CREATE TABLE public.client_task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.client_tasks(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  items_completed numeric,
  status text NOT NULL DEFAULT 'submitted',
  reviewed_by uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_task_submissions TO authenticated;
GRANT ALL ON public.client_task_submissions TO service_role;
ALTER TABLE public.client_task_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cts_task ON public.client_task_submissions(task_id, created_at);
CREATE OR REPLACE FUNCTION public.validate_task_submission() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('submitted','approved','revision_requested','rejected','completed') THEN RAISE EXCEPTION 'Invalid submission status %', NEW.status; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cts_validate BEFORE INSERT OR UPDATE ON public.client_task_submissions FOR EACH ROW EXECUTE FUNCTION public.validate_task_submission();
CREATE TRIGGER trg_cts_updated BEFORE UPDATE ON public.client_task_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "cts read" ON public.client_task_submissions FOR SELECT TO authenticated
  USING (public.is_task_assignee(task_id, auth.uid()) OR public.can_manage_task(task_id, auth.uid()));
CREATE POLICY "cts insert" ON public.client_task_submissions FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND status = 'submitted' AND (public.is_task_assignee(task_id, auth.uid()) OR public.can_manage_task(task_id, auth.uid())));
CREATE POLICY "cts review" ON public.client_task_submissions FOR UPDATE TO authenticated
  USING (public.can_manage_task(task_id, auth.uid())) WITH CHECK (public.can_manage_task(task_id, auth.uid()));

CREATE TABLE public.client_project_finance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.client_projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.client_tasks(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'BDT',
  project_value numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'not_invoiced',
  payment_date date,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id), UNIQUE (task_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_project_finance TO authenticated;
GRANT ALL ON public.client_project_finance TO service_role;
ALTER TABLE public.client_project_finance ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.validate_project_finance() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.project_id IS NULL) = (NEW.task_id IS NULL) THEN RAISE EXCEPTION 'Finance row needs exactly one of project or task'; END IF;
  IF NEW.payment_status NOT IN ('not_invoiced','invoice_sent','partial_paid','paid','due') THEN RAISE EXCEPTION 'Invalid payment status %', NEW.payment_status; END IF;
  IF NEW.project_value < 0 OR NEW.paid_amount < 0 THEN RAISE EXCEPTION 'Amounts cannot be negative'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cpf_validate BEFORE INSERT OR UPDATE ON public.client_project_finance FOR EACH ROW EXECUTE FUNCTION public.validate_project_finance();
CREATE TRIGGER trg_cpf_updated BEFORE UPDATE ON public.client_project_finance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "cpf finance only" ON public.client_project_finance FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid())) WITH CHECK (public.is_finance_admin(auth.uid()));