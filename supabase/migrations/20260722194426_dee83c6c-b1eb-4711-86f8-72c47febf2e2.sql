ALTER TABLE public.invoice_payouts
  ALTER COLUMN invoice_id DROP NOT NULL,
  ALTER COLUMN installment_id DROP NOT NULL,
  ALTER COLUMN stakeholder_id DROP NOT NULL;

ALTER TABLE public.invoice_payouts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.invoice_payouts
  DROP CONSTRAINT IF EXISTS invoice_payouts_source_check;
ALTER TABLE public.invoice_payouts
  ADD CONSTRAINT invoice_payouts_source_check CHECK (source IN ('invoice','manual'));

ALTER TABLE public.invoice_payouts
  DROP CONSTRAINT IF EXISTS invoice_payouts_kind_check;
ALTER TABLE public.invoice_payouts
  ADD CONSTRAINT invoice_payouts_kind_check CHECK (
    kind IS NULL OR kind IN ('salary','bonus','profit_share','reimbursement','adjustment','other')
  );

ALTER TABLE public.invoice_payouts
  DROP CONSTRAINT IF EXISTS invoice_payouts_source_refs_check;
ALTER TABLE public.invoice_payouts
  ADD CONSTRAINT invoice_payouts_source_refs_check CHECK (
    (source = 'invoice' AND invoice_id IS NOT NULL AND installment_id IS NOT NULL AND stakeholder_id IS NOT NULL)
    OR (source = 'manual' AND invoice_id IS NULL AND installment_id IS NULL AND stakeholder_id IS NULL AND kind IS NOT NULL)
  );