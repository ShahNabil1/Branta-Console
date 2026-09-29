ALTER TABLE public.invoice_payouts DROP CONSTRAINT invoice_payouts_source_check;
ALTER TABLE public.invoice_payouts ADD CONSTRAINT invoice_payouts_source_check CHECK (source IN ('invoice','manual','employee_fund'));
ALTER TABLE public.invoice_payouts DROP CONSTRAINT invoice_payouts_source_refs_check;
ALTER TABLE public.invoice_payouts ADD CONSTRAINT invoice_payouts_source_refs_check CHECK (
  (source='invoice' AND invoice_id IS NOT NULL AND installment_id IS NOT NULL AND stakeholder_id IS NOT NULL)
  OR (source='manual' AND invoice_id IS NULL AND installment_id IS NULL AND stakeholder_id IS NULL AND kind IS NOT NULL)
  OR (source='employee_fund' AND stakeholder_id IS NULL));
ALTER TABLE public.employee_fund_payments ADD COLUMN IF NOT EXISTS plan_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS efp_alloc_plan_uniq ON public.employee_fund_payments(allocation_id, plan_id) WHERE plan_id IS NOT NULL AND status <> 'cancelled';

-- 1) Planned distribution -> Draft payments once allocation is committed
CREATE OR REPLACE FUNCTION public.materialize_employee_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; inv record; pool numeric; emp_pct numeric; expected numeric; p record; amt numeric; used numeric;
BEGIN
  SELECT * INTO a FROM installment_allocations WHERE id = NEW.id;
  IF a.status <> 'active' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM invoice_employee_plans WHERE invoice_id = a.invoice_id) THEN RETURN NULL; END IF;
  SELECT * INTO inv FROM invoices WHERE id = a.invoice_id;
  SELECT coalesce(sum(it.amount),0) INTO pool FROM installment_allocation_items it JOIN finance_funds f ON f.id=it.fund_id WHERE it.allocation_id=a.id AND f.code='employee';
  IF pool <= 0 THEN RETURN NULL; END IF;
  SELECT coalesce(max(vi.percent),0) INTO emp_pct FROM fund_allocation_version_items vi JOIN finance_funds f ON f.id=vi.fund_id WHERE vi.version_id=a.version_id AND f.code='employee';
  expected := greatest(coalesce(inv.total_amount,0) - coalesce(inv.project_cost_total,0), 0) * emp_pct / 100;
  IF expected <= 0 THEN RETURN NULL; END IF;
  SELECT coalesce(sum(amount),0) INTO used FROM employee_fund_payments WHERE allocation_id=a.id AND status<>'cancelled';
  FOR p IN SELECT * FROM invoice_employee_plans WHERE invoice_id=a.invoice_id ORDER BY sequence LOOP
    IF EXISTS (SELECT 1 FROM employee_fund_payments WHERE allocation_id=a.id AND plan_id=p.id AND status<>'cancelled') THEN CONTINUE; END IF;
    amt := least(round(pool * p.planned_amount / expected, 2), round(pool - used, 2));
    IF amt IS NULL OR amt <= 0 THEN CONTINUE; END IF;
    INSERT INTO employee_fund_payments(employee_id,payment_type,amount,project_id,invoice_id,task_id,allocation_id,plan_id,description,notes,status,created_by)
    VALUES (p.employee_id,'project_payment',amt,a.project_id,a.invoice_id,p.task_id,a.id,p.id,
            'Project earning · '||coalesce(inv.slug,'')||' (from invoice plan)', p.note, 'draft', coalesce(a.created_by, p.created_by));
    used := used + amt;
  END LOOP;
  INSERT INTO fund_audit_logs(user_id,action,record_type,record_id,next) VALUES (a.created_by,'employee_plan_materialized','installment_allocation',a.id,jsonb_build_object('pool',pool,'expected_pool',expected));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_materialize_employee_plan ON public.installment_allocations;
CREATE CONSTRAINT TRIGGER trg_materialize_employee_plan AFTER INSERT ON public.installment_allocations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.materialize_employee_plan();

-- 2) Paid employee payment -> one Available wallet credit (existing wallet)
CREATE OR REPLACE FUNCTION public.efp_wallet_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid; a record; cur text; pid uuid;
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.payment_type='project_payment'
     AND NEW.invoice_payout_id IS NULL AND NEW.allocation_id IS NOT NULL THEN
    SELECT user_id INTO uid FROM profiles WHERE id=NEW.employee_id OR user_id=NEW.employee_id LIMIT 1;
    IF uid IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO a FROM installment_allocations WHERE id=NEW.allocation_id;
    SELECT currency INTO cur FROM invoices WHERE id=a.invoice_id;
    INSERT INTO invoice_payouts(invoice_id,installment_id,user_id,role,currency,amount,status,unlocked_at,source,notes)
    VALUES (a.invoice_id,a.installment_id,uid,'worker',coalesce(cur,'BDT'),NEW.amount,'available',now(),'employee_fund',coalesce(NEW.description,'Project earning'))
    RETURNING id INTO pid;
    NEW.invoice_payout_id := pid;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_efp_wallet_credit ON public.employee_fund_payments;
CREATE TRIGGER trg_efp_wallet_credit BEFORE UPDATE OF status ON public.employee_fund_payments FOR EACH ROW EXECUTE FUNCTION public.efp_wallet_credit();

