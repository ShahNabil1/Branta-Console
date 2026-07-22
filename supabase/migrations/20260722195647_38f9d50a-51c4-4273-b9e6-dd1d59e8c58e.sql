
-- Allow negative amounts on invoice_payouts so we can post revocation/clawback rows
ALTER TABLE public.invoice_payouts DROP CONSTRAINT IF EXISTS invoice_payouts_amount_check;

-- Allow 'clawback' as a manual payout kind
ALTER TABLE public.invoice_payouts DROP CONSTRAINT IF EXISTS invoice_payouts_kind_check;
ALTER TABLE public.invoice_payouts
  ADD CONSTRAINT invoice_payouts_kind_check CHECK (
    kind IS NULL OR kind IN ('salary','bonus','profit_share','reimbursement','adjustment','other','clawback')
  );
