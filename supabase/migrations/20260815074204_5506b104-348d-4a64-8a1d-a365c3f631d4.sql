ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS voucher_no text,
  ADD COLUMN IF NOT EXISTS signed_voucher_url text,
  ADD COLUMN IF NOT EXISTS signed_voucher_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_voucher_by uuid;

CREATE OR REPLACE FUNCTION public.assign_expense_voucher_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ym text;
  nxt int;
BEGIN
  IF NEW.voucher_no IS NOT NULL AND NEW.voucher_no <> '' THEN
    RETURN NEW;
  END IF;
  ym := to_char(COALESCE(NEW.spent_on, CURRENT_DATE), 'YYMM');
  SELECT COALESCE(MAX((regexp_replace(voucher_no, '^EXP-\d{4}-', ''))::int), 0) + 1
    INTO nxt
    FROM public.expenses
   WHERE voucher_no LIKE 'EXP-' || ym || '-%';
  NEW.voucher_no := 'EXP-' || ym || '-' || lpad(nxt::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_expense_voucher_no ON public.expenses;
CREATE TRIGGER trg_assign_expense_voucher_no
BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.assign_expense_voucher_no();

-- Backfill existing rows deterministically
WITH ordered AS (
  SELECT id,
         to_char(COALESCE(spent_on, created_at::date), 'YYMM') AS ym,
         row_number() OVER (
           PARTITION BY to_char(COALESCE(spent_on, created_at::date), 'YYMM')
           ORDER BY created_at, id
         ) AS rn
  FROM public.expenses
  WHERE voucher_no IS NULL
)
UPDATE public.expenses e
   SET voucher_no = 'EXP-' || o.ym || '-' || lpad(o.rn::text, 3, '0')
  FROM ordered o
 WHERE e.id = o.id;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_voucher_no_key ON public.expenses (voucher_no);