
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.expenses SET company_id = public.holding_company_id() WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS expenses_company_idx ON public.expenses(company_id);

CREATE OR REPLACE FUNCTION public.expenses_default_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN NEW.company_id := public.holding_company_id(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_expenses_default_company ON public.expenses;
CREATE TRIGGER trg_expenses_default_company BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.expenses_default_company();

CREATE OR REPLACE FUNCTION public.can_view_company_finance(_company uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_finance_admin(_user) OR public.can_manage_company(_company, _user)
$$;

-- Fund configs (versioned)
CREATE TABLE public.company_fund_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  version integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, version)
);
CREATE UNIQUE INDEX company_fund_configs_one_active ON public.company_fund_configs(company_id) WHERE is_active;
GRANT SELECT ON public.company_fund_configs TO authenticated;
GRANT ALL ON public.company_fund_configs TO service_role;
ALTER TABLE public.company_fund_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view company fund configs" ON public.company_fund_configs FOR SELECT TO authenticated
USING (public.can_view_company_finance(company_id, auth.uid()));

CREATE TABLE public.company_fund_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.company_fund_configs(id),
  key text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('free','team_payable','officer_payable','vat_reserve','operation','reserve','growth','other')),
  percent numeric(6,3) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_id, key)
);
GRANT SELECT ON public.company_fund_buckets TO authenticated;
GRANT ALL ON public.company_fund_buckets TO service_role;
ALTER TABLE public.company_fund_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view company fund buckets" ON public.company_fund_buckets FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.company_fund_configs c WHERE c.id = config_id
  AND public.can_view_company_finance(c.company_id, auth.uid())));

