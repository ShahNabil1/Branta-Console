DROP FUNCTION IF EXISTS public.wallet_migrate(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.wallet_migration_preview();

CREATE OR REPLACE FUNCTION public.salary_wallet_credit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('issued','paid') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.net_amount > 0 THEN
    PERFORM wallet_post(NEW.user_id, coalesce(NEW.currency,'BDT'), 'salary', 'credit', NEW.net_amount, 'salary_slip', NEW.id::text,
      'Salary '||to_char(NEW.period_month,'Mon YYYY'), NEW.slip_no, auth.uid(), _slip => NEW.id);
  ELSIF NEW.status='void' AND TG_OP='UPDATE' AND OLD.status<>'void' THEN
    PERFORM wallet_post(l.employee_id, l.currency, 'reversal', 'debit', l.amount, 'salary_slip_void', NEW.id::text,
      'Salary slip voided', NEW.slip_no, auth.uid(), _slip => NEW.id, _reverses => l.id)
    FROM wallet_ledger l WHERE l.source_type='salary_slip' AND l.source_id=NEW.id::text;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.efp_wallet_credit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid; a record; cur text; proj uuid;
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    uid := wallet_resolve_user(NEW.employee_id);
    IF NEW.allocation_id IS NOT NULL THEN SELECT * INTO a FROM installment_allocations WHERE id=NEW.allocation_id; END IF;
    SELECT currency, project_id INTO cur, proj FROM invoices WHERE id=coalesce(a.invoice_id, NEW.invoice_id);
    IF uid IS NOT NULL THEN
      PERFORM wallet_post(uid, coalesce(cur,'BDT'),
        (CASE NEW.payment_type WHEN 'salary' THEN 'salary' WHEN 'bonus' THEN 'bonus' WHEN 'incentive' THEN 'incentive'
          WHEN 'commission' THEN 'commission' WHEN 'overtime' THEN 'overtime' ELSE 'project_earning' END)::wallet_txn_type,
        'credit', NEW.amount, 'employee_fund_payment', NEW.id::text, coalesce(NEW.description,'Project earning'),
        NEW.transaction_reference, auth.uid(), coalesce(NEW.project_id, proj), NEW.task_id, coalesce(a.invoice_id, NEW.invoice_id),
        a.installment_id, NEW.id, NEW.salary_slip_id);
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.legacy_withdrawal_block()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Wallets use the new Wallet Ledger — request withdrawals from the new wallet';
END $function$;

CREATE OR REPLACE FUNCTION public.wallet_request_withdrawal(_amount numeric, _currency text, _method_id text, _snapshot jsonb, _note text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE u uuid := auth.uid(); avail numeric; nid uuid;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wallet:'||u::text||':'||_currency));
  avail := wallet_ledger_balance(u,_currency) - wallet_holds(u,_currency);
  IF _amount > avail THEN RAISE EXCEPTION 'Amount is above your available balance (%)', avail; END IF;
  INSERT INTO wallet_withdrawals(employee_id,currency,amount,payment_method_id,payment_method_snapshot,note)
  VALUES (u,_currency,round(_amount,2),_method_id,_snapshot,_note) RETURNING id INTO nid;
  INSERT INTO wallet_audit(action,employee_id,amount,currency,source,performed_by,reason) VALUES ('withdrawal_requested',u,_amount,_currency,nid::text,u,_note);
  RETURN nid;
END $function$;

CREATE OR REPLACE FUNCTION public.wallet_post_manual(_user uuid, _type text, _amount numeric, _currency text, _reason text, _project uuid DEFAULT NULL::uuid, _ref text DEFAULT NULL::text, _idem uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE dir text; nid uuid;
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _type NOT IN ('salary','bonus','incentive','commission','overtime','adjustment_credit','adjustment_debit','correction') THEN RAISE EXCEPTION 'Invalid type'; END IF;
  IF length(coalesce(trim(_reason),''))<5 THEN RAISE EXCEPTION 'Reason (≥5 characters) is required'; END IF;
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  dir := CASE WHEN _type IN ('adjustment_debit','correction') THEN 'debit' ELSE 'credit' END;
  IF dir='debit' THEN
    PERFORM pg_advisory_xact_lock(hashtext('wallet:'||_user::text||':'||_currency));
    IF _amount > wallet_ledger_balance(_user,_currency)-wallet_holds(_user,_currency) THEN RAISE EXCEPTION 'Debit is above the available balance'; END IF;
  END IF;
  nid := wallet_post(_user,_currency,_type::wallet_txn_type,dir,_amount,'manual',coalesce(_idem,gen_random_uuid())::text,_reason,_ref,auth.uid(),_project);
  IF nid IS NULL THEN RAISE EXCEPTION 'This entry was already posted'; END IF;
  INSERT INTO wallet_audit(action,employee_id,amount,currency,source,performed_by,reason) VALUES ('manual_'||_type,_user,_amount,_currency,nid::text,auth.uid(),_reason);
  RETURN nid;
END $function$;

CREATE OR REPLACE FUNCTION public.wallet_legacy_pending_action(_payout uuid, _action text, _reason text, _efp uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p invoice_payouts; lid uuid; proj uuid;
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(coalesce(trim(_reason),''))<5 THEN RAISE EXCEPTION 'Reason (≥5 characters) is required'; END IF;
  SELECT * INTO p FROM invoice_payouts WHERE id=_payout;
  IF NOT FOUND OR p.status<>'locked' THEN RAISE EXCEPTION 'Legacy pending item not found'; END IF;
  IF EXISTS (SELECT 1 FROM wallet_legacy_actions WHERE payout_id=_payout AND action<>'keep') THEN RAISE EXCEPTION 'Already resolved'; END IF;
  IF _action='convert' THEN
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
END $function$;

CREATE OR REPLACE FUNCTION public.wallet_reconciliation()
 RETURNS TABLE(employee_id uuid, currency text, opening numeric, credits numeric, debits numeric, ledger_balance numeric, expected numeric, difference numeric, pending_payments numeric, pending_withdrawals numeric, total_earned numeric, total_withdrawn numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH m AS (SELECT * FROM wallet_migrations),
  l AS (SELECT w.employee_id u, w.currency c,
      sum(CASE WHEN direction='credit' THEN amount ELSE 0 END) cr, sum(CASE WHEN direction='debit' THEN amount ELSE 0 END) db
      FROM wallet_ledger w WHERE status='posted' GROUP BY 1,2),
  src AS (
    SELECT u,c,sum(v) v FROM (
      SELECT m.employee_id u, m.currency c, m.opening_balance v FROM m
      UNION ALL SELECT wallet_resolve_user(e.employee_id), coalesce(i.currency,'BDT'), e.amount FROM employee_fund_payments e
        LEFT JOIN invoices i ON i.id=e.invoice_id
        WHERE e.status='paid' AND EXISTS (SELECT 1 FROM wallet_ledger x WHERE x.source_type='employee_fund_payment' AND x.source_id=e.id::text)
      UNION ALL SELECT s.user_id, s.currency, s.net_amount FROM salary_slips s WHERE EXISTS (SELECT 1 FROM wallet_ledger x WHERE x.source_type='salary_slip' AND x.source_id=s.id::text)
      UNION ALL SELECT x.employee_id, x.currency, CASE WHEN x.direction='credit' THEN x.amount ELSE -x.amount END FROM wallet_ledger x WHERE x.source_type IN ('manual','reversal','legacy_payout','salary_slip_void')
      UNION ALL SELECT w.employee_id, w.currency, -w.amount FROM wallet_withdrawals w WHERE w.status='paid'
    ) z GROUP BY 1,2),
  b AS (SELECT * FROM wallet_balances_v2(NULL)),
  k AS (SELECT m.employee_id u, m.currency c FROM m UNION SELECT l.u, l.c FROM l
        UNION SELECT w.employee_id, w.currency FROM wallet_withdrawals w)
  SELECT k.u, k.c, coalesce(m.opening_balance,0), coalesce(l.cr,0), coalesce(l.db,0), coalesce(l.cr,0)-coalesce(l.db,0),
    coalesce(src.v,0), coalesce(l.cr,0)-coalesce(l.db,0)-coalesce(src.v,0), coalesce(b.pending_committed,0), coalesce(b.holds,0),
    coalesce(b.total_earned,0), coalesce(b.total_withdrawn,0)
  FROM k LEFT JOIN m ON m.employee_id=k.u AND m.currency=k.c LEFT JOIN l ON l.u=k.u AND l.c=k.c
  LEFT JOIN src ON src.u=k.u AND src.c=k.c LEFT JOIN b ON b.employee_id=k.u AND b.currency=k.c;
END $function$;