-- 1. Safe code formatting (never truncates)
CREATE OR REPLACE FUNCTION public.code_pad(_n bigint, _w int)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN length(_n::text) >= _w THEN _n::text ELSE lpad(_n::text, _w, '0') END
$$;

CREATE SEQUENCE IF NOT EXISTS public.lead_slug_seq;
SELECT setval('public.lead_slug_seq', GREATEST(COALESCE((SELECT MAX((substring(slug from 'BTL-(\d+)'))::int) FROM public.leads WHERE slug ~ '^BTL-\d+$'), 0), 1));

CREATE OR REPLACE FUNCTION public.assign_lead_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    LOOP
      n := nextval('public.lead_slug_seq');
      NEW.slug := 'BTL-' || public.code_pad(n, 2);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leads WHERE slug = NEW.slug);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_invoice_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    LOOP
      n := nextval('public.invoice_slug_seq');
      NEW.slug := 'BT-' || public.code_pad(n, 2);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invoices WHERE slug = NEW.slug);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_expense_voucher_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ym text; nxt int;
BEGIN
  IF NEW.voucher_no IS NOT NULL AND NEW.voucher_no <> '' THEN RETURN NEW; END IF;
  ym := to_char(COALESCE(NEW.spent_on, CURRENT_DATE), 'YYMM');
  PERFORM pg_advisory_xact_lock(hashtext('EXP-' || ym));
  SELECT COALESCE(MAX((regexp_replace(voucher_no, '^EXP-\d{4}-', ''))::int), 0) + 1 INTO nxt
    FROM public.expenses WHERE voucher_no ~ ('^EXP-' || ym || '-\d+$');
  NEW.voucher_no := 'EXP-' || ym || '-' || public.code_pad(nxt, 3);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_income_voucher_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ym text; nxt int;
BEGIN
  IF NEW.voucher_no IS NOT NULL AND NEW.voucher_no <> '' THEN RETURN NEW; END IF;
  ym := to_char(COALESCE(NEW.received_on, CURRENT_DATE), 'YYMM');
  PERFORM pg_advisory_xact_lock(hashtext('INC-' || ym));
  SELECT COALESCE(MAX((regexp_replace(voucher_no, '^INC-\d{4}-', ''))::int), 0) + 1 INTO nxt
    FROM public.income_vouchers WHERE voucher_no ~ ('^INC-' || ym || '-\d+$');
  NEW.voucher_no := 'INC-' || ym || '-' || public.code_pad(nxt, 3);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_salary_slip_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ym text; nxt int;
BEGIN
  IF NEW.slip_no IS NOT NULL AND NEW.slip_no <> '' THEN RETURN NEW; END IF;
  ym := to_char(COALESCE(NEW.period_month, CURRENT_DATE), 'YYMM');
  PERFORM pg_advisory_xact_lock(hashtext('SAL-' || ym));
  SELECT COALESCE(MAX((regexp_replace(slip_no, '^SAL-\d{4}-', ''))::int), 0) + 1 INTO nxt
    FROM public.salary_slips WHERE slip_no ~ ('^SAL-' || ym || '-\d+$');
  NEW.slip_no := 'SAL-' || ym || '-' || public.code_pad(nxt, 3);
  RETURN NEW;
END $$;

-- 2. Archive columns
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by uuid, ADD COLUMN IF NOT EXISTS archive_reason text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by uuid, ADD COLUMN IF NOT EXISTS archive_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz, ADD COLUMN IF NOT EXISTS deactivated_by uuid, ADD COLUMN IF NOT EXISTS deactivation_reason text;

