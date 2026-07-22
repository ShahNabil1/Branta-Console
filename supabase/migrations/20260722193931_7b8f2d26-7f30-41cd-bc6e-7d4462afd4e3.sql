
ALTER TABLE public.company_ledger DROP CONSTRAINT IF EXISTS company_ledger_kind_check;
ALTER TABLE public.company_ledger ADD CONSTRAINT company_ledger_kind_check
  CHECK (kind = ANY (ARRAY['seed'::text, 'other_income'::text, 'adjustment'::text, 'withdrawal_payout'::text]));
