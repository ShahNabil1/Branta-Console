ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS txn_id text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS request_purpose text;

CREATE INDEX IF NOT EXISTS expenses_requested_by_idx ON public.expenses(requested_by);
CREATE INDEX IF NOT EXISTS expenses_department_idx ON public.expenses(department);