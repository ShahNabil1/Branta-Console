
DO $$ BEGIN CREATE TYPE public.wallet_txn_type AS ENUM ('project_earning','salary','bonus','incentive','commission','overtime','adjustment_credit','adjustment_debit','withdrawal','refund','migration_opening_balance','correction','reversal'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  transaction_type public.wallet_txn_type NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit','debit')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'posted',
  project_id uuid, task_id uuid, invoice_id uuid, installment_id uuid,
  employee_payment_id uuid, salary_slip_id uuid, withdrawal_id uuid,
  reverses_id uuid REFERENCES public.wallet_ledger(id),
  source_type text NOT NULL, source_id text NOT NULL,
  reference text, description text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, direction)
);
CREATE INDEX wallet_ledger_emp_idx ON public.wallet_ledger(employee_id, currency, created_at, id);

CREATE TABLE public.wallet_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','paid','rejected','cancelled')),
  payment_method_id text, payment_method_snapshot jsonb,
  note text, admin_note text, transfer_ref text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz, decided_by uuid, paid_at timestamptz, paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_withdrawals_emp_idx ON public.wallet_withdrawals(employee_id, status);

CREATE TABLE public.wallet_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL, currency text NOT NULL DEFAULT 'BDT',
  old_available numeric NOT NULL, old_locked numeric NOT NULL, old_requested numeric NOT NULL, old_paid numeric NOT NULL,
  recalculated numeric NOT NULL, difference numeric NOT NULL,
  basis text NOT NULL CHECK (basis IN ('legacy_balance','recalculated')),
  opening_balance numeric NOT NULL, reason text NOT NULL, mismatch_resolution text,
  snapshot jsonb NOT NULL, ledger_id uuid REFERENCES public.wallet_ledger(id),
  performed_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, currency)
);

CREATE TABLE public.wallet_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL, employee_id uuid, amount numeric, currency text,
  reason text, source text, meta jsonb, performed_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_legacy_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL UNIQUE, employee_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('convert','cancel','link','keep')),
  amount numeric NOT NULL, employee_payment_id uuid, ledger_id uuid,
  reason text NOT NULL, performed_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_ledger, public.wallet_withdrawals, public.wallet_migrations, public.wallet_audit, public.wallet_legacy_actions TO authenticated;
GRANT ALL ON public.wallet_ledger, public.wallet_withdrawals, public.wallet_migrations, public.wallet_audit, public.wallet_legacy_actions TO service_role;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_legacy_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wl own or finance" ON public.wallet_ledger FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_finance_admin(auth.uid()));
CREATE POLICY "ww own or finance" ON public.wallet_withdrawals FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_finance_admin(auth.uid()));
CREATE POLICY "wm own or finance" ON public.wallet_migrations FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_finance_admin(auth.uid()));
CREATE POLICY "wa finance" ON public.wallet_audit FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));
CREATE POLICY "wla finance" ON public.wallet_legacy_actions FOR SELECT TO authenticated USING (public.is_finance_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.wallet_ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Wallet ledger entries cannot be edited or deleted — post a correction or reversal instead'; END $$;
CREATE TRIGGER wallet_ledger_no_update BEFORE UPDATE OR DELETE ON public.wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.wallet_ledger_immutable();
CREATE TRIGGER wallet_migrations_no_update BEFORE UPDATE OR DELETE ON public.wallet_migrations FOR EACH ROW EXECUTE FUNCTION public.wallet_ledger_immutable();
CREATE TRIGGER wallet_withdrawals_uat BEFORE UPDATE ON public.wallet_withdrawals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- helpers
CREATE OR REPLACE FUNCTION public.wallet_is_migrated(_user uuid, _currency text DEFAULT 'BDT') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM wallet_migrations WHERE employee_id=_user AND currency=_currency) $$;

CREATE OR REPLACE FUNCTION public.wallet_resolve_user(_emp uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT user_id FROM profiles WHERE id=_emp OR user_id=_emp LIMIT 1), _emp) $$;