-- Wallet ledger (append-only)
CREATE TABLE public.company_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  bucket_key text NOT NULL,
  bucket_kind text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BDT',
  entry_type text NOT NULL CHECK (entry_type IN ('revenue_credit','expense_debit','bucket_movement','loan_credit','loan_repayment','reversal','opening')),
  source_type text NOT NULL,
  source_id uuid,
  record_ref text,
  description text,
  movement_id uuid,
  reverses_id uuid REFERENCES public.company_wallet_ledger(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX company_wallet_ledger_source_uniq ON public.company_wallet_ledger(source_type, source_id, bucket_key, direction)
  WHERE source_id IS NOT NULL AND entry_type <> 'reversal';
CREATE UNIQUE INDEX company_wallet_ledger_one_reversal ON public.company_wallet_ledger(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX company_wallet_ledger_company_idx ON public.company_wallet_ledger(company_id, occurred_at, id);
GRANT SELECT ON public.company_wallet_ledger TO authenticated;
GRANT ALL ON public.company_wallet_ledger TO service_role;
ALTER TABLE public.company_wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view company wallet" ON public.company_wallet_ledger FOR SELECT TO authenticated
USING (public.can_view_company_finance(company_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.company_wallet_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Company wallet ledger is append-only; post a reversal instead'; END $$;
CREATE TRIGGER trg_company_wallet_ledger_immutable BEFORE UPDATE OR DELETE ON public.company_wallet_ledger
FOR EACH ROW EXECUTE FUNCTION public.company_wallet_ledger_immutable();

CREATE OR REPLACE VIEW public.company_wallet_balances WITH (security_invoker = true) AS
SELECT company_id, bucket_key, bucket_kind,
  SUM(CASE WHEN direction='in' THEN amount ELSE -amount END)::numeric(14,2) AS balance
FROM public.company_wallet_ledger GROUP BY company_id, bucket_key, bucket_kind;
GRANT SELECT ON public.company_wallet_balances TO authenticated, service_role;

CREATE OR REPLACE VIEW public.company_wallet_running WITH (security_invoker = true) AS
SELECT l.*, SUM(CASE WHEN direction='in' THEN amount ELSE -amount END)
  OVER (PARTITION BY company_id ORDER BY occurred_at, created_at, id)::numeric(14,2) AS running_balance
FROM public.company_wallet_ledger l;
GRANT SELECT ON public.company_wallet_running TO authenticated, service_role;

-- Loan requests
CREATE TABLE public.company_loan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BDT',
  purpose text NOT NULL,
  tenure_months integer CHECK (tenure_months IS NULL OR tenure_months BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  ledger_entry_id uuid REFERENCES public.company_wallet_ledger(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_loan_requests TO authenticated;
GRANT ALL ON public.company_loan_requests TO service_role;
ALTER TABLE public.company_loan_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view company loans" ON public.company_loan_requests FOR SELECT TO authenticated
USING (public.can_view_company_finance(company_id, auth.uid()));

-- RPCs
CREATE OR REPLACE FUNCTION public.save_company_fund_config(_company uuid, _buckets jsonb, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _v int; _total numeric; _b jsonb; _i int := 0;
BEGIN
  IF NOT (public.is_finance_admin(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only finance or group admins can change fund allocation'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN
    RAISE EXCEPTION 'Branta Tech uses the group fund allocation'; END IF;
  IF jsonb_typeof(_buckets) <> 'array' OR jsonb_array_length(_buckets) = 0 THEN
    RAISE EXCEPTION 'At least one bucket is required'; END IF;
  SELECT COALESCE(SUM((b->>'percent')::numeric),0) INTO _total FROM jsonb_array_elements(_buckets) b;
  IF _total <> 100 THEN RAISE EXCEPTION 'Bucket percentages must total 100%% (now %)', _total; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_buckets) b WHERE b->>'kind'='free') <> 1 THEN
    RAISE EXCEPTION 'Exactly one Free balance bucket is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cfc:'||_company));
  SELECT COALESCE(MAX(version),0)+1 INTO _v FROM company_fund_configs WHERE company_id=_company;
  UPDATE company_fund_configs SET is_active=false WHERE company_id=_company AND is_active;
  INSERT INTO company_fund_configs(company_id, version, note, created_by)
    VALUES (_company, _v, _note, auth.uid()) RETURNING id INTO _id;
  FOR _b IN SELECT * FROM jsonb_array_elements(_buckets) LOOP
    INSERT INTO company_fund_buckets(config_id, key, label, kind, percent, sort)
    VALUES (_id, _b->>'key', _b->>'label', _b->>'kind', (_b->>'percent')::numeric, _i);
    _i := _i + 1;
  END LOOP;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.company_wallet_credit_installment(_installment uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid; _amount numeric; _cfg uuid; _ref text; _n int := 0; _r record; _share numeric; _left numeric;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT cu.company_id, COALESCE(ii.paid_amount, ii.amount), i.invoice_no
    INTO _company, _amount, _ref
  FROM invoice_installments ii JOIN invoices i ON i.id = ii.invoice_id
  LEFT JOIN customers cu ON cu.id = i.customer_id
  WHERE ii.id = _installment AND ii.status = 'paid';
  IF _company IS NULL OR EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN RETURN 0; END IF;
  SELECT id INTO _cfg FROM company_fund_configs WHERE company_id=_company AND is_active;
  IF _cfg IS NULL THEN RAISE EXCEPTION 'No fund allocation configured for this company'; END IF;
  _left := _amount;
  FOR _r IN SELECT * FROM company_fund_buckets WHERE config_id=_cfg ORDER BY (kind='free'), sort LOOP
    IF _r.kind = 'free' THEN _share := _left; ELSE _share := round(_amount * _r.percent / 100, 2); END IF;
    _left := _left - CASE WHEN _r.kind='free' THEN 0 ELSE _share END;
    IF _share > 0 THEN
      INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
      VALUES (_company,_r.key,_r.kind,'in',_share,'revenue_credit','installment',_installment,_ref,'Installment received · '||_r.label,auth.uid())
      ON CONFLICT DO NOTHING;
      IF FOUND THEN _n := _n + 1; END IF;
    END IF;
  END LOOP;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.company_wallet_debit_expense(_expense uuid, _bucket text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e record; _kind text; _bal numeric; _id uuid;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO _e FROM expenses WHERE id=_expense AND deleted_at IS NULL;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE id=_e.company_id AND is_holding) THEN
    RAISE EXCEPTION 'Branta Tech expenses use the group fund ledger'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cwl:'||_e.company_id));
  SELECT bucket_kind, balance INTO _kind, _bal FROM company_wallet_balances WHERE company_id=_e.company_id AND bucket_key=COALESCE(_bucket,'free');
  IF _kind IS NULL OR _bal < _e.amount THEN RAISE EXCEPTION 'Insufficient wallet balance in this bucket'; END IF;
  INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,source_id,record_ref,description,created_by)
  VALUES (_e.company_id,COALESCE(_bucket,'free'),_kind,'out',_e.amount,'expense_debit','expense',_expense,_e.voucher_no,COALESCE(_e.vendor,'Expense'),auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.company_wallet_move(_company uuid, _from text, _to text, _amount numeric, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mv uuid := gen_random_uuid(); _fk text; _tk text; _bal numeric;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _amount <= 0 OR _from = _to OR COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Invalid movement'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cwl:'||_company));
  SELECT bucket_kind, balance INTO _fk, _bal FROM company_wallet_balances WHERE company_id=_company AND bucket_key=_from;
  IF _fk IS NULL OR _bal < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  SELECT b.kind INTO _tk FROM company_fund_buckets b JOIN company_fund_configs c ON c.id=b.config_id
    WHERE c.company_id=_company AND c.is_active AND b.key=_to;
  IF _tk IS NULL THEN RAISE EXCEPTION 'Target bucket not found'; END IF;
  INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,entry_type,source_type,movement_id,description,created_by)
  VALUES (_company,_from,_fk,'out',_amount,'bucket_movement','movement',_mv,_reason,auth.uid()),
         (_company,_to,_tk,'in',_amount,'bucket_movement','movement',_mv,_reason,auth.uid());
  RETURN _mv;
END $$;

CREATE OR REPLACE FUNCTION public.company_wallet_reverse(_entry uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e record; _id uuid;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Reason required'; END IF;
  SELECT * INTO _e FROM company_wallet_ledger WHERE id=_entry AND entry_type <> 'reversal';
  IF _e.id IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,currency,entry_type,source_type,source_id,record_ref,description,reverses_id,created_by)
  VALUES (_e.company_id,_e.bucket_key,_e.bucket_kind,CASE WHEN _e.direction='in' THEN 'out' ELSE 'in' END,_e.amount,_e.currency,'reversal',_e.source_type,_e.source_id,_e.record_ref,'Reversal: '||_reason,_entry,auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.company_loan_request(_company uuid, _amount numeric, _purpose text, _tenure integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.can_view_company_finance(_company, auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN RAISE EXCEPTION 'Branta Tech cannot request a group loan'; END IF;
  IF _amount <= 0 OR COALESCE(trim(_purpose),'') = '' THEN RAISE EXCEPTION 'Amount and purpose are required'; END IF;
  INSERT INTO company_loan_requests(company_id,amount,purpose,tenure_months,requested_by)
  VALUES (_company,_amount,trim(_purpose),_tenure,auth.uid()) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.company_loan_decide(_loan uuid, _approve boolean, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l record; _entry uuid;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'Only Finance can decide loans'; END IF;
  SELECT * INTO _l FROM company_loan_requests WHERE id=_loan FOR UPDATE;
  IF _l.id IS NULL OR _l.status <> 'pending' THEN RAISE EXCEPTION 'Loan is not pending'; END IF;
  IF _approve THEN
    INSERT INTO company_wallet_ledger(company_id,bucket_key,bucket_kind,direction,amount,currency,entry_type,source_type,source_id,record_ref,description,created_by)
    SELECT _l.company_id, b.key, 'free', 'in', _l.amount, _l.currency, 'loan_credit', 'loan', _l.id, 'LOAN', 'Group loan: '||_l.purpose, auth.uid()
    FROM company_fund_buckets b JOIN company_fund_configs c ON c.id=b.config_id
    WHERE c.company_id=_l.company_id AND c.is_active AND b.kind='free'
    RETURNING id INTO _entry;
    IF _entry IS NULL THEN RAISE EXCEPTION 'Company has no Free balance bucket configured'; END IF;
  END IF;
  UPDATE company_loan_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    decided_by=auth.uid(), decided_at=now(), decision_note=_note, ledger_entry_id=_entry, updated_at=now()
  WHERE id=_loan;
END $$;

CREATE OR REPLACE FUNCTION public.company_loan_cancel(_loan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE company_loan_requests SET status='cancelled', updated_at=now()
  WHERE id=_loan AND status='pending' AND (requested_by=auth.uid() OR public.is_finance_admin(auth.uid()));
  IF NOT FOUND THEN RAISE EXCEPTION 'Cannot cancel this request'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.save_company_fund_config(uuid,jsonb,text), public.company_wallet_credit_installment(uuid),
  public.company_wallet_debit_expense(uuid,text), public.company_wallet_move(uuid,text,text,numeric,text),
  public.company_wallet_reverse(uuid,text), public.company_loan_request(uuid,numeric,text,integer),
  public.company_loan_decide(uuid,boolean,text), public.company_loan_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_company_fund_config(uuid,jsonb,text), public.company_wallet_credit_installment(uuid),
  public.company_wallet_debit_expense(uuid,text), public.company_wallet_move(uuid,text,text,numeric,text),
  public.company_wallet_reverse(uuid,text), public.company_loan_request(uuid,numeric,text,integer),
  public.company_loan_decide(uuid,boolean,text), public.company_loan_cancel(uuid), public.can_view_company_finance(uuid,uuid) TO authenticated, service_role;