-- 3) Legacy payout automation must not touch employee_fund wallet rows
CREATE OR REPLACE FUNCTION public.sync_payouts_on_installment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE cur_currency text; inv_status text; inv_total numeric; inv_cost numeric; ratio numeric; fl boolean;
BEGIN
  SELECT currency, status, total_amount, COALESCE(project_cost_total, 0), fund_ledger_mode
    INTO cur_currency, inv_status, inv_total, inv_cost, fl FROM public.invoices WHERE id = NEW.invoice_id;
  IF fl THEN RETURN NEW; END IF;
  ratio := CASE WHEN COALESCE(inv_total, 0) > 0 THEN GREATEST(inv_total - COALESCE(inv_cost, 0), 0) / inv_total ELSE 1 END;
  DELETE FROM public.invoice_payouts WHERE installment_id = NEW.id AND source = 'invoice';
  INSERT INTO public.invoice_payouts (invoice_id, installment_id, stakeholder_id, user_id, role, currency, amount, status, unlocked_at)
  SELECT NEW.invoice_id, NEW.id, s.id, s.user_id, s.role, cur_currency,
    round(NEW.amount * ratio * s.percent / 100.0, 2),
    CASE WHEN inv_status = 'paid' THEN 'available'::public.payout_status ELSE 'locked'::public.payout_status END,
    CASE WHEN inv_status = 'paid' THEN now() ELSE NULL END
  FROM public.invoice_stakeholders s WHERE s.invoice_id = NEW.invoice_id;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sync_payouts_on_invoice_status()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    UPDATE public.invoice_payouts SET status = 'available', unlocked_at = now(), updated_at = now()
      WHERE invoice_id = NEW.id AND status = 'locked' AND source = 'invoice';
  ELSIF OLD.status = 'paid' AND NEW.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.invoice_payouts SET status = 'locked', unlocked_at = NULL, updated_at = now()
      WHERE invoice_id = NEW.id AND status = 'available' AND source = 'invoice';
  END IF;
  RETURN NEW;
END $function$;

-- 4) Invoice delete keeps earned wallet money
CREATE OR REPLACE FUNCTION public.archive_invoice(_invoice_id uuid, _reason text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE clean boolean; a record; inv record; r text;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'Finance access required'; END IF;
  r := CASE WHEN length(coalesce(_reason,'')) >= 5 THEN _reason ELSE 'Invoice deleted' END;
  SELECT * INTO inv FROM invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  clean := NOT EXISTS (SELECT 1 FROM installment_allocations WHERE invoice_id = _invoice_id)
       AND NOT EXISTS (SELECT 1 FROM invoice_installments WHERE invoice_id = _invoice_id AND status = 'paid')
       AND NOT EXISTS (SELECT 1 FROM income_vouchers WHERE invoice_id = _invoice_id)
       AND NOT EXISTS (SELECT 1 FROM expenses WHERE linked_invoice_id = _invoice_id)
       AND NOT EXISTS (SELECT 1 FROM employee_fund_payments WHERE invoice_id = _invoice_id)
       AND NOT EXISTS (SELECT 1 FROM invoice_payouts WHERE invoice_id = _invoice_id AND (status IN ('requested','paid') OR source='employee_fund'));
  IF clean THEN
    DELETE FROM invoices WHERE id = _invoice_id;
    INSERT INTO fund_audit_logs(user_id,action,record_type,record_id,reason) VALUES (auth.uid(),'invoice_deleted','invoice',_invoice_id,r);
    RETURN 'deleted';
  END IF;
  UPDATE employee_fund_payments SET status = 'cancelled', cancel_reason = 'Invoice deleted: ' || r
   WHERE status NOT IN ('paid','cancelled')
     AND (invoice_id = _invoice_id OR allocation_id IN (SELECT id FROM installment_allocations WHERE invoice_id = _invoice_id));
  FOR a IN SELECT id FROM installment_allocations WHERE invoice_id = _invoice_id AND status = 'active' LOOP
    PERFORM public.reverse_installment_allocation(a.id, 'Invoice deleted: ' || r);
  END LOOP;
  DELETE FROM installment_allocation_failures WHERE installment_id IN (SELECT id FROM invoice_installments WHERE invoice_id = _invoice_id);
  UPDATE invoices SET status = 'void', archived_at = now(), archived_by = auth.uid(), archive_reason = r, fund_ledger_mode = true WHERE id = _invoice_id;
  UPDATE invoice_installments SET status = 'cancelled' WHERE invoice_id = _invoice_id AND status <> 'cancelled';
  UPDATE invoices SET fund_ledger_mode = inv.fund_ledger_mode, status = 'void', paid_amount = 0 WHERE id = _invoice_id;
  UPDATE invoice_payouts SET status = 'cancelled', updated_at = now()
   WHERE invoice_id = _invoice_id AND source = 'invoice' AND status IN ('locked','available','requested');
  IF inv.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoices WHERE project_id = inv.project_id AND id <> _invoice_id AND archived_at IS NULL AND status <> 'void') THEN
    UPDATE client_project_finance SET payment_status = 'not_invoiced', updated_at = now(), updated_by = auth.uid()
     WHERE project_id = inv.project_id AND task_id IS NULL;
  END IF;
  INSERT INTO fund_audit_logs(user_id,action,record_type,record_id,reason,next)
  VALUES (auth.uid(),'invoice_archived','invoice',_invoice_id,r,jsonb_build_object('slug',inv.slug,'previous_status',inv.status,'total',inv.total_amount));
  RETURN 'archived';
END $function$;

REVOKE ALL ON FUNCTION public.materialize_employee_plan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.efp_wallet_credit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_invoice(uuid, text) TO authenticated, service_role;