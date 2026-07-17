ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BDT';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_currency_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_currency_check CHECK (currency IN ('BDT','USD'));
  END IF;
END $$;