-- 3. Atomic installment revert: reverse Fund Ledger allocation, then reset status
CREATE OR REPLACE FUNCTION public.revert_installment_payment(_installment_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'Finance access required'; END IF;
  IF length(coalesce(_reason, '')) < 5 THEN RAISE EXCEPTION 'A reason of at least 5 characters is required'; END IF;
  PERFORM 1 FROM invoice_installments WHERE id = _installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Installment not found'; END IF;
  FOR a IN SELECT id FROM installment_allocations WHERE installment_id = _installment_id AND status = 'active' LOOP
    IF EXISTS (SELECT 1 FROM employee_fund_payments WHERE allocation_id = a.id AND status NOT IN ('draft', 'cancelled')) THEN
      RAISE EXCEPTION 'Employee payments from this installment are already approved or paid. Cancel them in Employee Payments first.';
    END IF;
    UPDATE employee_fund_payments SET status = 'cancelled', cancel_reason = 'Installment payment reverted: ' || _reason
      WHERE allocation_id = a.id AND status = 'draft';
    PERFORM public.reverse_installment_allocation(a.id, _reason);
  END LOOP;
  DELETE FROM installment_allocation_failures WHERE installment_id = _installment_id;
  UPDATE invoice_installments SET status = 'pending', paid_at = NULL, paid_amount = NULL WHERE id = _installment_id;
END $$;

-- 4. Invoice archive (history kept; blocked while money is still allocated)
CREATE OR REPLACE FUNCTION public.archive_invoice(_invoice_id uuid, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE clean boolean;
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) THEN RAISE EXCEPTION 'Finance access required'; END IF;
  IF EXISTS (SELECT 1 FROM installment_allocations WHERE invoice_id = _invoice_id AND status = 'active') THEN
    RAISE EXCEPTION 'This invoice still has money split into the funds. Revert its paid installments first.';
  END IF;
  IF EXISTS (SELECT 1 FROM invoice_payouts WHERE invoice_id = _invoice_id AND status IN ('requested', 'paid')) THEN
    RAISE EXCEPTION 'This invoice has payouts that were already requested or paid, so it cannot be removed.';
  END IF;
  clean := NOT EXISTS (SELECT 1 FROM installment_allocations WHERE invoice_id = _invoice_id)
       AND NOT EXISTS (SELECT 1 FROM invoice_installments WHERE invoice_id = _invoice_id AND status = 'paid')
       AND NOT EXISTS (SELECT 1 FROM income_vouchers WHERE invoice_id = _invoice_id)
       AND NOT EXISTS (SELECT 1 FROM expenses WHERE linked_invoice_id = _invoice_id)
       AND NOT EXISTS (SELECT 1 FROM employee_fund_payments WHERE invoice_id = _invoice_id);
  IF clean THEN
    DELETE FROM invoices WHERE id = _invoice_id;
    RETURN 'deleted';
  END IF;
  UPDATE invoices SET archived_at = now(), archived_by = auth.uid(), archive_reason = _reason WHERE id = _invoice_id;
  RETURN 'archived';
END $$;

-- 5. Employee deactivation (keeps all history)
CREATE OR REPLACE FUNCTION public.deactivate_employee(_user_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot deactivate your own account.'; END IF;
  UPDATE profiles SET deactivated_at = now(), deactivated_by = auth.uid(), deactivation_reason = _reason WHERE user_id = _user_id;
  DELETE FROM user_roles WHERE user_id = _user_id;
  DELETE FROM user_permissions WHERE user_id = _user_id;
END $$;

-- 6. Customer archive
CREATE OR REPLACE FUNCTION public.archive_customer(_customer_id uuid, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_finance_admin(auth.uid()) AND NOT public.has_role(auth.uid(), 'manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE customers SET archived_at = now(), archived_by = auth.uid(), archive_reason = _reason WHERE id = _customer_id;
  RETURN 'archived';
END $$;

REVOKE ALL ON FUNCTION public.revert_installment_payment(uuid, text), public.archive_invoice(uuid, text), public.deactivate_employee(uuid, text), public.archive_customer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_installment_payment(uuid, text), public.archive_invoice(uuid, text), public.deactivate_employee(uuid, text), public.archive_customer(uuid, text) TO authenticated, service_role;