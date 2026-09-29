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
       AND NOT EXISTS (SELECT 1 FROM invoice_payouts WHERE invoice_id = _invoice_id AND status IN ('requested','paid'));
  IF clean THEN
    DELETE FROM invoices WHERE id = _invoice_id;
    INSERT INTO fund_audit_logs(user_id,action,record_type,record_id,reason) VALUES (auth.uid(),'invoice_deleted','invoice',_invoice_id,r);
    RETURN 'deleted';
  END IF;

  -- Unpaid employee fund payments (from its allocations or linked directly) -> cancelled; paid kept as history
  UPDATE employee_fund_payments SET status = 'cancelled', cancel_reason = 'Invoice deleted: ' || r
   WHERE status NOT IN ('paid','cancelled')
     AND (invoice_id = _invoice_id OR allocation_id IN (SELECT id FROM installment_allocations WHERE invoice_id = _invoice_id));

  -- Reverse every active fund allocation (append-only reversal entries)
  FOR a IN SELECT id FROM installment_allocations WHERE invoice_id = _invoice_id AND status = 'active' LOOP
    PERFORM public.reverse_installment_allocation(a.id, 'Invoice deleted: ' || r);
  END LOOP;
  DELETE FROM installment_allocation_failures WHERE installment_id IN (SELECT id FROM invoice_installments WHERE invoice_id = _invoice_id);

  -- Void + archive first so installment triggers keep it void
  UPDATE invoices SET status = 'void', archived_at = now(), archived_by = auth.uid(), archive_reason = r WHERE id = _invoice_id;
  -- Prevent legacy payout regeneration: mark fund_ledger_mode on during installment cancel
  UPDATE invoices SET fund_ledger_mode = true WHERE id = _invoice_id;
  UPDATE invoice_installments SET status = 'cancelled' WHERE invoice_id = _invoice_id AND status <> 'cancelled';
  UPDATE invoices SET fund_ledger_mode = inv.fund_ledger_mode, status = 'void', paid_amount = 0 WHERE id = _invoice_id;

  -- Unpaid legacy stakeholder payouts -> cancelled; paid kept
  UPDATE invoice_payouts SET status = 'cancelled', updated_at = now()
   WHERE invoice_id = _invoice_id AND status IN ('locked','available','requested');

  -- Linked project: reset payment status when no other active invoice remains
  IF inv.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoices WHERE project_id = inv.project_id AND id <> _invoice_id AND archived_at IS NULL AND status <> 'void') THEN
    UPDATE client_project_finance SET payment_status = 'not_invoiced', updated_at = now(), updated_by = auth.uid()
     WHERE project_id = inv.project_id AND task_id IS NULL;
  END IF;

  INSERT INTO fund_audit_logs(user_id,action,record_type,record_id,reason,next)
  VALUES (auth.uid(),'invoice_archived','invoice',_invoice_id,r,jsonb_build_object('slug',inv.slug,'previous_status',inv.status,'total',inv.total_amount));
  RETURN 'archived';
END $function$;
REVOKE ALL ON FUNCTION public.archive_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_invoice(uuid, text) TO authenticated, service_role;