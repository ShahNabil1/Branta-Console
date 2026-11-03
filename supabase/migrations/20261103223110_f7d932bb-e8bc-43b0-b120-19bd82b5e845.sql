CREATE OR REPLACE FUNCTION public.assign_invoice_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint; co uuid; p text; holding boolean;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  co := COALESCE(NEW.company_id, (SELECT company_id FROM public.customers WHERE id = NEW.customer_id), public.holding_company_id());
  SELECT is_holding INTO holding FROM public.companies WHERE id = co;
  IF COALESCE(holding, true) THEN
    LOOP
      n := nextval('public.invoice_slug_seq');
      NEW.slug := 'BT-' || public.code_pad(n, 2);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invoices WHERE slug = NEW.slug);
    END LOOP;
    RETURN NEW;
  END IF;
  p := public.company_code_prefix(co, 'invoice', 'INV-');
  PERFORM pg_advisory_xact_lock(hashtext('inv:' || co::text));
  SELECT COALESCE(MAX((substring(slug from length(p) + 1))::bigint), 0) + 1 INTO n
    FROM public.invoices WHERE slug LIKE p || '%' AND substring(slug from length(p) + 1) ~ '^\d+$';
  LOOP
    NEW.slug := p || public.code_pad(n, 2);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invoices WHERE slug = NEW.slug);
    n := n + 1;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_expense_voucher_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ym text; nxt int; co uuid; p text; holding boolean;
BEGIN
  IF NEW.voucher_no IS NOT NULL AND NEW.voucher_no <> '' THEN RETURN NEW; END IF;
  ym := to_char(COALESCE(NEW.spent_on, CURRENT_DATE), 'YYMM');
  co := COALESCE(NEW.company_id, public.holding_company_id());
  SELECT is_holding INTO holding FROM public.companies WHERE id = co;
  p := CASE WHEN COALESCE(holding, true) THEN 'EXP-' ELSE public.company_code_prefix(co, 'expense', 'EXP-') END;
  PERFORM pg_advisory_xact_lock(hashtext(p || ym));
  SELECT COALESCE(MAX((substring(voucher_no from length(p) + 6))::int), 0) + 1 INTO nxt
    FROM public.expenses WHERE voucher_no LIKE p || ym || '-%' AND substring(voucher_no from length(p) + 6) ~ '^\d+$';
  NEW.voucher_no := p || ym || '-' || public.code_pad(nxt, 3);
  RETURN NEW;
END $$;