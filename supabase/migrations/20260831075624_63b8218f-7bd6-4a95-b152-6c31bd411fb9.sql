ALTER TABLE public.salary_slips
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS signed_slip_url text,
  ADD COLUMN IF NOT EXISTS signed_slip_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_slip_by uuid;