CREATE OR REPLACE FUNCTION public.wallet_ledger_balance(_user uuid, _currency text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(sum(CASE WHEN direction='credit' THEN amount ELSE -amount END),0) FROM wallet_ledger
  WHERE employee_id=_user AND currency=_currency AND status='posted' $$;

CREATE OR REPLACE FUNCTION public.wallet_holds(_user uuid, _currency text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(sum(amount),0) FROM wallet_withdrawals WHERE employee_id=_user AND currency=_currency AND status IN ('requested','approved') $$;

-- central poster (internal)
CREATE OR REPLACE FUNCTION public.wallet_post(_user uuid, _currency text, _type public.wallet_txn_type, _dir text, _amount numeric,
  _source_type text, _source_id text, _desc text, _ref text DEFAULT NULL, _actor uuid DEFAULT NULL,
  _project uuid DEFAULT NULL, _task uuid DEFAULT NULL, _invoice uuid DEFAULT NULL, _inst uuid DEFAULT NULL,
  _efp uuid DEFAULT NULL, _slip uuid DEFAULT NULL, _wd uuid DEFAULT NULL, _reverses uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nid uuid;
BEGIN
  INSERT INTO wallet_ledger(employee_id,currency,transaction_type,direction,amount,source_type,source_id,description,reference,created_by,
    project_id,task_id,invoice_id,installment_id,employee_payment_id,salary_slip_id,withdrawal_id,reverses_id)
  VALUES (_user,coalesce(_currency,'BDT'),_type,_dir,round(_amount,2),_source_type,_source_id,_desc,_ref,_actor,
    _project,_task,_invoice,_inst,_efp,_slip,_wd,_reverses)
  ON CONFLICT (source_type,source_id,direction) DO NOTHING RETURNING id INTO nid;
  RETURN nid; -- NULL means duplicate (already posted)
END $$;
REVOKE ALL ON FUNCTION public.wallet_post FROM PUBLIC, anon, authenticated;

-- Employee Fund payment: credit new wallet when migrated, else legacy path
CREATE OR REPLACE FUNCTION public.efp_wallet_credit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid; a record; cur text; pid uuid; proj uuid;
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    uid := wallet_resolve_user(NEW.employee_id);
    IF NEW.allocation_id IS NOT NULL THEN SELECT * INTO a FROM installment_allocations WHERE id=NEW.allocation_id; END IF;
    SELECT currency, project_id INTO cur, proj FROM invoices WHERE id=coalesce(a.invoice_id, NEW.invoice_id);
    IF wallet_is_migrated(uid, coalesce(cur,'BDT')) THEN
      PERFORM wallet_post(uid, coalesce(cur,'BDT'),
        (CASE NEW.payment_type WHEN 'salary' THEN 'salary' WHEN 'bonus' THEN 'bonus' WHEN 'incentive' THEN 'incentive'
          WHEN 'commission' THEN 'commission' WHEN 'overtime' THEN 'overtime' ELSE 'project_earning' END)::wallet_txn_type,
        'credit', NEW.amount, 'employee_fund_payment', NEW.id::text, coalesce(NEW.description,'Project earning'),
        NEW.transaction_reference, auth.uid(), coalesce(NEW.project_id, proj), NEW.task_id, coalesce(a.invoice_id, NEW.invoice_id),
        a.installment_id, NEW.id, NEW.salary_slip_id);
    ELSIF NEW.payment_type='project_payment' AND NEW.invoice_payout_id IS NULL AND NEW.allocation_id IS NOT NULL AND uid IS NOT NULL THEN
      INSERT INTO invoice_payouts(invoice_id,installment_id,user_id,role,currency,amount,status,unlocked_at,source,notes)
      VALUES (a.invoice_id,a.installment_id,uid,'worker',coalesce(cur,'BDT'),NEW.amount,'available',now(),'employee_fund',coalesce(NEW.description,'Project earning'))
      RETURNING id INTO pid;
      NEW.invoice_payout_id := pid;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Salary slip issued → salary credit (migrated employees only)
CREATE OR REPLACE FUNCTION public.salary_wallet_credit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('issued','paid') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.net_amount > 0 AND wallet_is_migrated(NEW.user_id, coalesce(NEW.currency,'BDT')) THEN
    PERFORM wallet_post(NEW.user_id, coalesce(NEW.currency,'BDT'), 'salary', 'credit', NEW.net_amount, 'salary_slip', NEW.id::text,
      'Salary '||to_char(NEW.period_month,'Mon YYYY'), NEW.slip_no, auth.uid(), _slip => NEW.id);
  ELSIF NEW.status='void' AND TG_OP='UPDATE' AND OLD.status<>'void' THEN
    PERFORM wallet_post(l.employee_id, l.currency, 'reversal', 'debit', l.amount, 'salary_slip_void', NEW.id::text,
      'Salary slip voided', NEW.slip_no, auth.uid(), _slip => NEW.id, _reverses => l.id)
    FROM wallet_ledger l WHERE l.source_type='salary_slip' AND l.source_id=NEW.id::text;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_salary_wallet_credit AFTER INSERT OR UPDATE OF status ON public.salary_slips FOR EACH ROW EXECUTE FUNCTION public.salary_wallet_credit();

-- Legacy lock: migrated employees can't use old withdrawals
CREATE OR REPLACE FUNCTION public.legacy_withdrawal_block() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF wallet_is_migrated(NEW.user_id, coalesce(NEW.currency,'BDT')) THEN
    RAISE EXCEPTION 'Your wallet has moved to the new Wallet Ledger — request withdrawals from the new wallet';
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_legacy_withdrawal_block BEFORE INSERT ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION public.legacy_withdrawal_block();

-- Balances
CREATE OR REPLACE FUNCTION public.wallet_balances_v2(_user uuid DEFAULT NULL)
RETURNS TABLE(employee_id uuid, currency text, migrated boolean, ledger_balance numeric, holds numeric, available numeric,
  pending_committed numeric, legacy_pending numeric, today_earned numeric, week_earned numeric, month_earned numeric,
  total_earned numeric, total_withdrawn numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (_user IS NULL OR _user<>auth.uid()) AND NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH emps AS (
    SELECT DISTINCT x.u, x.c FROM (
      SELECT l.employee_id u, l.currency c FROM wallet_ledger l
      UNION SELECT m.employee_id, m.currency FROM wallet_migrations m
      UNION SELECT w.employee_id, w.currency FROM wallet_withdrawals w
      UNION SELECT p.user_id, 'BDT' FROM profiles p WHERE p.user_id IS NOT NULL
    ) x WHERE _user IS NULL OR x.u=_user
  ), led AS (
    SELECT l.employee_id u, l.currency c,
      sum(CASE WHEN l.direction='credit' THEN l.amount ELSE -l.amount END) bal,
      sum(CASE WHEN l.direction='credit' AND l.transaction_type NOT IN ('migration_opening_balance','reversal','correction','refund') AND (l.created_at AT TIME ZONE 'Asia/Dhaka')::date=d THEN l.amount ELSE 0 END) td,
      sum(CASE WHEN l.direction='credit' AND l.transaction_type NOT IN ('migration_opening_balance','reversal','correction','refund') AND (l.created_at AT TIME ZONE 'Asia/Dhaka')::date>=date_trunc('week',d)::date THEN l.amount ELSE 0 END) wk,
      sum(CASE WHEN l.direction='credit' AND l.transaction_type NOT IN ('migration_opening_balance','reversal','correction','refund') AND (l.created_at AT TIME ZONE 'Asia/Dhaka')::date>=date_trunc('month',d)::date THEN l.amount ELSE 0 END) mo,
      sum(CASE WHEN l.direction='credit' AND l.transaction_type NOT IN ('migration_opening_balance','reversal','correction','refund') THEN l.amount ELSE 0 END)
        - sum(CASE WHEN l.direction='debit' AND l.transaction_type='reversal' THEN l.amount ELSE 0 END) te,
      sum(CASE WHEN l.transaction_type='withdrawal' THEN l.amount WHEN l.transaction_type='refund' AND l.withdrawal_id IS NOT NULL THEN -l.amount ELSE 0 END) tw
    FROM wallet_ledger l WHERE l.status='posted' GROUP BY 1,2
  ), pend AS (
    SELECT wallet_resolve_user(e.employee_id) u, coalesce(i.currency,'BDT') c, sum(e.amount) amt
    FROM employee_fund_payments e LEFT JOIN invoices i ON i.id=e.invoice_id WHERE e.status='committed' GROUP BY 1,2
  ), leg AS (
    SELECT p.user_id u, p.currency c, sum(p.amount) amt FROM invoice_payouts p
    WHERE p.status='locked' AND p.role IS DISTINCT FROM 'company'
      AND NOT EXISTS (SELECT 1 FROM wallet_legacy_actions a WHERE a.payout_id=p.id AND a.action<>'keep') GROUP BY 1,2
  ), hold AS (
    SELECT w.employee_id u, w.currency c, sum(w.amount) amt FROM wallet_withdrawals w WHERE w.status IN ('requested','approved') GROUP BY 1,2
  )
  SELECT e.u, e.c, EXISTS(SELECT 1 FROM wallet_migrations m WHERE m.employee_id=e.u AND m.currency=e.c),
    coalesce(led.bal,0), coalesce(hold.amt,0), coalesce(led.bal,0)-coalesce(hold.amt,0),
    coalesce(pend.amt,0), coalesce(leg.amt,0), coalesce(led.td,0), coalesce(led.wk,0), coalesce(led.mo,0), coalesce(led.te,0), coalesce(led.tw,0)
  FROM emps e LEFT JOIN led ON led.u=e.u AND led.c=e.c LEFT JOIN pend ON pend.u=e.u AND pend.c=e.c
  LEFT JOIN leg ON leg.u=e.u AND leg.c=e.c LEFT JOIN hold ON hold.u=e.u AND hold.c=e.c;
END $$;

-- Statement
CREATE OR REPLACE FUNCTION public.wallet_statement_v2(_user uuid DEFAULT NULL)
RETURNS TABLE(id uuid, employee_id uuid, created_at timestamptz, description text, client text, project text, project_id uuid,
  invoice_slug text, installment text, task text, transaction_type text, direction text, credit numeric, debit numeric,
  status text, reference text, currency text, source_type text, source_id text, reverses_id uuid, created_by uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (_user IS NULL OR _user<>auth.uid()) AND NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT l.id, l.employee_id, l.created_at, l.description, c.name::text, coalesce(cp.name, cp2.name)::text, coalesce(l.project_id, i.project_id),
    i.slug::text, CASE WHEN ii.id IS NULL THEN NULL ELSE coalesce(ii.label,'Installment '||ii.sequence) END::text, t.title::text,
    l.transaction_type::text, l.direction,
    CASE WHEN l.direction='credit' THEN l.amount ELSE 0 END, CASE WHEN l.direction='debit' THEN l.amount ELSE 0 END,
    l.status, l.reference, l.currency, l.source_type, l.source_id, l.reverses_id, l.created_by
  FROM wallet_ledger l
  LEFT JOIN invoices i ON i.id=l.invoice_id
  LEFT JOIN customers c ON c.id=i.customer_id
  LEFT JOIN client_projects cp ON cp.id=i.project_id
  LEFT JOIN client_projects cp2 ON cp2.id=l.project_id
  LEFT JOIN invoice_installments ii ON ii.id=l.installment_id
  LEFT JOIN client_tasks t ON t.id=l.task_id
  WHERE _user IS NULL OR l.employee_id=_user
  ORDER BY l.created_at, l.id;
END $$;

-- Withdrawals
CREATE OR REPLACE FUNCTION public.wallet_request_withdrawal(_amount numeric, _currency text, _method_id text, _snapshot jsonb, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid := auth.uid(); avail numeric; nid uuid;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF NOT wallet_is_migrated(u, _currency) THEN RAISE EXCEPTION 'Your wallet has not been moved to the new Wallet Ledger yet'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wallet:'||u::text||':'||_currency));
  avail := wallet_ledger_balance(u,_currency) - wallet_holds(u,_currency);
  IF _amount > avail THEN RAISE EXCEPTION 'Amount is above your available balance (%)', avail; END IF;
  INSERT INTO wallet_withdrawals(employee_id,currency,amount,payment_method_id,payment_method_snapshot,note)
  VALUES (u,_currency,round(_amount,2),_method_id,_snapshot,_note) RETURNING id INTO nid;
  INSERT INTO wallet_audit(action,employee_id,amount,currency,source,performed_by,reason) VALUES ('withdrawal_requested',u,_amount,_currency,nid::text,u,_note);
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_withdrawal_set_status(_id uuid, _status text, _note text DEFAULT NULL, _ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w wallet_withdrawals; me uuid := auth.uid(); fin boolean := is_finance_admin(auth.uid());
BEGIN
  SELECT * INTO w FROM wallet_withdrawals WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF _status='cancelled' THEN
    IF w.employee_id<>me AND NOT fin THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF w.status<>'requested' THEN RAISE EXCEPTION 'Only requested withdrawals can be cancelled'; END IF;
  ELSE
    IF NOT fin THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF _status='approved' AND w.status<>'requested' THEN RAISE EXCEPTION 'Only requested withdrawals can be approved'; END IF;
    IF _status='rejected' AND w.status NOT IN ('requested','approved') THEN RAISE EXCEPTION 'This withdrawal can no longer be rejected'; END IF;
    IF _status='rejected' AND length(coalesce(trim(_note),''))<5 THEN RAISE EXCEPTION 'Reason (≥5 characters) is required'; END IF;
    IF _status='paid' AND w.status NOT IN ('requested','approved') THEN RAISE EXCEPTION 'This withdrawal can no longer be paid'; END IF;
    IF _status NOT IN ('approved','rejected','paid') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  END IF;
  UPDATE wallet_withdrawals SET status=_status, admin_note=coalesce(_note,admin_note), transfer_ref=coalesce(_ref,transfer_ref),
    decided_at=CASE WHEN _status IN ('approved','rejected','cancelled') THEN now() ELSE decided_at END,
    decided_by=CASE WHEN _status IN ('approved','rejected','cancelled') THEN me ELSE decided_by END,
    paid_at=CASE WHEN _status='paid' THEN now() ELSE paid_at END, paid_by=CASE WHEN _status='paid' THEN me ELSE paid_by END
  WHERE id=_id;
  IF _status='paid' THEN
    -- hold released by status change; single debit posted (unique per withdrawal)
    PERFORM wallet_post(w.employee_id,w.currency,'withdrawal','debit',w.amount,'withdrawal',w.id::text,'Withdrawal paid',_ref,me,_wd=>w.id);
  END IF;
  INSERT INTO wallet_audit(action,employee_id,amount,currency,source,performed_by,reason) VALUES ('withdrawal_'||_status,w.employee_id,w.amount,w.currency,w.id::text,me,_note);
END $$;

-- Manual finance entries
CREATE OR REPLACE FUNCTION public.wallet_post_manual(_user uuid, _type text, _amount numeric, _currency text, _reason text,
  _project uuid DEFAULT NULL, _ref text DEFAULT NULL, _idem uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE dir text; nid uuid;
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _type NOT IN ('salary','bonus','incentive','commission','overtime','adjustment_credit','adjustment_debit','correction') THEN RAISE EXCEPTION 'Invalid type'; END IF;
  IF length(coalesce(trim(_reason),''))<5 THEN RAISE EXCEPTION 'Reason (≥5 characters) is required'; END IF;
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF NOT wallet_is_migrated(_user,_currency) THEN RAISE EXCEPTION 'Migrate this employee to the new wallet first'; END IF;
  dir := CASE WHEN _type IN ('adjustment_debit','correction') THEN 'debit' ELSE 'credit' END;
  IF dir='debit' THEN
    PERFORM pg_advisory_xact_lock(hashtext('wallet:'||_user::text||':'||_currency));
    IF _amount > wallet_ledger_balance(_user,_currency)-wallet_holds(_user,_currency) THEN RAISE EXCEPTION 'Debit is above the available balance'; END IF;
  END IF;
  nid := wallet_post(_user,_currency,_type::wallet_txn_type,dir,_amount,'manual',coalesce(_idem,gen_random_uuid())::text,_reason,_ref,auth.uid(),_project);
  IF nid IS NULL THEN RAISE EXCEPTION 'This entry was already posted'; END IF;
  INSERT INTO wallet_audit(action,employee_id,amount,currency,source,performed_by,reason) VALUES ('manual_'||_type,_user,_amount,_currency,nid::text,auth.uid(),_reason);
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_reverse(_id uuid, _reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l wallet_ledger; nid uuid;
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(coalesce(trim(_reason),''))<5 THEN RAISE EXCEPTION 'Reason (≥5 characters) is required'; END IF;
  SELECT * INTO l FROM wallet_ledger WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF l.transaction_type='reversal' THEN RAISE EXCEPTION 'A reversal cannot be reversed'; END IF;
  IF l.transaction_type='withdrawal' THEN RAISE EXCEPTION 'Withdrawals cannot be reversed here'; END IF;
  nid := wallet_post(l.employee_id,l.currency,'reversal',CASE WHEN l.direction='credit' THEN 'debit' ELSE 'credit' END,l.amount,
    'reversal',l.id::text,'Reversal: '||_reason,l.reference,auth.uid(),l.project_id,l.task_id,l.invoice_id,l.installment_id,l.employee_payment_id,l.salary_slip_id,NULL,l.id);
  IF nid IS NULL THEN RAISE EXCEPTION 'This entry was already reversed'; END IF;
  INSERT INTO wallet_audit(action,employee_id,amount,currency,source,performed_by,reason) VALUES ('reversal',l.employee_id,l.amount,l.currency,l.id::text,auth.uid(),_reason);
  RETURN nid;
END $$;

-- Migration preview
CREATE OR REPLACE FUNCTION public.wallet_migration_preview()
RETURNS TABLE(employee_id uuid, name text, currency text, old_available numeric, old_locked numeric, old_requested numeric, old_paid numeric,
  payouts_credited numeric, paid_withdrawals numeric, open_withdrawals numeric, recalculated numeric, difference numeric,
  payout_count bigint, withdrawal_count bigint, migrated boolean, opening_balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH po AS (
    SELECT p.user_id u, p.currency c,
      sum(CASE WHEN p.status='available' THEN p.amount ELSE 0 END) av, sum(CASE WHEN p.status='locked' THEN p.amount ELSE 0 END) lk,
      sum(CASE WHEN p.status='requested' THEN p.amount ELSE 0 END) rq, sum(CASE WHEN p.status='paid' THEN p.amount ELSE 0 END) pd,
      sum(CASE WHEN p.status IN ('available','requested','paid') THEN p.amount ELSE 0 END) cr, count(*) n
    FROM invoice_payouts p WHERE p.role IS DISTINCT FROM 'company' AND p.user_id IS NOT NULL GROUP BY 1,2
  ), wr AS (
    SELECT w.user_id u, w.currency c, sum(CASE WHEN w.status='paid' THEN w.amount ELSE 0 END) pw,
      sum(CASE WHEN w.status IN ('pending','approved') THEN w.amount ELSE 0 END) ow, count(*) n
    FROM withdrawal_requests w GROUP BY 1,2
  ), k AS (SELECT u,c FROM po UNION SELECT u,c FROM wr)
  SELECT k.u, coalesce(pr.full_name, pr.legal_full_name, pr.employee_code, k.u::text)::text, k.c,
    coalesce(po.av,0), coalesce(po.lk,0), coalesce(po.rq,0), coalesce(po.pd,0), coalesce(po.cr,0), coalesce(wr.pw,0), coalesce(wr.ow,0),
    coalesce(po.cr,0)-coalesce(wr.pw,0)-coalesce(wr.ow,0),
    coalesce(po.av,0)-(coalesce(po.cr,0)-coalesce(wr.pw,0)-coalesce(wr.ow,0)),
    coalesce(po.n,0), coalesce(wr.n,0), m.id IS NOT NULL, m.opening_balance
  FROM k LEFT JOIN po ON po.u=k.u AND po.c=k.c LEFT JOIN wr ON wr.u=k.u AND wr.c=k.c
  LEFT JOIN profiles pr ON pr.user_id=k.u LEFT JOIN wallet_migrations m ON m.employee_id=k.u AND m.currency=k.c
  ORDER BY 2;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_migrate(_user uuid, _currency text, _basis text, _reason text, _resolution text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; opening numeric; lid uuid; mid uuid;
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(coalesce(trim(_reason),''))<5 THEN RAISE EXCEPTION 'Migration reason (≥5 characters) is required'; END IF;
  IF _basis NOT IN ('legacy_balance','recalculated') THEN RAISE EXCEPTION 'Choose a migration basis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wallet-migrate:'||_user::text||':'||_currency));
  IF wallet_is_migrated(_user,_currency) THEN RAISE EXCEPTION 'This employee was already migrated — migration cannot be repeated'; END IF;
  SELECT * INTO r FROM wallet_migration_preview() p WHERE p.employee_id=_user AND p.currency=_currency;
  IF NOT FOUND THEN
    r := NULL; SELECT 0::numeric old_available,0::numeric old_locked,0::numeric old_requested,0::numeric old_paid,0::numeric recalculated,0::numeric difference,0::numeric open_withdrawals INTO r;
  END IF;
  IF r.open_withdrawals > 0 OR r.old_requested > 0 THEN RAISE EXCEPTION 'Settle this employee''s open legacy withdrawal requests first'; END IF;
  IF r.difference <> 0 AND length(coalesce(trim(_resolution),''))<10 THEN
    RAISE EXCEPTION 'Numbers do not match (difference %). Explain the mismatch resolution (≥10 characters) to continue', r.difference;
  END IF;
  opening := CASE WHEN _basis='legacy_balance' THEN r.old_available ELSE r.recalculated END;
  IF opening < 0 THEN RAISE EXCEPTION 'Opening balance would be negative (%) — resolve before migrating', opening; END IF;
  IF opening > 0 THEN
    lid := wallet_post(_user,_currency,'migration_opening_balance','credit',opening,'migration',_user::text||':'||_currency,
      'Opening balance migrated from legacy wallet',NULL,auth.uid());
  END IF;
  INSERT INTO wallet_migrations(employee_id,currency,old_available,old_locked,old_requested,old_paid,recalculated,difference,basis,opening_balance,
    reason,mismatch_resolution,snapshot,ledger_id,performed_by)
  VALUES (_user,_currency,r.old_available,r.old_locked,r.old_requested,r.old_paid,r.recalculated,r.difference,_basis,opening,_reason,_resolution,
    jsonb_build_object('preview',to_jsonb(r),
      'payouts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'amount',amount,'source',source)),'[]') FROM invoice_payouts WHERE user_id=_user AND currency=_currency),
      'withdrawals',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'amount',amount)),'[]') FROM withdrawal_requests WHERE user_id=_user AND currency=_currency)),
    lid,auth.uid()) RETURNING id INTO mid;
  INSERT INTO wallet_audit(action,employee_id,amount,currency,source,performed_by,reason,meta)
  VALUES ('migration',_user,opening,_currency,mid::text,auth.uid(),_reason,jsonb_build_object('basis',_basis,'difference',r.difference,'resolution',_resolution));
  RETURN mid;
END $$;

-- Legacy pending
CREATE OR REPLACE FUNCTION public.wallet_legacy_pending(_user uuid DEFAULT NULL)
RETURNS TABLE(payout_id uuid, employee_id uuid, invoice_slug text, installment text, amount numeric, currency text, created_at timestamptz, action text, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (_user IS NULL OR _user<>auth.uid()) AND NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT p.id, p.user_id, i.slug::text, coalesce(ii.label,'Installment '||ii.sequence)::text, p.amount, p.currency, p.created_at, a.action, a.reason
  FROM invoice_payouts p LEFT JOIN invoices i ON i.id=p.invoice_id LEFT JOIN invoice_installments ii ON ii.id=p.installment_id
  LEFT JOIN wallet_legacy_actions a ON a.payout_id=p.id
  WHERE p.status='locked' AND p.role IS DISTINCT FROM 'company' AND (_user IS NULL OR p.user_id=_user) ORDER BY p.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_legacy_pending_action(_payout uuid, _action text, _reason text, _efp uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p invoice_payouts; lid uuid; proj uuid;
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(coalesce(trim(_reason),''))<5 THEN RAISE EXCEPTION 'Reason (≥5 characters) is required'; END IF;
  SELECT * INTO p FROM invoice_payouts WHERE id=_payout;
  IF NOT FOUND OR p.status<>'locked' THEN RAISE EXCEPTION 'Legacy pending item not found'; END IF;
  IF EXISTS (SELECT 1 FROM wallet_legacy_actions WHERE payout_id=_payout AND action<>'keep') THEN RAISE EXCEPTION 'Already resolved'; END IF;
  IF _action='convert' THEN
    IF NOT wallet_is_migrated(p.user_id,p.currency) THEN RAISE EXCEPTION 'Migrate this employee first'; END IF;
    SELECT project_id INTO proj FROM invoices WHERE id=p.invoice_id;
    lid := wallet_post(p.user_id,p.currency,'project_earning','credit',p.amount,'legacy_payout',p.id::text,
      coalesce(p.notes,'Legacy payout converted'),NULL,auth.uid(),proj,NULL,p.invoice_id,p.installment_id);
  ELSIF _action='link' AND _efp IS NULL THEN RAISE EXCEPTION 'Choose the Employee Fund payment to link';
  ELSIF _action NOT IN ('cancel','link','keep') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  INSERT INTO wallet_legacy_actions(payout_id,employee_id,action,amount,employee_payment_id,ledger_id,reason,performed_by)
  VALUES (_payout,p.user_id,_action,p.amount,_efp,lid,_reason,auth.uid())
  ON CONFLICT (payout_id) DO UPDATE SET action=EXCLUDED.action, employee_payment_id=EXCLUDED.employee_payment_id, ledger_id=EXCLUDED.ledger_id,
    reason=EXCLUDED.reason, performed_by=EXCLUDED.performed_by, created_at=now();
  INSERT INTO wallet_audit(action,employee_id,amount,currency,source,performed_by,reason) VALUES ('legacy_pending_'||_action,p.user_id,p.amount,p.currency,p.id::text,auth.uid(),_reason);
END $$;

-- Reconciliation
CREATE OR REPLACE FUNCTION public.wallet_reconciliation()
RETURNS TABLE(employee_id uuid, currency text, opening numeric, credits numeric, debits numeric, ledger_balance numeric,
  expected numeric, difference numeric, pending_payments numeric, pending_withdrawals numeric, total_earned numeric, total_withdrawn numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH m AS (SELECT * FROM wallet_migrations),
  l AS (SELECT w.employee_id u, w.currency c,
      sum(CASE WHEN direction='credit' THEN amount ELSE 0 END) cr, sum(CASE WHEN direction='debit' THEN amount ELSE 0 END) db
      FROM wallet_ledger w WHERE status='posted' GROUP BY 1,2),
  src AS ( -- expected from sources, independent of ledger
    SELECT u,c,sum(v) v FROM (
      SELECT m.employee_id u, m.currency c, m.opening_balance v FROM m
      UNION ALL SELECT wallet_resolve_user(e.employee_id), coalesce(i.currency,'BDT'), e.amount FROM employee_fund_payments e
        LEFT JOIN invoices i ON i.id=e.invoice_id
        WHERE e.status='paid' AND EXISTS (SELECT 1 FROM wallet_ledger x WHERE x.source_type='employee_fund_payment' AND x.source_id=e.id::text)
      UNION ALL SELECT s.user_id, s.currency, s.net_amount FROM salary_slips s WHERE EXISTS (SELECT 1 FROM wallet_ledger x WHERE x.source_type='salary_slip' AND x.source_id=s.id::text)
      UNION ALL SELECT x.employee_id, x.currency, CASE WHEN x.direction='credit' THEN x.amount ELSE -x.amount END FROM wallet_ledger x WHERE x.source_type IN ('manual','reversal','legacy_payout','salary_slip_void')
      UNION ALL SELECT w.employee_id, w.currency, -w.amount FROM wallet_withdrawals w WHERE w.status='paid'
    ) z GROUP BY 1,2),
  b AS (SELECT * FROM wallet_balances_v2(NULL))
  SELECT m.employee_id, m.currency, m.opening_balance, coalesce(l.cr,0), coalesce(l.db,0), coalesce(l.cr,0)-coalesce(l.db,0),
    coalesce(src.v,0), coalesce(l.cr,0)-coalesce(l.db,0)-coalesce(src.v,0), b.pending_committed, b.holds, b.total_earned, b.total_withdrawn
  FROM m LEFT JOIN l ON l.u=m.employee_id AND l.c=m.currency LEFT JOIN src ON src.u=m.employee_id AND src.c=m.currency
  LEFT JOIN b ON b.employee_id=m.employee_id AND b.currency=m.currency;
END $$;

REVOKE ALL ON FUNCTION public.wallet_balances_v2, public.wallet_statement_v2, public.wallet_request_withdrawal, public.wallet_withdrawal_set_status,
  public.wallet_post_manual, public.wallet_reverse, public.wallet_migration_preview, public.wallet_migrate, public.wallet_legacy_pending,
  public.wallet_legacy_pending_action, public.wallet_reconciliation FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_balances_v2, public.wallet_statement_v2, public.wallet_request_withdrawal, public.wallet_withdrawal_set_status,
  public.wallet_post_manual, public.wallet_reverse, public.wallet_migration_preview, public.wallet_migrate, public.wallet_legacy_pending,
  public.wallet_legacy_pending_action, public.wallet_reconciliation TO authenticated;
